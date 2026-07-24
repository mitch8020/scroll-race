import { CSS_PIXELS_PER_INCH, normalizePixelsPerInch } from './course'
import { classifyDevice, isMobileDeviceClass } from './device'
import {
  DEFAULT_EVENT_FEET,
  clipName,
  parseEventFeet,
  sanitizeName,
} from './race'

const LEGACY_LEADERBOARD_KEY = 'scroll-race-leaderboard-v1'
const LEGACY_PB_KEY = 'scroll-race-pb-v1'
const SCALE_STORAGE_KEY = 'scroll-race-pixels-per-inch-v1'
const NAME_STORAGE_KEY = 'scroll-race-player-name-v1'
const STREAK_STORAGE_KEY = 'scroll-race-streak-v1'
const RUNS_STORAGE_KEY = 'scroll-race-runs-v1'
const EVENT_STORAGE_KEY = 'scroll-race-event-v1'
const SESSION_NO_PB_KEY = 'scroll-race-session-no-pb-runs'

export const MAX_LEADERBOARD_ENTRIES = 10

export type LeaderboardEntry = {
  id: string
  name: string
  timeMs: number
  completedAt: string
  splitsMs?: Array<number>
  eventFeet?: number
  ppi?: number
  device?: string
}

export type StreakData = {
  lastDay: string
  streak: number
  prevStreak: number
  todayBestMs: number | null
}

function leaderboardKey(eventFeet: number) {
  return `scroll-race-leaderboard-v2-${eventFeet}`
}

function pbKey(eventFeet: number) {
  return `scroll-race-pb-v2-${eventFeet}`
}

function localStorageOrNull() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function sessionStorageOrNull() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function localDay(offsetDays: number) {
  // Calendar arithmetic, not epoch math: a fixed 86,400,000ms offset misses
  // "yesterday" across DST transitions and would break honest streaks.
  const date = new Date()

  date.setDate(date.getDate() + offsetDays)

  return date.toLocaleDateString('sv')
}

export function readPixelsPerInch() {
  const storage = localStorageOrNull()

  if (!storage) {
    return CSS_PIXELS_PER_INCH
  }

  const storedValue = Number(storage.getItem(SCALE_STORAGE_KEY))

  return normalizePixelsPerInch(storedValue || CSS_PIXELS_PER_INCH)
}

export function writePixelsPerInch(pixelsPerInch: number) {
  const storage = localStorageOrNull()

  if (!storage) {
    return
  }

  try {
    storage.setItem(
      SCALE_STORAGE_KEY,
      String(normalizePixelsPerInch(pixelsPerInch)),
    )
  } catch {
    return
  }
}

export function readLeaderboard(eventFeet: number): Array<LeaderboardEntry> {
  const storage = localStorageOrNull()

  if (!storage) {
    return []
  }

  try {
    // Boards saved before events existed migrate to the 100 ft event, whose
    // per-foot splits are identical to per-percent splits.
    const rawLeaderboard =
      storage.getItem(leaderboardKey(eventFeet)) ??
      (eventFeet === DEFAULT_EVENT_FEET
        ? storage.getItem(LEGACY_LEADERBOARD_KEY)
        : null)

    if (!rawLeaderboard) {
      return []
    }

    const parsedLeaderboard: unknown = JSON.parse(rawLeaderboard)

    if (!Array.isArray(parsedLeaderboard)) {
      return []
    }

    return parsedLeaderboard
      .filter(isLeaderboardEntry)
      .map((entry) => ({
        ...entry,
        // Clamp on read: a hand-crafted localStorage entry must not be able
        // to render an unbounded name.
        name: clipName(entry.name) || 'Anonymous',
      }))
      .sort((left, right) => left.timeMs - right.timeMs)
      .slice(0, MAX_LEADERBOARD_ENTRIES)
  } catch {
    return []
  }
}

export function writeLeaderboard(
  eventFeet: number,
  entries: Array<LeaderboardEntry>,
) {
  const storage = localStorageOrNull()

  if (!storage) {
    return
  }

  try {
    storage.setItem(leaderboardKey(eventFeet), JSON.stringify(entries))
  } catch {
    return
  }
}

// splitsMs stays optional: entries saved before telemetry existed are still
// valid and fall back to linear pace for the ghost.
function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== 'object') {
    return false
  }

  const entry = value as Record<string, unknown>

  return (
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.timeMs === 'number' &&
    Number.isFinite(entry.timeMs) &&
    typeof entry.completedAt === 'string' &&
    (entry.device === undefined ||
      (typeof entry.device === 'string' &&
        isMobileDeviceClass(entry.device))) &&
    (entry.splitsMs === undefined ||
      (Array.isArray(entry.splitsMs) &&
        entry.splitsMs.every((split) => typeof split === 'number')))
  )
}

export function readPb(eventFeet: number): number | null {
  const storage = localStorageOrNull()

  if (!storage) {
    return null
  }

  try {
    const raw =
      storage.getItem(pbKey(eventFeet)) ??
      (eventFeet === DEFAULT_EVENT_FEET ? storage.getItem(LEGACY_PB_KEY) : null)
    const value = raw === null ? Number.NaN : Number(raw)

    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function writePb(eventFeet: number, timeMs: number) {
  const storage = localStorageOrNull()

  if (!storage) {
    return
  }

  try {
    storage.setItem(pbKey(eventFeet), String(timeMs))
  } catch {
    return
  }
}

export function readStoredEventFeet() {
  const storage = localStorageOrNull()

  if (!storage) {
    return DEFAULT_EVENT_FEET
  }

  try {
    return (
      parseEventFeet(storage.getItem(EVENT_STORAGE_KEY)) ?? DEFAULT_EVENT_FEET
    )
  } catch {
    return DEFAULT_EVENT_FEET
  }
}

export function writeStoredEventFeet(eventFeet: number) {
  const storage = localStorageOrNull()

  if (!storage) {
    return
  }

  try {
    storage.setItem(EVENT_STORAGE_KEY, String(eventFeet))
  } catch {
    return
  }
}

// Coarse device class for leaderboard metadata — never anything
// fingerprint-y, just enough for "set on an iPhone" context.
export function detectDevice() {
  if (typeof navigator === 'undefined') {
    return 'Unknown'
  }

  return classifyDevice(navigator.userAgent, navigator.maxTouchPoints)
}

export function readStoredName() {
  const storage = localStorageOrNull()

  if (!storage) {
    return ''
  }

  try {
    return sanitizeName(storage.getItem(NAME_STORAGE_KEY) ?? '')
  } catch {
    return ''
  }
}

export function writeStoredName(name: string) {
  const storage = localStorageOrNull()

  if (!storage) {
    return
  }

  try {
    storage.setItem(NAME_STORAGE_KEY, name)
  } catch {
    return
  }
}

export function readStreak(): StreakData {
  const fallback: StreakData = {
    lastDay: '',
    streak: 0,
    prevStreak: 0,
    todayBestMs: null,
  }
  const storage = localStorageOrNull()

  if (!storage) {
    return fallback
  }

  try {
    const raw = storage.getItem(STREAK_STORAGE_KEY)

    if (!raw) {
      return fallback
    }

    const parsed: unknown = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') {
      return fallback
    }

    const data = parsed as Record<string, unknown>

    return {
      lastDay: typeof data.lastDay === 'string' ? data.lastDay : '',
      streak: typeof data.streak === 'number' ? data.streak : 0,
      prevStreak: typeof data.prevStreak === 'number' ? data.prevStreak : 0,
      todayBestMs:
        typeof data.todayBestMs === 'number' ? data.todayBestMs : null,
    }
  } catch {
    return fallback
  }
}

export function getStreakRecency(streak: StreakData) {
  if (streak.lastDay === localDay(0)) {
    return 'today' as const
  }

  if (streak.lastDay === localDay(-1)) {
    return 'yesterday' as const
  }

  return 'lapsed' as const
}

export function writeStreak(data: StreakData) {
  const storage = localStorageOrNull()

  if (!storage) {
    return
  }

  try {
    storage.setItem(STREAK_STORAGE_KEY, JSON.stringify(data))
  } catch {
    return
  }
}

export function updateStreakOnFinish(timeMs: number) {
  const today = localDay(0)
  const yesterday = localDay(-1)
  const current = readStreak()
  let streak: number
  let prevStreak = current.prevStreak
  let firstOfDay = false
  let newDailyBest = false
  let todayBestMs: number | null

  if (current.lastDay === today) {
    streak = Math.max(current.streak, 1)
    newDailyBest = current.todayBestMs !== null && timeMs < current.todayBestMs
    todayBestMs =
      current.todayBestMs === null
        ? timeMs
        : Math.min(current.todayBestMs, timeMs)
  } else {
    firstOfDay = true
    todayBestMs = timeMs

    if (current.lastDay === yesterday) {
      streak = current.streak + 1
    } else {
      prevStreak = current.streak
      streak = 1
    }
  }

  writeStreak({ lastDay: today, streak, prevStreak, todayBestMs })

  return { streak, firstOfDay, newDailyBest }
}

export function readRunCount() {
  const storage = localStorageOrNull()

  if (!storage) {
    return 0
  }

  try {
    const value = Number(storage.getItem(RUNS_STORAGE_KEY))

    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

export function bumpRunCount() {
  const next = readRunCount() + 1
  const storage = localStorageOrNull()

  if (!storage) {
    return next
  }

  try {
    storage.setItem(RUNS_STORAGE_KEY, String(next))
  } catch {
    return next
  }

  return next
}

export function readSessionNoPbRuns() {
  const storage = sessionStorageOrNull()

  if (!storage) {
    return 0
  }

  try {
    const value = Number(storage.getItem(SESSION_NO_PB_KEY))

    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

export function writeSessionNoPbRuns(count: number) {
  const storage = sessionStorageOrNull()

  if (!storage) {
    return
  }

  try {
    storage.setItem(SESSION_NO_PB_KEY, String(count))
  } catch {
    return
  }
}

export function createEntryId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
