import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const OUT = join(fileURLToPath(new URL('./shots/', import.meta.url)), '/')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const errors = []

async function newPage(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  return page
}

// 1. Intro — mobile
let page = await newPage({ width: 390, height: 844 })
await page.goto('http://localhost:3000/')
await page.waitForTimeout(1600)
await page.screenshot({ path: OUT + 'intro-mobile.png' })

// 2. Intro — desktop
let desktop = await newPage({ width: 1380, height: 900 })
await desktop.goto('http://localhost:3000/')
await desktop.waitForTimeout(1600)
await desktop.screenshot({ path: OUT + 'intro-desktop.png' })
await desktop.close()

// 3. Challenge slip
let chal = await newPage({ width: 390, height: 844 })
await chal.goto('http://localhost:3000/?beat=4203&by=JP')
await chal.waitForTimeout(1600)
await chal.screenshot({ path: OUT + 'intro-challenge.png' })
await chal.close()

// 4. Countdown
await page.getByRole('button', { name: /start race/i }).click()
await page.waitForTimeout(350)
await page.screenshot({ path: OUT + 'countdown.png' })

// 5. Race legitimately: wait for GO (countdown 3 beats = 2250ms), then scroll
// in sub-threshold steps over ~2.5s.
await page.waitForTimeout(2300)
await page.screenshot({ path: OUT + 'go-flash.png' })
const result = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight
  const step = window.innerHeight * 4 // below the 6x teleport threshold
  let y = 0
  while (y < maxScroll) {
    y = Math.min(y + step, maxScroll)
    window.scrollTo(0, y)
    await sleep(50)
  }
  await sleep(400)
  return { maxScroll, finalY: window.scrollY }
})
console.log('race scroll:', JSON.stringify(result))
await page.waitForTimeout(900)
await page.screenshot({ path: OUT + 'finish-panel.png' })

// 6. Mid-race speed-lines shot on a fresh run via Run it back
const runBack = page.getByRole('button', { name: /run it back|one more/i })
if (await runBack.count()) {
  await runBack.click()
  await page.waitForTimeout(150)
  await page.evaluate(() => window.dispatchEvent(new Event('pointerdown'))) // skip countdown
  await page.waitForTimeout(250)
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const step = window.innerHeight * 4
    for (let i = 0; i < 6; i++) {
      window.scrollTo(0, window.scrollY + step)
      await sleep(40)
    }
  })
  await page.screenshot({ path: OUT + 'mid-race.png' })
  // finish it via teleport → wind-assisted panel
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
  await page.waitForTimeout(900)
  await page.screenshot({ path: OUT + 'wind-assisted.png' })
}

console.log('errors:', JSON.stringify(errors, null, 2))
await browser.close()
