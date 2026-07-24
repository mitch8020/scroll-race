import { describe, expect, it } from 'vitest'

import { parseGlobalBoardResponse } from './lib/globalBoard'

describe('global board response boundary', () => {
  it('filters hostile rows, sorts valid rows, and normalizes rendered fields', () => {
    const parsed = parseGlobalBoardResponse(
      {
        entries: [
          {
            id: 'negative',
            name: 'Negative',
            timeMs: -10,
            eventFeet: 100,
          },
          {
            id: 'wrong-event',
            name: 'Wrong event',
            timeMs: 2_900,
            eventFeet: 250,
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
      },
      100,
    )

    expect(parsed).toEqual({
      entries: [
        expect.objectContaining({
          id: 'fast',
          name: 'Fast',
          country: 'US',
        }),
        expect.objectContaining({
          id: 'slow',
          name: 'scriptSlowscript',
          device: 'A device l',
          country: undefined,
        }),
      ],
      total: 2,
    })
  })

  it('de-duplicates ids and clamps decimal totals to whole runs', () => {
    const entry = {
      id: 'same',
      name: 'Synthetic',
      timeMs: 3_000,
      eventFeet: 100,
      device: 'Other',
    }

    expect(
      parseGlobalBoardResponse(
        { entries: [entry, { ...entry, timeMs: 3_100 }], total: 9.9 },
        100,
      ),
    ).toMatchObject({
      entries: [{ timeMs: 3_000 }],
      total: 9,
    })
  })

  it('rejects non-object and non-array response shapes', () => {
    expect(parseGlobalBoardResponse(null, 100)).toBeNull()
    expect(parseGlobalBoardResponse({ entries: 'nope' }, 100)).toBeNull()
  })
})
