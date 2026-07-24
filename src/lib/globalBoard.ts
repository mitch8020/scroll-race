// Client for the leaderboard function. Local-first: every call swallows
// failures and returns null — the game never blocks on the network.

import type { GlobalEntry } from './board'
import { GLOBAL_BOARD_PAGE, isGlobalEntryLike } from './board'
import { sanitizeName } from './race'

const API_PATH = '/api/leaderboard'
const FETCH_TIMEOUT_MS = 6_000
const SUBMIT_TIMEOUT_MS = 8_000

export type GlobalBoardView = {
  entries: Array<GlobalEntry>
  total: number
}

export type SubmitResult = {
  rank: number | null
  total: number
}

export type ScoreSubmission = {
  name: string
  timeMs: number
  eventFeet: number
  splitsMs: ReadonlyArray<number>
  ppi: number
  device: string
}

export function parseGlobalBoardResponse(
  data: unknown,
  eventFeet: number,
): GlobalBoardView | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  const body = data as Record<string, unknown>

  if (!Array.isArray(body.entries)) {
    return null
  }

  const seenIds = new Set<string>()
  const entries = body.entries
    .filter(isGlobalEntryLike)
    .filter((entry) => entry.eventFeet === eventFeet)
    .sort((left, right) => left.timeMs - right.timeMs)
    .filter((entry) => {
      if (seenIds.has(entry.id)) {
        return false
      }

      seenIds.add(entry.id)

      return true
    })
    .slice(0, GLOBAL_BOARD_PAGE)
    // Never trust the wire: normalize every rendered field.
    .map((entry) => ({
      ...entry,
      name: sanitizeName(entry.name) || 'Racer',
      device:
        typeof entry.device === 'string'
          ? entry.device.slice(0, 10)
          : 'Unknown',
      country:
        typeof entry.country === 'string' && /^[A-Z]{2}$/.test(entry.country)
          ? entry.country
          : undefined,
    }))
  const wireTotal =
    typeof body.total === 'number' && Number.isFinite(body.total)
      ? Math.max(0, Math.floor(body.total))
      : 0

  return {
    entries,
    total: Math.max(wireTotal, entries.length),
  }
}

export async function fetchGlobalBoard(
  eventFeet: number,
  signal?: AbortSignal,
): Promise<GlobalBoardView | null> {
  try {
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
    const response = await fetch(`${API_PATH}?event=${eventFeet}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })

    if (!response.ok) {
      return null
    }

    const data: unknown = await response.json()

    return parseGlobalBoardResponse(data, eventFeet)
  } catch {
    return null
  }
}

export async function submitToGlobalBoard(
  submission: ScoreSubmission,
): Promise<SubmitResult | 'rate-limited' | null> {
  try {
    const response = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submission),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    })

    if (response.status === 429) {
      return 'rate-limited'
    }

    if (!response.ok) {
      return null
    }

    const data: unknown = await response.json()

    if (!data || typeof data !== 'object') {
      return null
    }

    const body = data as Record<string, unknown>

    return {
      rank:
        typeof body.rank === 'number' && Number.isFinite(body.rank)
          ? body.rank
          : null,
      total:
        typeof body.total === 'number' && Number.isFinite(body.total)
          ? body.total
          : 0,
    }
  } catch {
    return null
  }
}
