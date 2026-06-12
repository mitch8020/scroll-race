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
  if (
    m.type() === 'error' &&
    !m.text().includes('/api/leaderboard') &&
    !m.text().includes('net::ERR_FAILED')
  )
    errors.push(`console.error: ${m.text()}`)
})
await page.route('**/api/leaderboard*', (route) => route.abort())

await page.goto('http://localhost:3000/')
await page.waitForTimeout(1400)
await page.getByRole('button', { name: /start race/i }).click()
await page.waitForTimeout(2400)

// Scroll to ~96%: the tape must be visible and INTACT below the panel zone.
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight
  const step = window.innerHeight * 4
  const target = maxScroll * 0.965
  let y = 0
  while (y < target) {
    y = Math.min(y + step, target)
    window.scrollTo(0, y)
    await sleep(45)
  }
  // 120px shy of the line: the tape is on screen but uncrossed.
  window.scrollTo(0, maxScroll - 120)
  await sleep(120)
})
await page.waitForTimeout(250)
await page.screenshot({ path: OUT + 'v5-tape-approach.png' })

// Cross the line, let the snap + shards finish, then inspect the bottom.
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight
  let y = window.scrollY
  while (y < maxScroll) {
    y = Math.min(y + window.innerHeight * 4, maxScroll)
    window.scrollTo(0, y)
    await sleep(45)
  }
})
await page.waitForTimeout(1800)
await page.screenshot({ path: OUT + 'v5-finish-full.png' })
const vh = 844
await page.screenshot({
  path: OUT + 'v5-finish-bottom.png',
  clip: { x: 0, y: vh - 140, width: 390, height: 140 },
})

const tapeState = await page.evaluate(() => {
  const halves = [...document.querySelectorAll('.tapeHalf')].map((el) => {
    const cs = getComputedStyle(el)
    return { opacity: cs.opacity, transform: cs.transform }
  })
  return halves
})
console.log('tape end state:', JSON.stringify(tapeState))
console.log('errors:', JSON.stringify(errors, null, 2))
await browser.close()
