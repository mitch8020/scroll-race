import { describe, expect, it } from 'vitest'

import { createRulerTicks, formatTime, normalizePixelsPerInch } from './routes'

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
