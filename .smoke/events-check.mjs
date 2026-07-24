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

// 1. New intro design — mobile + desktop
const page = await newPage({ width: 390, height: 844 })
await page.goto('http://localhost:3000/')
await page.waitForTimeout(1500)
await page.screenshot({ path: OUT + 'v2-intro-mobile.png' })

const desktop = await newPage({ width: 1380, height: 900 })
await desktop.goto('http://localhost:3000/')
await desktop.waitForTimeout(1500)
await desktop.screenshot({ path: OUT + 'v2-intro-desktop.png' })
await desktop.close()

// 2. Select the 1000 ft marathon, verify the picker + course scale
await page.getByRole('radio', { name: /1000 ft/i }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: OUT + 'v2-intro-marathon.png' })

const courseInfo = await page.evaluate(() => ({
  courseHeight: getComputedStyle(
    document.querySelector('.scrollRace'),
  ).getPropertyValue('--course-height'),
  tickCount: document.querySelectorAll('.rulerTick').length,
}))
console.log('marathon course:', JSON.stringify(courseInfo))

// 3. Race the marathon legitimately-ish (fast but sub-teleport steps)
await page.getByRole('button', { name: /start race|race again/i }).click()
await page.waitForTimeout(2400)
const raceResult = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight
  const step = window.innerHeight * 5
  let y = 0
  while (y < maxScroll) {
    y = Math.min(y + step, maxScroll)
    window.scrollTo(0, y)
    await sleep(40)
  }
  await sleep(300)
  return { maxScroll, finalY: window.scrollY }
})
console.log('marathon race:', JSON.stringify(raceResult))
await page.waitForTimeout(1100)
await page.screenshot({ path: OUT + 'v2-finish-marathon.png' })

const finishText = await page.evaluate(() => ({
  rankStamp: document.querySelector('.rankStamp')?.textContent ?? null,
  resultTime: document.querySelector('.resultTime')?.textContent ?? null,
  funFacts: [...document.querySelectorAll('.funFacts li')].map(
    (li) => li.textContent,
  ),
  savedNote: document.querySelector('.savedNote')?.textContent ?? null,
}))
console.log('finish:', JSON.stringify(finishText, null, 2))

// 4. Save with empty name → random racer name
const input = page.locator('#player-name')
if (await input.count()) {
  await page.getByRole('button', { name: /save time/i }).click()
  await page.waitForTimeout(400)
  const saved = await page.evaluate(
    () => document.querySelector('.savedNote')?.textContent ?? null,
  )
  console.log('random-name save:', JSON.stringify(saved))
}

// 5. Challenge link for a 250 ft event
const chal = await newPage({ width: 390, height: 844 })
await chal.goto('http://localhost:3000/?beat=12300&event=250&by=JP')
await chal.waitForTimeout(1500)
await chal.screenshot({ path: OUT + 'v2-challenge-250.png' })
const slip = await chal.evaluate(() => ({
  slip: document.querySelector('.challengeSlipBody')?.textContent ?? null,
  startLabel: document.querySelector('.startBtn')?.textContent ?? null,
  selected:
    document.querySelector('.eventOption.isSelected strong')?.textContent ??
    null,
}))
console.log('challenge:', JSON.stringify(slip))
await chal.close()

console.log('errors:', JSON.stringify(errors, null, 2))
await browser.close()
