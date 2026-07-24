import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const OUT = join(fileURLToPath(new URL('./shots/', import.meta.url)), '/')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const errors = []
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('/api/leaderboard'))
    errors.push(`console.error: ${m.text()}`)
})

// Mock the API so we can see the populated world board.
await page.route('**/api/leaderboard*', async (route) => {
  const req = route.request()
  if (req.method() === 'GET') {
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
            name: 'JP',
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

await page.goto('http://localhost:3000/')
await page.waitForTimeout(1600)
await page.screenshot({ path: OUT + 'board-world.png', fullPage: false })
// Scroll the intro to show the board
await page.evaluate(() => {
  document.querySelector('.introBoard')?.scrollIntoView({ block: 'center' })
})
await page.waitForTimeout(400)
await page.screenshot({ path: OUT + 'board-world-panel.png' })

// Device tab
await page.getByRole('button', { name: /this device/i }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: OUT + 'board-device-panel.png' })

// Race + save → worldwide rank in savedNote
await page.getByRole('button', { name: /start race|race again/i }).click()
await page.waitForTimeout(2400)
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight
  const step = window.innerHeight * 4
  let y = 0
  while (y < maxScroll) {
    y = Math.min(y + step, maxScroll)
    window.scrollTo(0, y)
    await sleep(50)
  }
  await sleep(300)
})
await page.waitForTimeout(900)
await page.locator('#player-name').fill('JP')
await page.getByRole('button', { name: /save time/i }).click()
await page.waitForTimeout(800)
const savedNote = await page.evaluate(
  () => document.querySelector('.savedNote')?.textContent ?? null,
)
console.log('savedNote:', JSON.stringify(savedNote))
await page.screenshot({ path: OUT + 'board-saved-rank.png' })

// Unreachable-API fallback: new context without the mock
const fallback = await browser.newPage({
  viewport: { width: 390, height: 844 },
})
await fallback.route('**/api/leaderboard*', (route) => route.abort())
await fallback.goto('http://localhost:3000/')
await fallback.waitForTimeout(1600)
const note = await fallback.evaluate(
  () => document.querySelector('.boardNote')?.textContent ?? null,
)
console.log('fallback note:', JSON.stringify(note))
await fallback.close()

console.log('errors:', JSON.stringify(errors, null, 2))
await browser.close()
