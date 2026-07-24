import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const OUT = join(fileURLToPath(new URL('./shots/', import.meta.url)), '/')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const errors = []

const mockBoard = async (page) => {
  await page.route('**/api/leaderboard*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          entries: [
            {
              id: '1',
              name: 'Turbo Thumb',
              timeMs: 2310,
              eventFeet: 100,
              device: 'iPhone',
              ppi: 180,
              country: 'US',
              completedAt: '',
            },
            {
              id: '2',
              name: 'JP Mitra',
              timeMs: 2980,
              eventFeet: 100,
              device: 'Android',
              ppi: 96,
              country: 'KR',
              completedAt: '',
            },
            {
              id: '3',
              name: 'Wobbly Gazelle',
              timeMs: 3450,
              eventFeet: 100,
              device: 'Mac',
              ppi: 96,
              country: 'DE',
              completedAt: '',
            },
            {
              id: '4',
              name: 'Sneaky Ferret',
              timeMs: 4810,
              eventFeet: 100,
              device: 'Windows',
              ppi: 110,
              country: 'BR',
              completedAt: '',
            },
            {
              id: '5',
              name: 'Mild Comet',
              timeMs: 5125,
              eventFeet: 100,
              device: 'iPhone',
              ppi: 160,
              country: 'JP',
              completedAt: '',
            },
            {
              id: '6',
              name: 'Rogue Swift',
              timeMs: 5680,
              eventFeet: 100,
              device: 'Android',
              ppi: 120,
              country: 'FR',
              completedAt: '',
            },
          ],
          total: 1287,
        }),
      })
    } else {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ rank: 2, total: 1288 }),
      })
    }
  })
}

const wire = (page) => {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('/api/leaderboard'))
      errors.push(`console.error: ${m.text()}`)
  })
}

// --- Mobile 390: title, utility row, board, footer -------------------------
const mob = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})
wire(mob)
await mockBoard(mob)
await mob.goto('http://localhost:3000/')
await mob.waitForTimeout(1600)
await mob.screenshot({ path: OUT + 'v4-mob-top.png' })

// Title must be a single line
const titleBox = await mob.evaluate(() => {
  const title = document.querySelector('.introTitle')
  const lines = [...title.querySelectorAll('.titleLine')].map(
    (el) => el.getBoundingClientRect().top,
  )
  const rect = title.getBoundingClientRect()
  return {
    sameTop: Math.abs(lines[0] - lines[1]) < 2,
    right: rect.right,
    vw: window.innerWidth,
    overflows: rect.right > window.innerWidth,
  }
})
console.log('mob title:', JSON.stringify(titleBox))

await mob.evaluate(() =>
  document.querySelector('.utilityRow')?.scrollIntoView({ block: 'center' }),
)
await mob.waitForTimeout(300)
await mob.screenshot({ path: OUT + 'v4-mob-utility.png' })

await mob.evaluate(() =>
  document.querySelector('.introBoard')?.scrollIntoView({ block: 'center' }),
)
await mob.waitForTimeout(400)
await mob.screenshot({ path: OUT + 'v4-mob-board.png' })

await mob.getByRole('button', { name: /this device/i }).click()
await mob.waitForTimeout(300)
await mob.screenshot({ path: OUT + 'v4-mob-board-device.png' })
await mob.getByRole('button', { name: /world/i }).click()

await mob.evaluate(() =>
  document.querySelector('.siteFooter')?.scrollIntoView({ block: 'center' }),
)
await mob.waitForTimeout(300)
await mob.screenshot({ path: OUT + 'v4-mob-footer.png' })

// Start button region (no white halo anymore — capture for review)
await mob.evaluate(() =>
  document.querySelector('.startBtn')?.scrollIntoView({ block: 'center' }),
)
await mob.waitForTimeout(300)
await mob.screenshot({ path: OUT + 'v4-mob-cta.png' })
await mob.close()

// --- Narrow 320: title still one line ---------------------------------------
const narrow = await browser.newPage({ viewport: { width: 320, height: 700 } })
wire(narrow)
await mockBoard(narrow)
await narrow.goto('http://localhost:3000/')
await narrow.waitForTimeout(1400)
const narrowTitle = await narrow.evaluate(() => {
  const title = document.querySelector('.introTitle')
  const lines = [...title.querySelectorAll('.titleLine')].map(
    (el) => el.getBoundingClientRect().top,
  )
  const rect = title.getBoundingClientRect()
  return {
    sameTop: Math.abs(lines[0] - lines[1]) < 2,
    right: Math.round(rect.right),
    vw: window.innerWidth,
    overflows: rect.right > window.innerWidth,
  }
})
console.log('320 title:', JSON.stringify(narrowTitle))
await narrow.screenshot({ path: OUT + 'v4-320-top.png' })
await narrow.evaluate(() =>
  document.querySelector('.introBoard')?.scrollIntoView({ block: 'center' }),
)
await narrow.waitForTimeout(300)
await narrow.screenshot({ path: OUT + 'v4-320-board.png' })
await narrow.close()

// --- Desktop 1280 ------------------------------------------------------------
const desk = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
})
wire(desk)
await mockBoard(desk)
await desk.goto('http://localhost:3000/')
await desk.waitForTimeout(1600)
await desk.screenshot({ path: OUT + 'v4-desk.png' })
await desk.evaluate(() =>
  document.querySelector('.siteFooter')?.scrollIntoView({ block: 'end' }),
)
await desk.waitForTimeout(300)
await desk.screenshot({ path: OUT + 'v4-desk-footer.png' })

// Sound toggle works and swaps icon
const pressedBefore = await desk
  .locator('.soundToggle')
  .getAttribute('aria-pressed')
await desk.locator('.soundToggle').click()
const pressedAfter = await desk
  .locator('.soundToggle')
  .getAttribute('aria-pressed')
console.log('sound toggle:', pressedBefore, '->', pressedAfter)

// Calibrate opens
await desk.locator('.calibrateToggle').click()
await desk.waitForTimeout(250)
await desk.screenshot({ path: OUT + 'v4-desk-calibrate-open.png' })

console.log('errors:', JSON.stringify(errors, null, 2))
await browser.close()
