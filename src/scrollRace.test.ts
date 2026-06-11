import { describe, expect, it } from 'vitest'

import {
  buildShareText,
  clipName,
  decileGrid,
  fasterThanPercent,
  feetAtTime,
  formatTime,
  parseChallengeMs,
  rankTitle,
  sanitizeName,
  speedTicketLine,
  timeAtFeet,
  unitLine,
} from './lib/race'
import { createRulerTicks, normalizePixelsPerInch } from './routes'

describe('scroll race helpers', () => {
  it('formats sprint times with hundredths of a second', () => {
    expect(formatTime(1234)).toBe('1.23s')
    expect(formatTime(65_432)).toBe('1:05.43')
  })

  it('builds ruler marks from 0 feet through 100 feet', () => {
    const ticks = createRulerTicks()

    expect(ticks).toHaveLength(1_201)
    expect(ticks[0]).toMatchObject({ kind: 'foot', label: '0 ft', top: 0 })
    expect(ticks[60]).toMatchObject({
      kind: 'foot',
      label: '5 ft',
      top: 5_760,
    })
    expect(ticks.at(-1)).toMatchObject({
      kind: 'foot',
      label: '100 ft',
      top: 115_200,
    })
  })

  it('keeps manual scale calibration in the supported mobile range', () => {
    expect(normalizePixelsPerInch(55)).toBe(72)
    expect(normalizePixelsPerInch(115.6)).toBe(116)
    expect(normalizePixelsPerInch(500)).toBe(220)
    expect(normalizePixelsPerInch(Number.NaN)).toBe(96)
  })
})

describe('rank titles', () => {
  it('hands out titles by finish time', () => {
    expect(rankTitle(2_500)).toBe('Thumb of the Gods')
    expect(rankTitle(4_200)).toBe('Greased Lightning')
    expect(rankTitle(5_999)).toBe('Olympic Scroller')
    expect(rankTitle(10_000)).toBe('Doomscroll Veteran')
    expect(rankTitle(45_000)).toBe('Scenic Route Enjoyer')
    expect(rankTitle(120_000)).toBe('Lost in the Fine Print')
  })
})

describe('percentile', () => {
  it('matches the canonical curve and clamps to 1–99', () => {
    expect(fasterThanPercent(4_200)).toBe(92)
    expect(fasterThanPercent(11_500)).toBe(50)
    expect(fasterThanPercent(100)).toBe(99)
    expect(fasterThanPercent(10_000_000)).toBe(1)
  })
})

describe('decile grid', () => {
  const linearSplits = Array.from({ length: 101 }, (_, foot) => foot * 100)

  it('marks an even run as all average', () => {
    expect(decileGrid(linearSplits, 10_000)).toBe('🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨')
  })

  it('marks fast and slow deciles against the run average', () => {
    // First 50 feet at double speed, last 50 feet at half speed.
    const splits = Array.from({ length: 101 }, (_, foot) =>
      foot <= 50 ? foot * 50 : 2_500 + (foot - 50) * 150,
    )
    const total = splits[100]
    const grid = [...decileGrid(splits, total)]

    expect(grid).toHaveLength(10)
    expect(grid.slice(0, 5)).toEqual(['🟧', '🟧', '🟧', '🟧', '🟧'])
    expect(grid.slice(5)).toEqual(['⬜', '⬜', '⬜', '⬜', '⬜'])
  })

  it('classifies teleported (zero-ms) deciles as fast', () => {
    const splits = Array.from({ length: 101 }, (_, foot) =>
      foot <= 90 ? 0 : (foot - 90) * 500,
    )

    expect(decileGrid(splits, 5_000)).toBe('🟧🟧🟧🟧🟧🟧🟧🟧🟧⬜')
  })

  it('returns nothing without complete splits', () => {
    expect(decileGrid([], 5_000)).toBe('')
  })
})

describe('challenge URL hygiene', () => {
  it('strips unsafe characters and spam bait from names', () => {
    expect(sanitizeName('JP 🚀')).toBe('JP')
    expect(sanitizeName('  Mary-Jane O’Neil  ')).toBe('Mary-Jane ONeil')
    expect(sanitizeName("Mary-Jane O'Neil")).toBe("Mary-Jane O'Neil")
    expect(sanitizeName('https://evil.example')).toBe('httpsevil.example')
    expect(sanitizeName('buy-stuff.com now')).toBe('buy-stuff now')
    expect(sanitizeName('<script>alert(1)</script>')).toBe('scriptalert1script')
    expect(sanitizeName('a'.repeat(40))).toHaveLength(18)
  })

  it('never splits a surrogate pair at the 18-unit truncation', () => {
    const trickyName = 'a'.repeat(17) + '\u{1D54F}'

    expect(() => encodeURIComponent(sanitizeName(trickyName))).not.toThrow()
    expect(() => encodeURIComponent(clipName(trickyName))).not.toThrow()
    expect(() =>
      encodeURIComponent(clipName('b'.repeat(17) + '\u{1F600}')),
    ).not.toThrow()
  })

  it('parses ?beat= strictly: reject empty, sub-legit, and junk values', () => {
    expect(parseChallengeMs('4203.4')).toBe(4_203)
    expect(parseChallengeMs(4_203)).toBe(4_203)
    expect(parseChallengeMs('99999999')).toBe(5_999_000)
    expect(parseChallengeMs('999')).toBeUndefined()
    expect(parseChallengeMs('-9')).toBeUndefined()
    expect(parseChallengeMs('')).toBeUndefined()
    expect(parseChallengeMs(' ')).toBeUndefined()
    expect(parseChallengeMs('abc')).toBeUndefined()
    expect(parseChallengeMs(undefined)).toBeUndefined()
    expect(parseChallengeMs(Infinity)).toBeUndefined()
  })
})

describe('share text', () => {
  const linearSplits = Array.from({ length: 101 }, (_, foot) => foot * 42)

  it('mints the four-line Wordle-style card', () => {
    const text = buildShareText({
      timeMs: 4_200,
      splitsMs: linearSplits,
      origin: 'https://scroll-race.netlify.app',
      playerName: 'JP',
    })
    const lines = text.split('\n')

    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('SCROLL RACE 🏁 4.20s')
    expect(lines[1]).toBe('🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨')
    expect(lines[2]).toBe('Greased Lightning · faster than 92% of thumbs')
    expect(lines[3]).toBe(
      'Beat me: https://scroll-race.netlify.app/?beat=4200&by=JP',
    )
  })

  it('omits the by param without a saved name', () => {
    const text = buildShareText({
      timeMs: 4_200,
      splitsMs: linearSplits,
      origin: 'https://scroll-race.netlify.app',
    })

    expect(text).toContain('?beat=4200')
    expect(text).not.toContain('&by=')
  })

  it('appends the streak only from day 3', () => {
    const base = {
      timeMs: 4_200,
      splitsMs: linearSplits,
      origin: 'https://x.test',
    }

    expect(buildShareText({ ...base, streakDays: 2 })).not.toContain('streak')
    expect(buildShareText({ ...base, streakDays: 3 })).toContain(
      '· day 3 streak',
    )
  })

  it('turns a won challenge into a counter-challenge', () => {
    const text = buildShareText({
      timeMs: 4_000,
      splitsMs: linearSplits,
      origin: 'https://x.test',
      playerName: 'JP',
      defeated: 'Sam',
    })

    expect(text).toContain('I just took down Sam’s 100 ft record 🏁 4.00s')
    expect(text).toContain('Your move: https://x.test/?beat=4000&by=JP')
  })

  it('self-reports wind-assisted runs', () => {
    const text = buildShareText({
      timeMs: 180,
      splitsMs: linearSplits,
      origin: 'https://x.test',
      windAssisted: true,
    })

    expect(text).toBe(
      'I cheated at Scroll Race and all I got was this asterisk ✱ https://x.test',
    )
  })
})

describe('speed conversions', () => {
  it('writes the speeding ticket by tier', () => {
    expect(speedTicketLine(5)).toBe('Top speed: 5 mph — a brisk jog')
    expect(speedTicketLine(12)).toBe(
      'Top speed: 12 mph — keeping up with an e-bike',
    )
    expect(speedTicketLine(20)).toBe(
      'Top speed: 20 mph — doing the city speed limit',
    )
    expect(speedTicketLine(38)).toBe(
      'Top speed: 38 mph — a speeding ticket in a school zone',
    )
    expect(speedTicketLine(250)).toBe(
      'Top speed: 99 mph — license suspended, thumb impounded',
    )
  })

  it('rotates the unit conversion line by run count', () => {
    expect(unitLine(0)).toContain('blue whale')
    expect(unitLine(1)).toContain('giraffes')
    expect(unitLine(2)).toContain('school buses')
    expect(unitLine(3)).toContain('Statues of Liberty')
    expect(unitLine(4)).toContain('blue whale')
  })
})

describe('ghost interpolation', () => {
  const splits = Array.from({ length: 101 }, (_, foot) => foot * 100)

  it('round-trips between feet and time on even splits', () => {
    expect(feetAtTime(splits, 10_000, 5_000)).toBeCloseTo(50)
    expect(feetAtTime(splits, 10_000, 5_050)).toBeCloseTo(50.5)
    expect(timeAtFeet(splits, 10_000, 50)).toBeCloseTo(5_000)
    expect(timeAtFeet(splits, 10_000, 50.5)).toBeCloseTo(5_050)
  })

  it('clamps to the course bounds', () => {
    expect(feetAtTime(splits, 10_000, -5)).toBe(0)
    expect(feetAtTime(splits, 10_000, 20_000)).toBe(100)
    expect(timeAtFeet(splits, 10_000, 200)).toBe(10_000)
  })

  it('falls back to linear pace for legacy entries without splits', () => {
    expect(feetAtTime(null, 10_000, 2_500)).toBeCloseTo(25)
    expect(timeAtFeet(null, 10_000, 25)).toBeCloseTo(2_500)
  })

  it('steps through teleport plateaus without dividing by zero', () => {
    // A fling: feet 20–80 all crossed at the same instant.
    const fling = Array.from({ length: 101 }, (_, foot) =>
      foot < 20 ? foot * 100 : foot <= 80 ? 2_000 : 2_000 + (foot - 80) * 100,
    )

    expect(feetAtTime(fling, 4_000, 2_000)).toBeGreaterThanOrEqual(20)
    expect(Number.isFinite(feetAtTime(fling, 4_000, 2_000))).toBe(true)
  })
})
