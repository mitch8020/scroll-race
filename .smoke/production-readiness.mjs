import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { EVENTS, createProductionScaleData } from './production-data.mjs'

const BASE_URL =
  process.env.SCROLL_RACE_READINESS_URL ?? 'http://127.0.0.1:20073'
const here = dirname(fileURLToPath(import.meta.url))
const evidenceDirectory = join(here, 'readiness-evidence')
const data = createProductionScaleData()
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  dataProfile: data.profile,
  scenarios: [],
}

mkdirSync(evidenceDirectory, { recursive: true })

const browser = await chromium.launch()
let currentPage = null
let scenarioContexts = []

function today() {
  return new Date().toLocaleDateString('sv')
}

function storageSeed({
  eventFeet = 100,
  name = 'Synthetic Tester',
  pixelsPerInch = 72,
  streak = 7,
  runCount = 42,
} = {}) {
  const storage = {
    'scroll-race-event-v1': String(eventFeet),
    'scroll-race-player-name-v1': name,
    'scroll-race-pixels-per-inch-v1': String(pixelsPerInch),
    'scroll-race-runs-v1': String(runCount),
    'scroll-race-streak-v1': JSON.stringify({
      lastDay: today(),
      streak,
      prevStreak: 0,
      todayBestMs: 3_000,
    }),
  }

  for (const feet of EVENTS) {
    const entries = data.localBoards[feet]

    storage[`scroll-race-leaderboard-v2-${feet}`] = JSON.stringify(entries)
    storage[`scroll-race-pb-v2-${feet}`] = String(entries[0].timeMs)
  }

  return storage
}

async function newPage({
  viewport = { width: 390, height: 844 },
  seed,
  reducedMotion = 'no-preference',
  shareMode,
} = {}) {
  const context = await browser.newContext({ viewport, reducedMotion })

  scenarioContexts.push(context)

  if (seed) {
    await context.addInitScript((items) => {
      for (const [key, value] of Object.entries(items)) {
        localStorage.setItem(key, value)
      }
    }, seed)
  }

  if (shareMode) {
    await context.addInitScript((mode) => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value:
          mode === 'reject'
            ? () => Promise.reject(new Error('Synthetic share failure'))
            : undefined,
      })
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText:
            mode === 'copy'
              ? (text) => {
                  window.__copiedShareText = text

                  return Promise.resolve()
                }
              : () => Promise.reject(new Error('Synthetic clipboard failure')),
        },
      })
    }, shareMode)
  }

  const page = await context.newPage()

  currentPage = page

  return page
}

function wireErrors(page) {
  const errors = []

  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`)
    }
  })

  return errors
}

async function mockLeaderboard(
  page,
  { mode = 'ready', submissions = [], malformedBody } = {},
) {
  await page.route('**/api/leaderboard*', async (route) => {
    const request = route.request()

    if (request.method() === 'POST') {
      submissions.push(request.postDataJSON())
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ rank: 7, total: 125_001 }),
      })

      return
    }

    const eventFeet = Number(
      new URL(request.url()).searchParams.get('event') ?? 100,
    )

    if (mode === 'offline') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic outage' }),
      })

      return
    }

    if (mode === 'empty') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ entries: [], total: 0 }),
      })

      return
    }

    if (mode === 'malformed') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(malformedBody),
      })

      return
    }

    const board = data.boards[eventFeet]

    assert.ok(board, `Fixture board missing for ${eventFeet} ft`)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        entries: board.entries.slice(0, 25),
        total: board.total,
      }),
    })
  })
}

async function goto(page, path = '/') {
  const response = await page.goto(`${BASE_URL}${path}`, {
    waitUntil: 'domcontentloaded',
  })

  assert.equal(response?.status(), 200, `${path} should return HTTP 200`)
  await page.locator('.introScreen').waitFor({ state: 'visible' })
  await page.waitForFunction(
    () =>
      document.querySelector('.boardStatus')?.textContent?.trim() !== 'Syncing',
  )
}

async function expectVisible(locator, message) {
  assert.equal(await locator.isVisible(), true, message)
}

async function screenshot(page, name, options = {}) {
  const path = join(evidenceDirectory, `${name}.png`)

  await page.screenshot({ path, ...options })

  return path
}

async function scenario(id, title, test) {
  const started = performance.now()

  currentPage = null
  scenarioContexts = []

  try {
    const details = await test()

    report.scenarios.push({
      id,
      title,
      status: 'passed',
      durationMs: Math.round(performance.now() - started),
      details,
    })
    console.log(`PASS ${id} ${title}`)
  } catch (error) {
    let evidence = null

    if (currentPage && !currentPage.isClosed()) {
      try {
        evidence = await screenshot(currentPage, `${id}-failure`, {
          fullPage: false,
        })
      } catch {
        evidence = null
      }
    }

    report.scenarios.push({
      id,
      title,
      status: 'failed',
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.stack : String(error),
      evidence,
    })
    console.error(`FAIL ${id} ${title}`)
    console.error(error)
  } finally {
    await Promise.all(
      scenarioContexts.map((context) => context.close().catch(() => {})),
    )
  }
}

async function scrollLegitimateRace(page, eventFeet) {
  const result = await page.evaluate(async (feet) => {
    const sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    const steps = Math.max(Math.ceil(maxScroll / 4_500), 2)
    const delayMs = Math.max(25, Math.ceil((feet * 5 + 800) / (steps - 1)))

    for (let step = 1; step <= steps; step += 1) {
      window.scrollTo(0, Math.round((maxScroll * step) / steps))
      await sleep(delayMs)
    }

    return { delayMs, maxScroll, steps }
  }, eventFeet)

  await page
    .locator('#finish-title')
    .getByText('Finished!')
    .waitFor({
      state: 'visible',
      timeout: eventFeet * 15 + 10_000,
    })

  return result
}

async function startAndSkipCountdown(page) {
  await page
    .getByRole('button', { name: /start race|race again|beat /i })
    .click()
  await expectVisible(
    page.getByText('Get ready'),
    'Starting a race should show the countdown',
  )
  await page.waitForTimeout(300)
  await page.keyboard.press('Enter')
  await page.locator('main[data-status="racing"]').waitFor()
}

await scenario('PR-HTTP-01', 'production assets and metadata', async () => {
  const [home, manifest, robots, favicon] = await Promise.all([
    fetch(`${BASE_URL}/`),
    fetch(`${BASE_URL}/manifest.json`),
    fetch(`${BASE_URL}/robots.txt`),
    fetch(`${BASE_URL}/favicon.ico`),
  ])
  const html = await home.text()
  const manifestBody = await manifest.json()

  assert.equal(home.status, 200)
  assert.equal(manifest.status, 200)
  assert.equal(robots.status, 200)
  assert.equal(favicon.status, 200)
  assert.match(html, /<meta name="description"/)
  assert.match(html, /rel="manifest"/)
  assert.equal(manifestBody.name, 'Scroll Race')

  return {
    statuses: {
      favicon: favicon.status,
      home: home.status,
      manifest: manifest.status,
      robots: robots.status,
    },
  }
})

await scenario(
  'PR-UI-01',
  'fresh desktop inventory and scale board',
  async () => {
    const page = await newPage({ viewport: { width: 1440, height: 900 } })
    const errors = wireErrors(page)

    await mockLeaderboard(page)
    await goto(page)

    assert.equal(
      await page.title(),
      'Scroll Race — how fast can you scroll 100 feet?',
    )
    assert.equal(await page.getByRole('dialog').count(), 1)
    assert.equal(
      await page.getByRole('dialog').getAttribute('aria-modal'),
      'true',
      'The blocking intro dialog must identify itself as modal',
    )
    assert.equal(
      await page.locator('.raceCourse').getAttribute('aria-hidden'),
      'true',
      'The inactive race course must be hidden from assistive technology',
    )
    assert.equal(
      await page.getByRole('radio').count(),
      4,
      'All four events should be exposed as radios',
    )
    await expectVisible(
      page.getByRole('button', { name: 'Start race' }),
      'Start control should be visible',
    )
    await expectVisible(
      page.getByRole('button', { name: 'Calibrate' }),
      'Calibration control should be visible',
    )
    assert.equal(await page.getByRole('button', { name: 'Sound' }).count(), 1)
    assert.equal(await page.getByRole('button', { name: 'World' }).count(), 1)
    assert.equal(
      await page.getByRole('button', { name: 'This device' }).count(),
      1,
    )
    assert.equal(await page.locator('.leaderboardList > li').count(), 10)
    await expectVisible(
      page.getByText('125,000 runs worldwide'),
      'Production-scale total should be rendered',
    )
    assert.equal(
      await page
        .getByRole('navigation', { name: 'Creator links' })
        .getByRole('link')
        .count(),
      5,
    )

    const linkSafety = await page
      .getByRole('navigation', { name: 'Creator links' })
      .getByRole('link')
      .evaluateAll((links) =>
        links.map((link) => ({
          rel: link.getAttribute('rel'),
          target: link.getAttribute('target'),
        })),
      )

    assert.ok(
      linkSafety.every(
        ({ rel, target }) => rel === 'noreferrer' && target === '_blank',
      ),
      'Every external creator link should isolate the opener',
    )

    const layout = await page.evaluate(() => ({
      bodyOverflow: document.body.style.overflow,
      documentOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
      titleOverflow:
        document.querySelector('.introTitle').getBoundingClientRect().right >
        window.innerWidth + 1,
    }))

    assert.equal(layout.bodyOverflow, 'hidden')
    assert.equal(layout.documentOverflow, false)
    assert.equal(layout.titleOverflow, false)
    assert.deepEqual(errors, [])

    const evidence = await screenshot(page, 'desktop-scale-board')

    return { evidence, layout, worldRows: 10 }
  },
)

await scenario(
  'PR-UI-02',
  'keyboard, calibration, sound, and persistence',
  async () => {
    const page = await newPage()
    const errors = wireErrors(page)

    await mockLeaderboard(page)
    await goto(page)

    const sprint = page.getByRole('radio', { name: /100 ft/i })

    await sprint.focus()
    await page.keyboard.press('End')
    assert.equal(
      await page
        .getByRole('radio', { name: /1000 ft/i })
        .getAttribute('aria-checked'),
      'true',
    )
    await page.keyboard.press('Home')
    assert.equal(await sprint.getAttribute('aria-checked'), 'true')

    await page.getByRole('button', { name: 'Calibrate' }).click()
    assert.equal(
      await page
        .getByRole('button', { name: 'Calibrate' })
        .getAttribute('aria-expanded'),
      'true',
    )
    await page.getByRole('spinbutton', { name: 'Pixels per inch' }).fill('180')
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem('scroll-race-pixels-per-inch-v1'),
      ),
      '180',
    )
    await page.getByRole('button', { name: 'Reset' }).click()
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem('scroll-race-pixels-per-inch-v1'),
      ),
      '96',
    )

    const sound = page.getByRole('button', { name: 'Sound' })

    assert.equal(await sound.getAttribute('aria-pressed'), 'true')
    await sound.click()
    assert.equal(await sound.getAttribute('aria-pressed'), 'false')
    assert.equal(
      await page.evaluate(() => localStorage.getItem('scroll-race-muted-v1')),
      '1',
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.introScreen').waitFor()
    await page.waitForFunction(
      () =>
        document.querySelector('.soundToggle')?.getAttribute('aria-pressed') ===
        'false',
    )
    assert.equal(
      await page
        .getByRole('button', { name: 'Sound' })
        .getAttribute('aria-pressed'),
      'false',
    )
    assert.deepEqual(errors, [])

    return { persistedCalibration: 96, persistedMuted: true }
  },
)

await scenario(
  'PR-UI-03',
  'returning racer local data at every cap',
  async () => {
    const page = await newPage({
      seed: storageSeed({ eventFeet: 500 }),
      viewport: { width: 1280, height: 800 },
    })
    const errors = wireErrors(page)

    await mockLeaderboard(page)
    await goto(page)

    assert.equal(
      await page
        .getByRole('radio', { name: /500 ft/i })
        .getAttribute('aria-checked'),
      'true',
    )
    await expectVisible(page.getByText('400,062 runs worldwide'))
    await page.getByRole('button', { name: 'This device' }).click()
    assert.equal(await page.locator('.leaderboardList > li').count(), 10)
    assert.equal(
      await page.locator('.leaderboardPlayer').first().textContent(),
      'Synthetic 013',
    )
    await expectVisible(page.getByText('🔥 7'))
    await page.getByRole('radio', { name: /250 ft/i }).click()
    assert.equal(
      await page.evaluate(() => localStorage.getItem('scroll-race-event-v1')),
      '250',
    )
    assert.equal(await page.locator('.leaderboardList > li').count(), 10)
    assert.deepEqual(errors, [])

    return {
      localRowsPerEvent: data.profile.localEntriesPerEvent,
      selectedEventPersisted: 250,
    }
  },
)

await scenario(
  'PR-ROUTE-01',
  'challenge and malformed search routes',
  async () => {
    const page = await newPage()

    await mockLeaderboard(page)
    await goto(page, '/?beat=12300&event=250&by=Alice%20%3Cscript%3E')
    await expectVisible(page.getByText('Challenge received'))
    await expectVisible(page.getByText(/Alice script/))
    assert.equal(
      await page
        .getByRole('radio', { name: /250 ft/i })
        .getAttribute('aria-checked'),
      'true',
    )

    const challengeUrl = page.url()

    await page.getByRole('radio', { name: /250 ft/i }).click()
    assert.equal(
      page.url(),
      challengeUrl,
      'Re-clicking the event keeps challenge',
    )
    await page.getByRole('radio', { name: /500 ft/i }).click()
    await page.waitForFunction(() => location.search === '')
    assert.equal(new URL(page.url()).search, '')
    assert.equal(await page.getByText('Challenge received').count(), 0)

    await page.goto(`${BASE_URL}/?beat=499&event=999&by=%3Cscript%3E`, {
      waitUntil: 'domcontentloaded',
    })
    await page.locator('.introScreen').waitFor()
    assert.equal(await page.getByText('Challenge received').count(), 0)
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="radio"][aria-checked="true"] strong')
          ?.textContent?.trim() === '500 ft',
    )
    assert.equal(
      await page
        .getByRole('radio', { name: /500 ft/i })
        .getAttribute('aria-checked'),
      'true',
      'Malformed event input should fall back to the last valid local event',
    )

    return { challengeClearedOnEventChange: true, malformedRejected: true }
  },
)

await scenario(
  'PR-BOARD-01',
  'empty, offline, and hostile board responses',
  async () => {
    const empty = await newPage()

    await mockLeaderboard(empty, { mode: 'empty' })
    await goto(empty)
    await expectVisible(empty.getByText('The world record is wide open.'))

    const offline = await newPage({ seed: storageSeed() })

    await mockLeaderboard(offline, { mode: 'offline' })
    await goto(offline)
    await expectVisible(
      offline.getByText('World board unreachable — showing this device.'),
    )
    assert.equal(await offline.locator('.leaderboardList > li').count(), 10)

    const hostile = await newPage()
    const malformedBody = {
      entries: [
        {
          id: 'negative',
          name: 'Negative',
          timeMs: -10,
          eventFeet: 100,
          device: 'iPhone',
        },
        {
          id: 'wrong-event',
          name: 'Wrong Event',
          timeMs: 2_900,
          eventFeet: 250,
          device: 'Android',
        },
        {
          id: 'slow',
          name: '<script>Slow</script>',
          timeMs: 3_500,
          eventFeet: 100,
          device: 'A device label that is much too long',
          country: 'usa',
        },
        {
          id: 'fast',
          name: 'Fast',
          timeMs: 2_800,
          eventFeet: 100,
          device: 'Mac',
          country: 'US',
        },
      ],
      total: -50,
    }

    await mockLeaderboard(hostile, { mode: 'malformed', malformedBody })
    await goto(hostile)

    const names = await hostile.locator('.leaderboardPlayer').allTextContents()
    const times = await hostile.locator('.leaderboardTime').allTextContents()

    assert.deepEqual(names, ['Fast', 'scriptSlowscript'])
    assert.match(times[0], /^2\.80s/)
    assert.match(times[1], /^3\.50s/)
    await expectVisible(hostile.getByText('2 runs worldwide'))

    return {
      emptyFallback: true,
      hostileRowsAccepted: names.length,
      offlineLocalRows: 10,
    }
  },
)

await scenario(
  'PR-RESP-01',
  'narrow mobile and wide desktop layouts',
  async () => {
    const measurements = []

    for (const viewport of [
      { width: 320, height: 700 },
      { width: 1440, height: 900 },
    ]) {
      const page = await newPage({ viewport })

      await mockLeaderboard(page)
      await goto(page)
      await page.waitForTimeout(900)

      const layout = await page.evaluate(() => ({
        documentOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
        introCanScroll:
          document.querySelector('.introScreen').scrollHeight >
          document.querySelector('.introScreen').clientHeight,
        startVisible: Boolean(
          document.querySelector('.startBtn').getBoundingClientRect().height,
        ),
        titleOverflow:
          document.querySelector('.introTitle').getBoundingClientRect().right >
          window.innerWidth + 1,
      }))

      assert.equal(layout.documentOverflow, false)
      assert.equal(layout.startVisible, true)
      assert.equal(layout.titleOverflow, false)
      measurements.push({ viewport, ...layout })
      await screenshot(page, `responsive-${viewport.width}`)
    }

    return { measurements }
  },
)

await scenario(
  'PR-RACE-01',
  'eligible race workflow on every event',
  async () => {
    const submissions = []
    const page = await newPage({
      seed: storageSeed({ eventFeet: 100, pixelsPerInch: 72 }),
    })
    const errors = wireErrors(page)

    await mockLeaderboard(page, { submissions })
    await goto(page)

    for (const eventFeet of EVENTS) {
      await page
        .getByRole('radio', { name: new RegExp(`^${eventFeet} ft`) })
        .click()
      await startAndSkipCountdown(page)

      await expectVisible(
        page.getByRole('timer', { name: 'Elapsed time' }),
        'Racing HUD should expose the timer',
      )
      assert.equal(
        await page.locator('.raceCourse').getAttribute('aria-hidden'),
        null,
        'Active course should be exposed during the race',
      )

      if (eventFeet === 100) {
        await page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight * 0.15),
        )
        await page.waitForTimeout(350)
        await expectVisible(
          page.locator('.paceGhost'),
          'A returning racer should see the PB ghost',
        )
        await expectVisible(
          page.locator('.deltaChip'),
          'A returning racer should see the PB delta',
        )
        await page.getByRole('button', { name: 'Restart' }).click()
        await expectVisible(page.getByText('Get ready'))
        assert.equal(await page.evaluate(() => window.scrollY), 0)
        await page.waitForTimeout(300)
        await page.keyboard.press('Enter')
        await page.locator('main[data-status="racing"]').waitFor()
      }

      const race = await scrollLegitimateRace(page, eventFeet)

      assert.equal(await page.locator('.windStamp').count(), 0)
      await page.locator('.savedNote').waitFor()
      assert.match(await page.locator('.savedNote').textContent(), /worldwide/)
      assert.equal(
        await page
          .locator('#finish-title')
          .evaluate((element) => document.activeElement === element),
        true,
        'Finish heading should receive focus',
      )
      assert.equal(await page.locator('.funFacts li').count(), 3)
      assert.equal(
        await page.evaluate(
          (feet) =>
            JSON.parse(
              localStorage.getItem(`scroll-race-leaderboard-v2-${feet}`),
            ).length,
          eventFeet,
        ),
        10,
        'Local boards stay capped at ten entries',
      )

      if (eventFeet === 100 || eventFeet === 1000) {
        await screenshot(page, `finish-${eventFeet}`)
      }

      if (eventFeet !== EVENTS.at(-1)) {
        await page.getByRole('button', { name: 'Back to the start' }).click()
        await page.locator('.introScreen').waitFor()
      }

      assert.ok(race.steps >= 2)
    }

    assert.deepEqual(
      submissions.map((submission) => submission.eventFeet),
      EVENTS,
    )
    assert.ok(
      submissions.every(
        (submission) =>
          submission.name === 'Synthetic Tester' &&
          submission.splitsMs.length === 101 &&
          submission.timeMs >= submission.eventFeet * 5,
      ),
      'Every world submission should be named, complete, and eligible',
    )
    assert.deepEqual(errors, [])

    return {
      eventsCompleted: EVENTS,
      submissions: submissions.length,
    }
  },
)

await scenario(
  'PR-SHARE-01',
  'share failure fallback and fresh save/edit',
  async () => {
    const submissions = []
    const page = await newPage({ shareMode: 'reject' })
    const errors = wireErrors(page)

    await mockLeaderboard(page, { submissions })
    await goto(page)
    await startAndSkipCountdown(page)
    await scrollLegitimateRace(page, 100)

    await expectVisible(
      page.getByRole('textbox', { name: 'Name for leaderboard' }),
      'Fresh racers should get the save form',
    )
    await page.getByRole('button', { name: 'Share this run' }).click()
    await expectVisible(
      page.getByRole('textbox', { name: /Share text/ }),
      'A failed native share should expose copyable text',
    )
    assert.match(
      await page.getByRole('textbox', { name: /Share text/ }).inputValue(),
      /Beat me: .*beat=/,
    )

    await page
      .getByRole('textbox', { name: 'Name for leaderboard' })
      .fill('Fresh Racer')
    await page.getByRole('button', { name: 'Save time' }).click()
    await page.locator('.savedNote').waitFor()
    assert.equal(submissions.length, 1)
    await page.getByRole('button', { name: 'Not Fresh Racer?' }).click()
    await page
      .getByRole('textbox', { name: 'Name for leaderboard' })
      .fill('Corrected Racer')
    await page.getByRole('button', { name: 'Update name' }).click()
    await expectVisible(page.getByText('Corrected Racer', { exact: true }))
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem('scroll-race-player-name-v1'),
      ),
      'Corrected Racer',
    )
    assert.deepEqual(errors, [])

    return {
      correctedLocally: true,
      nativeShareFailureRecovered: true,
      worldSubmissions: submissions.length,
    }
  },
)

await scenario('PR-SHARE-02', 'clipboard share success feedback', async () => {
  const page = await newPage({ shareMode: 'copy' })

  await mockLeaderboard(page)
  await goto(page)
  await startAndSkipCountdown(page)
  await scrollLegitimateRace(page, 100)
  await page.getByRole('button', { name: 'Share this run' }).click()
  await expectVisible(page.getByText('Copied — go intimidate someone.'))
  assert.match(
    await page.evaluate(() => window.__copiedShareText),
    /SCROLL RACE/,
  )

  return { copiedFeedback: true }
})

await scenario('PR-WIND-01', 'wind-assisted ineligible workflow', async () => {
  const submissions = []
  const page = await newPage({ shareMode: 'reject' })

  await mockLeaderboard(page, { submissions })
  await goto(page)
  await startAndSkipCountdown(page)
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  )
  await page.getByText('WIND-ASSISTED ✱').waitFor()
  await expectVisible(page.getByRole('button', { name: 'Not eligible' }))
  assert.equal(
    await page.getByRole('button', { name: 'Not eligible' }).isDisabled(),
    true,
  )
  assert.equal(submissions.length, 0)
  await page.getByRole('button', { name: 'Share this run' }).click()
  await expectVisible(page.getByRole('textbox', { name: /Share text/ }))
  assert.match(
    await page.getByRole('textbox', { name: /Share text/ }).inputValue(),
    /cheated.*asterisk/s,
  )
  await screenshot(page, 'wind-assisted')

  return { blockedFromBoards: true, shareSelfReports: true }
})

await scenario('PR-MOTION-01', 'reduced-motion race workflow', async () => {
  const page = await newPage({
    reducedMotion: 'reduce',
    seed: storageSeed({ pixelsPerInch: 72 }),
  })

  await mockLeaderboard(page)
  await goto(page)
  await startAndSkipCountdown(page)
  assert.equal(await page.locator('.speedLines').count(), 0)
  await scrollLegitimateRace(page, 100)
  assert.equal(await page.locator('.confettiCanvas').count(), 0)
  assert.equal(await page.locator('.windStamp').count(), 0)

  return { confettiSuppressed: true, speedLinesSuppressed: true }
})

report.finishedAt = new Date().toISOString()
report.summary = {
  failed: report.scenarios.filter((item) => item.status === 'failed').length,
  passed: report.scenarios.filter((item) => item.status === 'passed').length,
  total: report.scenarios.length,
}

const reportPath = join(evidenceDirectory, 'report.json')

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
await browser.close()

console.log(`Readiness report: ${reportPath}`)
console.log(JSON.stringify(report.summary))

if (report.summary.failed > 0) {
  process.exitCode = 1
}
