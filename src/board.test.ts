import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GlobalBoard, GlobalEntry } from './lib/board'
import {
  GLOBAL_BOARD_LIMIT,
  SUBMIT_COOLDOWN_MS,
  areSplitsPlausible,
  insertEntry,
  validateSubmission,
} from './lib/board'

const goodSplits = (timeMs: number) =>
  Array.from({ length: 101 }, (_, mark) => (mark / 100) * timeMs)

const goodSubmission = (overrides: Record<string, unknown> = {}) => ({
  name: 'JP',
  timeMs: 4_200,
  eventFeet: 100,
  splitsMs: goodSplits(4_200),
  ppi: 96,
  device: 'iPhone',
  ...overrides,
})

describe('world board validation', () => {
  it('accepts a legit run and normalizes its fields', () => {
    const verdict = validateSubmission(goodSubmission({ ppi: 815.2 }))

    expect(verdict).toMatchObject({
      ok: true,
      name: 'JP',
      timeMs: 4_200,
      eventFeet: 100,
      device: 'iPhone',
      ppi: 220,
    })
  })

  it('rejects unknown events, junk times, and oversized times', () => {
    expect(
      validateSubmission(goodSubmission({ eventFeet: 123 })),
    ).toMatchObject({ ok: false })
    expect(
      validateSubmission(goodSubmission({ timeMs: 'fast' })),
    ).toMatchObject({ ok: false })
    expect(
      validateSubmission(goodSubmission({ timeMs: 99_999_999 })),
    ).toMatchObject({ ok: false })
    expect(validateSubmission(null)).toMatchObject({ ok: false })
    expect(validateSubmission([1, 2, 3])).toMatchObject({ ok: false })
  })

  it('rejects sub-legit (wind-assisted) times per event', () => {
    expect(
      validateSubmission(
        goodSubmission({ timeMs: 400, splitsMs: goodSplits(400) }),
      ),
    ).toMatchObject({ ok: false })
    expect(
      validateSubmission(
        goodSubmission({
          eventFeet: 1000,
          timeMs: 4_999,
          splitsMs: goodSplits(4_999),
        }),
      ),
    ).toMatchObject({ ok: false })
    expect(
      validateSubmission(
        goodSubmission({
          eventFeet: 1000,
          timeMs: 5_000,
          splitsMs: goodSplits(5_000),
        }),
      ),
    ).toMatchObject({ ok: true })
  })

  it('requires a complete plausible splits trace', () => {
    expect(
      validateSubmission(goodSubmission({ splitsMs: undefined })),
    ).toMatchObject({ ok: false })
    expect(
      validateSubmission(goodSubmission({ splitsMs: [0, 100] })),
    ).toMatchObject({ ok: false })
  })

  it('sanitizes names server-side and falls back to a bib name', () => {
    const sanitized = validateSubmission(
      goodSubmission({ name: '  spam.com <JP> ' }),
    )

    expect(sanitized).toMatchObject({ ok: true, name: 'spam JP' })

    const blank = validateSubmission(goodSubmission({ name: '🚀🚀🚀' }))

    expect(blank.ok).toBe(true)

    if (blank.ok) {
      expect(blank.name).toMatch(/^\S+ \S+$/)
      expect(blank.name.length).toBeLessThanOrEqual(18)
    }
  })

  it('accepts mobile device classes and rejects desktop or unknown devices', () => {
    for (const device of ['iPhone', 'iPad', 'Android']) {
      expect(validateSubmission(goodSubmission({ device }))).toMatchObject({
        ok: true,
        device,
      })
    }

    for (const device of [
      'Windows',
      'Mac',
      'Other',
      'Unknown',
      '<img onerror=x>',
    ]) {
      expect(validateSubmission(goodSubmission({ device }))).toEqual({
        ok: false,
        reason: 'Desktop runs are not eligible',
      })
    }
  })
})

describe('splits plausibility', () => {
  it('accepts monotonic traces with teleport-fill plateaus', () => {
    const fling = Array.from({ length: 101 }, (_, mark) =>
      mark < 20 ? mark * 40 : mark <= 80 ? 800 : 800 + (mark - 80) * 170,
    )

    expect(areSplitsPlausible(fling, fling[100])).toBe(true)
  })

  it('rejects regressions, NaNs, wrong lengths, and mismatched finishes', () => {
    const splits = goodSplits(4_200)

    expect(areSplitsPlausible([...splits].reverse(), 4_200)).toBe(false)
    expect(areSplitsPlausible([Number.NaN, ...splits.slice(1)], 4_200)).toBe(
      false,
    )
    expect(areSplitsPlausible(splits.slice(0, 50), 4_200)).toBe(false)
    expect(areSplitsPlausible(splits, 9_999)).toBe(false)
  })
})

describe('board insertion', () => {
  const entry = (id: string, timeMs: number): GlobalEntry => ({
    id,
    name: id,
    timeMs,
    eventFeet: 100,
    device: 'iPhone',
    ppi: 96,
    completedAt: '2026-06-11T00:00:00.000Z',
  })

  it('ranks a new entry and keeps earlier submissions ahead on ties', () => {
    const first = insertEntry(null, entry('a', 5_000))

    expect(first.rank).toBe(1)

    const second = insertEntry(first.board, entry('b', 5_000))

    expect(second.rank).toBe(2)
    expect(second.board.entries.map((e) => e.id)).toEqual(['a', 'b'])
    expect(second.board.total).toBe(2)
  })

  it('caps the stored board and reports off-board ranks as null', () => {
    let board: GlobalBoard | null = null

    for (let index = 0; index < GLOBAL_BOARD_LIMIT; index += 1) {
      board = insertEntry(board, entry(`e${index}`, 2_000 + index)).board
    }

    const slow = insertEntry(board, entry('slow', 999_999))

    expect(slow.rank).toBeNull()
    expect(slow.board.entries).toHaveLength(GLOBAL_BOARD_LIMIT)
    expect(slow.board.total).toBe(GLOBAL_BOARD_LIMIT + 1)

    const fast = insertEntry(slow.board, entry('fast', 1_000))

    expect(fast.rank).toBe(1)
  })

  it('removes historical desktop entries before ranking mobile runs', () => {
    const board: GlobalBoard = {
      entries: [{ ...entry('desktop', 1_000), device: 'Mac' }],
      total: 1,
    }
    const result = insertEntry(board, entry('mobile', 2_000))

    expect(result.board.entries.map((candidate) => candidate.id)).toEqual([
      'mobile',
    ])
    expect(result.rank).toBe(1)
  })
})

// Integration: the actual function handler against an in-memory Blobs mock.
const blobStores = new Map<string, Map<string, string>>()

vi.mock('@netlify/blobs', () => ({
  getStore: (options: string | { name: string }) => {
    const name = typeof options === 'string' ? options : options.name

    if (!blobStores.has(name)) {
      blobStores.set(name, new Map())
    }

    const data = blobStores.get(name)!

    return {
      get: (key: string, opts?: { type?: string }) => {
        const raw = data.get(key) ?? null

        if (raw !== null && opts?.type === 'json') {
          return Promise.resolve(JSON.parse(raw))
        }

        return Promise.resolve(raw)
      },
      set: (key: string, value: string) => {
        data.set(key, value)

        return Promise.resolve()
      },
      setJSON: (key: string, value: unknown) => {
        data.set(key, JSON.stringify(value))

        return Promise.resolve()
      },
    }
  },
}))

const { default: handler } =
  await import('../netlify/functions/leaderboard.mts')

const context = (ip: string) =>
  ({ ip, geo: { country: { code: 'US' } } }) as never

const post = (body: unknown, ip = '203.0.113.7') =>
  handler(
    new Request('https://example.test/api/leaderboard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    context(ip),
  )

const get = (event: string) =>
  handler(
    new Request(`https://example.test/api/leaderboard?event=${event}`),
    context('203.0.113.7'),
  )

describe('leaderboard function', () => {
  beforeEach(() => {
    blobStores.clear()
  })

  it('round-trips a submission: POST ranks it, GET returns it', async () => {
    const posted = await post(goodSubmission())

    expect(posted.status).toBe(200)

    const postBody = await posted.json()

    expect(postBody).toMatchObject({ rank: 1, total: 1 })

    const fetched = await get('100')

    expect(fetched.status).toBe(200)

    const board = await fetched.json()

    expect(board.total).toBe(1)
    expect(board.entries[0]).toMatchObject({
      name: 'JP',
      timeMs: 4_200,
      eventFeet: 100,
      country: 'US',
    })
  })

  it('rejects invalid submissions with 422', async () => {
    const response = await post(goodSubmission({ timeMs: 50 }))

    expect(response.status).toBe(422)
  })

  it('rejects desktop submissions with 422', async () => {
    const response = await post(goodSubmission({ device: 'Windows' }))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      error: 'Desktop runs are not eligible',
    })
  })

  it('rate-limits rapid posts from the same client', async () => {
    expect((await post(goodSubmission(), '198.51.100.1')).status).toBe(200)
    expect((await post(goodSubmission(), '198.51.100.1')).status).toBe(429)
    expect((await post(goodSubmission(), '198.51.100.2')).status).toBe(200)
  })

  it('allows the same client again once the cooldown expires', async () => {
    vi.useFakeTimers()

    try {
      expect((await post(goodSubmission(), '198.51.100.3')).status).toBe(200)
      vi.advanceTimersByTime(SUBMIT_COOLDOWN_MS + 100)
      expect((await post(goodSubmission(), '198.51.100.3')).status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes to context-scoped stores outside production', async () => {
    await post(goodSubmission())

    // CONTEXT is unset under vitest, so the handler must scope to '-dev'
    // stores — preview/test traffic never touches production blobs.
    expect([...blobStores.keys()]).toEqual(
      expect.arrayContaining(['leaderboards-dev', 'rate-limits-dev']),
    )
    expect(blobStores.has('leaderboards')).toBe(false)
  })

  it('keeps events on separate boards', async () => {
    await post(goodSubmission())

    const dash = await (await get('250')).json()

    expect(dash.entries).toHaveLength(0)

    const junk = await get('123')

    expect(junk.status).toBe(400)
  })

  it('rejects unknown methods and malformed JSON', async () => {
    const deleted = await handler(
      new Request('https://example.test/api/leaderboard', {
        method: 'DELETE',
      }),
      context('203.0.113.9'),
    )

    expect(deleted.status).toBe(405)

    const malformed = await handler(
      new Request('https://example.test/api/leaderboard', {
        method: 'POST',
        body: '{nope',
      }),
      context('203.0.113.10'),
    )

    expect(malformed.status).toBe(400)
  })
})
