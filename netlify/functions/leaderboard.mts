// Public leaderboard API: GET /api/leaderboard?event=100 and POST scores.
// Storage is Netlify Blobs — one board blob per event, strong consistency
// for the read-modify-write on POST. Concurrent posts can theoretically race
// (last write wins); for a toy leaderboard that loses at most one entry, and
// the rank returned to each player is still self-consistent. Likewise the
// cooldown is check-then-set: a parallel burst from one IP can slip through
// once — acceptable at this scale, validation still gates every entry.

import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

import type { GlobalBoard, GlobalEntry } from '../../src/lib/board'
import {
  GLOBAL_BOARD_PAGE,
  SUBMIT_COOLDOWN_MS,
  insertEntry,
  validateSubmission,
} from '../../src/lib/board'
import { parseEventFeet } from '../../src/lib/race'

const MAX_BODY_BYTES = 16_384

const DEPLOY_CONTEXT = process.env.CONTEXT ?? 'dev'
const IS_PRODUCTION = DEPLOY_CONTEXT === 'production'

// Site-wide blob stores are shared across ALL deploys (previews, branch
// deploys, drafts). Suffix non-production contexts so preview traffic never
// touches the real world board or its rate-limit buckets.
function scopedName(name: string) {
  return IS_PRODUCTION ? name : `${name}-${DEPLOY_CONTEXT}`
}

function json(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function boardKey(eventFeet: number) {
  return `board-${eventFeet}`
}

// Rate-limit keys are salted hashes. With a public salt this is
// pseudonymization, not anonymization — set RATE_LIMIT_SALT in the Netlify
// environment to make stored keys non-enumerable. The store grows one tiny
// blob per client and is fine to wipe wholesale at any time (it only backs a
// few-second cooldown).
async function hashClientKey(ip: string) {
  const salt = process.env.RATE_LIMIT_SALT ?? 'scroll-race'
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${ip}`),
  )

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export default async function handler(request: Request, context: Context) {
  const url = new URL(request.url)

  if (request.method === 'GET') {
    const eventFeet = parseEventFeet(url.searchParams.get('event'))

    if (eventFeet === undefined) {
      return json(400, { error: 'Unknown event' })
    }

    const store = getStore(scopedName('leaderboards'))
    const board = (await store.get(boardKey(eventFeet), {
      type: 'json',
    })) as GlobalBoard | null

    return json(
      200,
      {
        entries: (board?.entries ?? []).slice(0, GLOBAL_BOARD_PAGE),
        total: board?.total ?? 0,
      },
      // Uncached: the intro refetch after a race must show the run the
      // player was just told ranked #N.
      { 'cache-control': 'no-store' },
    )
  }

  if (request.method === 'POST') {
    // Measure the actual body, not the client-declared content-length
    // (absent on chunked requests, trivially forgeable everywhere).
    let text: string

    try {
      text = await request.text()
    } catch {
      return json(400, { error: 'Bad body' })
    }

    if (text.length > MAX_BODY_BYTES) {
      return json(413, { error: 'That is a lot of leaderboard' })
    }

    let raw: unknown

    try {
      raw = JSON.parse(text)
    } catch {
      return json(400, { error: 'Bad JSON' })
    }

    const verdict = validateSubmission(raw)

    if (!verdict.ok) {
      return json(422, { error: verdict.reason })
    }

    // Light per-client cooldown so a loop can't flood the board. In
    // production only context.ip is trusted; the header fallback exists for
    // netlify dev, where the edge that sets it isn't in front of us.
    const ip =
      context.ip ||
      (!IS_PRODUCTION
        ? (request.headers.get('x-nf-client-connection-ip') ?? '')
        : '')

    if (ip) {
      const rateLimits = getStore({
        name: scopedName('rate-limits'),
        consistency: 'strong',
      })
      const clientKey = await hashClientKey(ip)
      const lastPost = await rateLimits.get(clientKey)
      const now = Date.now()

      if (lastPost && now - Number(lastPost) < SUBMIT_COOLDOWN_MS) {
        return json(429, {
          error: 'Easy, champion. One post every few seconds.',
        })
      }

      await rateLimits.set(clientKey, String(now))
    }

    const store = getStore({
      name: scopedName('leaderboards'),
      consistency: 'strong',
    })
    const key = boardKey(verdict.eventFeet)
    const board = (await store.get(key, {
      type: 'json',
    })) as GlobalBoard | null

    const entry: GlobalEntry = {
      id: crypto.randomUUID(),
      name: verdict.name,
      timeMs: verdict.timeMs,
      eventFeet: verdict.eventFeet,
      device: verdict.device,
      ppi: verdict.ppi,
      country: context.geo?.country?.code,
      completedAt: new Date().toISOString(),
    }

    const { board: nextBoard, rank } = insertEntry(board, entry)

    await store.setJSON(key, nextBoard)

    return json(200, { rank, total: nextBoard.total })
  }

  return json(405, { error: 'Method not allowed' })
}

export const config: Config = {
  path: '/api/leaderboard',
}
