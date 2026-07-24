import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_LEADERBOARD_ENTRIES,
  bumpRunCount,
  getStreakRecency,
  readLeaderboard,
  readPb,
  readPixelsPerInch,
  readRunCount,
  readSessionNoPbRuns,
  readStoredEventFeet,
  readStoredName,
  readStreak,
  updateStreakOnFinish,
  writePixelsPerInch,
  writeSessionNoPbRuns,
  writeStoredEventFeet,
  writeStoredName,
} from './lib/localRaceStore'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

let localStorage: MemoryStorage
let sessionStorage: MemoryStorage

beforeEach(() => {
  localStorage = new MemoryStorage()
  sessionStorage = new MemoryStorage()
  vi.stubGlobal('window', { localStorage, sessionStorage })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('local race store', () => {
  it('round-trips calibrated scale, selected event, and player name', () => {
    writePixelsPerInch(115.6)
    writeStoredEventFeet(500)
    writeStoredName('  Mary <Jane>  ')

    expect(readPixelsPerInch()).toBe(116)
    expect(readStoredEventFeet()).toBe(500)
    expect(readStoredName()).toBe('Mary Jane')
  })

  it('keeps malformed settings on safe defaults', () => {
    localStorage.setItem('scroll-race-pixels-per-inch-v1', 'not-a-number')
    localStorage.setItem('scroll-race-event-v1', '123')

    expect(readPixelsPerInch()).toBe(96)
    expect(readStoredEventFeet()).toBe(100)
    expect(readPb(100)).toBeNull()
  })

  it('migrates, validates, clips, sorts, and caps legacy leaderboard rows', () => {
    const entries = Array.from(
      { length: MAX_LEADERBOARD_ENTRIES + 2 },
      (_, index) => ({
        id: `runner-${index}`,
        name: index === 0 ? 'x'.repeat(40) : `Runner ${index}`,
        timeMs: 10_000 - index,
        completedAt: '2026-07-23T00:00:00.000Z',
      }),
    )

    localStorage.setItem(
      'scroll-race-leaderboard-v1',
      JSON.stringify([
        ...entries,
        { id: 'broken', name: 'Broken', timeMs: 'fast', completedAt: '' },
      ]),
    )

    const board = readLeaderboard(100)

    expect(board).toHaveLength(MAX_LEADERBOARD_ENTRIES)
    expect(board.map((entry) => entry.timeMs)).toEqual(
      [...board.map((entry) => entry.timeMs)].sort(
        (left, right) => left - right,
      ),
    )
    expect(board.every((entry) => entry.name.length <= 18)).toBe(true)
    expect(readLeaderboard(250)).toEqual([])
  })

  it('filters explicitly desktop-labeled local leaderboard rows', () => {
    localStorage.setItem(
      'scroll-race-leaderboard-v2-100',
      JSON.stringify([
        {
          id: 'phone',
          name: 'Phone',
          timeMs: 4_000,
          completedAt: '2026-07-23T00:00:00.000Z',
          device: 'iPhone',
        },
        {
          id: 'desktop',
          name: 'Desktop',
          timeMs: 3_000,
          completedAt: '2026-07-23T00:00:00.000Z',
          device: 'Windows',
        },
        {
          id: 'legacy',
          name: 'Legacy',
          timeMs: 5_000,
          completedAt: '2026-06-01T00:00:00.000Z',
        },
      ]),
    )

    expect(readLeaderboard(100).map((entry) => entry.id)).toEqual([
      'phone',
      'legacy',
    ])
  })

  it('tracks run and session counters independently', () => {
    expect(bumpRunCount()).toBe(1)
    expect(bumpRunCount()).toBe(2)
    writeSessionNoPbRuns(4)

    expect(readRunCount()).toBe(2)
    expect(readSessionNoPbRuns()).toBe(4)
  })

  it('continues a streak across calendar days and records a daily best', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-22T12:00:00'))

    expect(updateStreakOnFinish(5_000)).toEqual({
      streak: 1,
      firstOfDay: true,
      newDailyBest: false,
    })
    expect(updateStreakOnFinish(4_500)).toEqual({
      streak: 1,
      firstOfDay: false,
      newDailyBest: true,
    })

    vi.setSystemTime(new Date('2026-07-23T12:00:00'))

    expect(getStreakRecency(readStreak())).toBe('yesterday')
    expect(updateStreakOnFinish(4_800)).toEqual({
      streak: 2,
      firstOfDay: true,
      newDailyBest: false,
    })
    expect(readStreak()).toMatchObject({
      streak: 2,
      todayBestMs: 4_800,
    })
    expect(getStreakRecency(readStreak())).toBe('today')

    vi.setSystemTime(new Date('2026-07-26T12:00:00'))
    expect(getStreakRecency(readStreak())).toBe('lapsed')
  })
})
