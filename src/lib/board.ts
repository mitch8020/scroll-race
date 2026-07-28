// Shared between the game client and the Netlify leaderboard function: one
// set of rules for what counts as a postable run, so the server enforces
// exactly what the client promises. Pure module — no DOM, no Netlify APIs.

import {
  MAX_CHALLENGE_MS,
  MIN_LEGIT_MS_PER_FOOT,
  PERCENT_STEPS,
  leaderboardNameKey,
  parseEventFeet,
  randomRacerName,
  sanitizeName,
} from './race'
import { isMobileDeviceClass } from './device'

export const GLOBAL_BOARD_LIMIT = 100
export const GLOBAL_BOARD_PAGE = 25
// Short enough that an honest "Run it back" rhythm (skip countdown + a fast
// sprint ≈ 5-7s) rarely trips it; the client retries once if it does.
export const SUBMIT_COOLDOWN_MS = 4_000

export type GlobalEntry = {
  id: string
  name: string
  timeMs: number
  eventFeet: number
  device: string
  ppi: number
  country?: string
  completedAt: string
}

export type GlobalBoard = {
  entries: Array<GlobalEntry>
  /** Total accepted submissions ever for this event, not just the stored top. */
  total: number
}

export type AcceptedSubmission = {
  ok: true
  eventFeet: number
  name: string
  timeMs: number
  device: string
  ppi: number
}

export type RejectedSubmission = {
  ok: false
  reason: string
}

// Server-side gate. Client-submitted scores are forgeable in principle, but
// every rule the game enforces locally is re-enforced here: mobile device,
// sanctioned event, per-event legit-time floor (wind-assisted runs are below
// it by definition), and a complete, monotonic splits trace whose final mark
// matches the time.
export function validateSubmission(
  raw: unknown,
): AcceptedSubmission | RejectedSubmission {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'Bad payload' }
  }

  const data = raw as Record<string, unknown>
  const eventFeet = parseEventFeet(data.eventFeet)

  if (eventFeet === undefined) {
    return { ok: false, reason: 'Unknown event' }
  }

  const timeMs =
    typeof data.timeMs === 'number' && Number.isFinite(data.timeMs)
      ? Math.round(data.timeMs)
      : null

  if (timeMs === null || timeMs <= 0) {
    return { ok: false, reason: 'Bad time' }
  }

  if (timeMs < eventFeet * MIN_LEGIT_MS_PER_FOOT) {
    return { ok: false, reason: 'Wind-assisted times are not eligible' }
  }

  if (timeMs > MAX_CHALLENGE_MS) {
    return { ok: false, reason: 'The board has a bedtime' }
  }

  if (!areSplitsPlausible(data.splitsMs, timeMs)) {
    return { ok: false, reason: 'Splits don’t add up' }
  }

  const device = typeof data.device === 'string' ? data.device : 'Unknown'

  if (!isMobileDeviceClass(device)) {
    return { ok: false, reason: 'Desktop runs are not eligible' }
  }

  const name =
    sanitizeName(typeof data.name === 'string' ? data.name : '') ||
    randomRacerName()
  const rawPpi = Number(data.ppi)
  const ppi = Number.isFinite(rawPpi)
    ? Math.min(Math.max(Math.round(rawPpi), 72), 220)
    : 96

  return { ok: true, eventFeet, name, timeMs, device, ppi }
}

// A real run always produces 101 monotonic non-negative splits whose last
// mark lands on the finish time. (Identical consecutive values are legit —
// a violent fling fills skipped marks with one timestamp.)
export function areSplitsPlausible(value: unknown, timeMs: number) {
  if (!Array.isArray(value) || value.length !== PERCENT_STEPS + 1) {
    return false
  }

  let previous = 0

  for (const split of value) {
    if (typeof split !== 'number' || !Number.isFinite(split) || split < 0) {
      return false
    }

    if (split < previous) {
      return false
    }

    previous = split
  }

  const finalSplit = value[PERCENT_STEPS] as number

  return Math.abs(finalSplit - timeMs) <= Math.max(timeMs * 0.02, 50)
}

// Insert into a board capped at GLOBAL_BOARD_LIMIT. Ties keep earlier
// submissions ahead (stable sort, new entry appended last). Returns the new
// board plus the entry's 1-based rank, or null rank if it fell off the
// bottom.
export function insertEntry(
  board: GlobalBoard | null,
  entry: GlobalEntry,
): { board: GlobalBoard; rank: number | null } {
  const entries = rankGlobalEntries([...(board?.entries ?? []), entry])
  const playerKey = leaderboardNameKey(entry.name)
  const index = entries.findIndex(
    (candidate) => leaderboardNameKey(candidate.name) === playerKey,
  )

  return {
    board: {
      entries: entries.slice(0, GLOBAL_BOARD_LIMIT),
      total: (board?.total ?? 0) + 1,
    },
    rank: index < GLOBAL_BOARD_LIMIT ? index + 1 : null,
  }
}

// Every event board holds one fastest row per sanitized, case-insensitive
// player name. Sorting first makes this both a historical cleanup and an
// upsert rule: a slower repeat is discarded, while a faster repeat replaces
// the old row. IDs are also unique as a defensive storage boundary.
export function rankGlobalEntries(
  values: ReadonlyArray<unknown>,
): Array<GlobalEntry> {
  const seenIds = new Set<string>()
  const seenPlayers = new Set<string>()

  return values
    .filter(isGlobalEntryLike)
    .sort((left, right) => left.timeMs - right.timeMs)
    .filter((entry) => {
      const playerKey = leaderboardNameKey(entry.name)

      if (seenIds.has(entry.id) || seenPlayers.has(playerKey)) {
        return false
      }

      seenIds.add(entry.id)
      seenPlayers.add(playerKey)

      return true
    })
}

// Defensive parse of whatever the API hands back — the client never trusts
// the wire blindly.
export function isGlobalEntryLike(value: unknown): value is GlobalEntry {
  if (!value || typeof value !== 'object') {
    return false
  }

  const entry = value as Record<string, unknown>
  const eventFeet = parseEventFeet(entry.eventFeet)

  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    typeof entry.name === 'string' &&
    typeof entry.timeMs === 'number' &&
    Number.isFinite(entry.timeMs) &&
    eventFeet !== undefined &&
    typeof entry.device === 'string' &&
    isMobileDeviceClass(entry.device) &&
    entry.timeMs >= eventFeet * MIN_LEGIT_MS_PER_FOOT &&
    entry.timeMs <= MAX_CHALLENGE_MS
  )
}
