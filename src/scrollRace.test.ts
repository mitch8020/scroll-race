import { describe, expect, it } from 'vitest'

import {
  EVENTS,
  buildShareText,
  clipName,
  decileGrid,
  eventForFeet,
  fasterThanPercent,
  formatTime,
  parseChallengeMs,
  parseEventFeet,
  percentAtTime,
  randomRacerName,
  rankTitle,
  sanitizeName,
  speedTicketLine,
  timeAtPercent,
  unitLine,
} from './lib/race'
import { createRulerTicks, normalizePixelsPerInch } from './lib/course'

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

  it('caps tick counts for long events with coarser spacing', () => {
    const marathonTicks = createRulerTicks(96, eventForFeet(1000))

    expect(marathonTicks).toHaveLength(1_001)
    expect(marathonTicks[0]).toMatchObject({ kind: 'foot', label: '0 ft' })
    expect(marathonTicks.at(-1)).toMatchObject({
      kind: 'foot',
      label: '1000 ft',
    })
    // Labels only every 50 ft on the marathon.
    expect(
      marathonTicks.filter((tick) => tick.label !== undefined),
    ).toHaveLength(21)

    const dashTicks = createRulerTicks(96, eventForFeet(250))

    expect(dashTicks).toHaveLength(1_001)
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
    expect(parseChallengeMs('499')).toBeUndefined()
    expect(parseChallengeMs('-9')).toBeUndefined()
    expect(parseChallengeMs('')).toBeUndefined()
    expect(parseChallengeMs(' ')).toBeUndefined()
    expect(parseChallengeMs('abc')).toBeUndefined()
    expect(parseChallengeMs(undefined)).toBeUndefined()
    expect(parseChallengeMs(Infinity)).toBeUndefined()
  })

  it('scales the challenge floor with the event so links cannot grief', () => {
    // The floor equals the wind-assist minimum (5ms/ft): any accepted
    // challenge is beatable without the winner being auto-flagged.
    for (const event of EVENTS) {
      const floor = event.feet * 5

      expect(parseChallengeMs(String(floor - 1), event.feet)).toBeUndefined()
      expect(parseChallengeMs(String(floor), event.feet)).toBe(floor)
    }

    expect(parseChallengeMs('4999', 1000)).toBeUndefined()
    expect(parseChallengeMs('5000', 1000)).toBe(5_000)
    expect(parseChallengeMs('15000', 1000)).toBe(15_000)
    expect(parseChallengeMs('1249', 250)).toBeUndefined()
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
    expect(lines[0]).toBe('SCROLL RACE 🏁 100 FT · 4.20s')
    expect(lines[1]).toBe('🟨🟨🟨🟨🟨🟨🟨🟨🟨🟨')
    expect(lines[2]).toBe('Greased Lightning · faster than 92% of thumbs')
    expect(lines[3]).toBe(
      'Beat me: https://scroll-race.netlify.app/?beat=4200&event=100&by=JP',
    )
  })

  it('carries the event distance through the card', () => {
    const text = buildShareText({
      timeMs: 42_000,
      splitsMs: linearSplits,
      origin: 'https://x.test',
      eventFeet: 1000,
    })

    expect(text).toContain('SCROLL RACE 🏁 1000 FT · 42.00s')
    expect(text).toContain('?beat=42000&event=1000')
    // A 42s thousand-footer is a 4.2s/100ft pace — same title as the sprint.
    expect(text).toContain('Greased Lightning')
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
    expect(text).toContain(
      'Your move: https://x.test/?beat=4000&event=100&by=JP',
    )
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
    expect(unitLine(0)).toBe('You scrolled an entire blue whale, nose to tail.')
    expect(unitLine(1)).toBe('That’s 5.6 giraffes, stacked.')
    expect(unitLine(2)).toBe('That’s 2.9 school buses.')
    expect(unitLine(3)).toBe('That’s 0.66 Statues of Liberty (no pedestal).')
    expect(unitLine(4)).toContain('blue whale')
  })

  it('scales the unit conversions to the event distance', () => {
    expect(unitLine(0, 1000)).toBe(
      'You scrolled 10.2 blue whales, nose to tail.',
    )
    expect(unitLine(2, 1000)).toBe('That’s 29 school buses.')
    expect(unitLine(3, 250)).toBe(
      'That’s 1.7 Statues of Liberty (no pedestal).',
    )
  })
})

describe('events', () => {
  it('defines the four sanctioned distances', () => {
    expect(EVENTS.map((event) => event.feet)).toEqual([100, 250, 500, 1000])
  })

  it('parses only sanctioned event distances from the URL', () => {
    expect(parseEventFeet('250')).toBe(250)
    expect(parseEventFeet(1000)).toBe(1000)
    expect(parseEventFeet('150')).toBeUndefined()
    expect(parseEventFeet('')).toBeUndefined()
    expect(parseEventFeet(undefined)).toBeUndefined()
  })

  it('judges titles and percentiles on pace, not raw time', () => {
    expect(rankTitle(42_000, 1000)).toBe(rankTitle(4_200, 100))
    expect(fasterThanPercent(115_000, 1000)).toBe(
      fasterThanPercent(11_500, 100),
    )
  })
})

describe('random racer names', () => {
  it('always fits the 18-character name budget', () => {
    for (let index = 0; index < 200; index += 1) {
      const name = randomRacerName()

      expect(name.length).toBeLessThanOrEqual(18)
      expect(name).toMatch(/^\S+ \S+$/)
    }
  })

  it('is deterministic for a fixed rng', () => {
    expect(randomRacerName(() => 0)).toBe('Turbo Thumb')
    expect(randomRacerName(() => 0.999)).toBe('Rogue Swift')
  })
})

describe('ghost interpolation', () => {
  const splits = Array.from({ length: 101 }, (_, mark) => mark * 100)

  it('round-trips between course percent and time on even splits', () => {
    expect(percentAtTime(splits, 10_000, 5_000)).toBeCloseTo(50)
    expect(percentAtTime(splits, 10_000, 5_050)).toBeCloseTo(50.5)
    expect(timeAtPercent(splits, 10_000, 50)).toBeCloseTo(5_000)
    expect(timeAtPercent(splits, 10_000, 50.5)).toBeCloseTo(5_050)
  })

  it('clamps to the course bounds', () => {
    expect(percentAtTime(splits, 10_000, -5)).toBe(0)
    expect(percentAtTime(splits, 10_000, 20_000)).toBe(100)
    expect(timeAtPercent(splits, 10_000, 200)).toBe(10_000)
  })

  it('falls back to linear pace for legacy entries without splits', () => {
    expect(percentAtTime(null, 10_000, 2_500)).toBeCloseTo(25)
    expect(timeAtPercent(null, 10_000, 25)).toBeCloseTo(2_500)
  })

  it('steps through teleport plateaus without dividing by zero', () => {
    // A fling: marks 20–80 all crossed at the same instant.
    const fling = Array.from({ length: 101 }, (_, mark) =>
      mark < 20 ? mark * 100 : mark <= 80 ? 2_000 : 2_000 + (mark - 80) * 100,
    )

    expect(percentAtTime(fling, 4_000, 2_000)).toBeGreaterThanOrEqual(20)
    expect(Number.isFinite(percentAtTime(fling, 4_000, 2_000))).toBe(true)
  })
})
