const EVENTS = [100, 250, 500, 1000]
const DEVICES = ['iPhone', 'iPad', 'Android', 'Windows', 'Mac', 'Other']
const COUNTRIES = ['US', 'CA', 'GB', 'DE', 'FR', 'JP', 'KR', 'BR']
const FIXTURE_DATE = '2026-07-01T12:00:00.000Z'

function splitsFor(timeMs) {
  return Array.from({ length: 101 }, (_, percent) =>
    Math.round((timeMs * percent) / 100),
  )
}

function entry(eventFeet, index) {
  const paceMs = 2_500 + index * 37
  const timeMs = Math.round((paceMs * eventFeet) / 100)

  return {
    id: `synthetic-${eventFeet}-${String(index + 1).padStart(3, '0')}`,
    name: `Synthetic ${String(index + 1).padStart(3, '0')}`,
    timeMs,
    eventFeet,
    device: DEVICES[index % DEVICES.length],
    ppi: 72 + (index % 149),
    country: COUNTRIES[index % COUNTRIES.length],
    completedAt: FIXTURE_DATE,
    splitsMs: splitsFor(timeMs),
  }
}

export function createProductionScaleData() {
  const boards = Object.fromEntries(
    EVENTS.map((eventFeet, eventIndex) => {
      const entries = Array.from({ length: 100 }, (_, index) =>
        entry(eventFeet, index),
      )

      return [
        eventFeet,
        {
          entries,
          total: 125_000 + eventIndex * 137_531,
        },
      ]
    }),
  )
  const localBoards = Object.fromEntries(
    EVENTS.map((eventFeet) => [
      eventFeet,
      boards[eventFeet].entries.slice(12, 22),
    ]),
  )

  return {
    schemaVersion: 1,
    generatedAt: FIXTURE_DATE,
    profile: {
      kind: 'synthetic-production-scale',
      containsRealUserData: false,
      eventCount: EVENTS.length,
      storedWorldEntriesPerEvent: 100,
      servedWorldEntriesPerEvent: 25,
      localEntriesPerEvent: 10,
    },
    boards,
    localBoards,
  }
}

export { EVENTS }
