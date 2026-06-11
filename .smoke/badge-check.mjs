import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
await page.goto('http://localhost:3000/')
await page.waitForTimeout(1200)
await page.getByRole('button', { name: /start race/i }).click()
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
await page.waitForTimeout(1000)
const badges = await page.evaluate(() => ({
  windStamp: document.querySelector('.windStamp')?.textContent ?? null,
  recordBadge: document.querySelector('.recordBadge')?.textContent ?? null,
  rankStamp: document.querySelector('.rankStamp')?.textContent ?? null,
  dayPill: document.querySelector('.dayPill')?.textContent ?? null,
  rankStampVisible: (() => {
    const el = document.querySelector('.rankStamp')
    if (!el) return null
    const cs = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    return { opacity: cs.opacity, display: cs.display, top: rect.top, height: rect.height }
  })(),
  resultTime: document.querySelector('.resultTime')?.textContent ?? null,
}))
console.log(JSON.stringify(badges, null, 2))
await browser.close()
