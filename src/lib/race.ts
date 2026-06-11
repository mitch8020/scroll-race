// Pure race math + share-text helpers, kept free of DOM access so they can be
// unit tested directly.

export const TOTAL_FEET = 100
// Floor matches MIN_LEGIT_TIME_MS: a challenge nobody can legitimately beat
// (sub-second) would auto-flag the winner as wind-assisted — a griefing link.
export const MIN_CHALLENGE_MS = 1_000
export const MAX_CHALLENGE_MS = 5_999_000

const RANK_TITLES: Array<[maxSeconds: number, title: string]> = [
  [3, 'Thumb of the Gods'],
  [4.5, 'Greased Lightning'],
  [6, 'Olympic Scroller'],
  [8, 'Certified Speed Thumb'],
  [11, 'Doomscroll Veteran'],
  [15, 'Brisk Walker'],
  [20, 'Sunday Driver'],
  [30, 'Window Shopper'],
  [60, 'Scenic Route Enjoyer'],
]

export function rankTitle(timeMs: number) {
  const seconds = timeMs / 1000

  for (const [maxSeconds, title] of RANK_TITLES) {
    if (seconds < maxSeconds) {
      return title
    }
  }

  return 'Lost in the Fine Print'
}

// Logistic curve centered on 11.5s; copy always says "of thumbs".
export function fasterThanPercent(timeMs: number) {
  const seconds = Math.max(timeMs / 1000, 0.001)
  const percent =
    100 / (1 + Math.exp((Math.log(seconds) - Math.log(11.5)) / 0.42))

  return Math.min(Math.max(Math.round(percent), 1), 99)
}

// Ten squares, one per 10 ft, judged against the run's own average pace.
// A decile of zero ms (the fling really was that fast) classifies fast.
export function decileGrid(
  splitsMs: ReadonlyArray<number>,
  timeMs: number,
): string {
  if (splitsMs.length < TOTAL_FEET + 1 || timeMs <= 0) {
    return ''
  }

  const average = timeMs / 10
  let grid = ''

  for (let decile = 1; decile <= 10; decile += 1) {
    const decileMs = splitsMs[decile * 10] - splitsMs[(decile - 1) * 10]

    grid +=
      decileMs <= average * 0.8
        ? '🟧'
        : decileMs <= average * 1.25
          ? '🟨'
          : '⬜'
  }

  return grid
}

// Truncate to 18 UTF-16 units without ever splitting a surrogate pair — a
// lone high surrogate makes encodeURIComponent throw and would kill sharing.
export function clipName(raw: string) {
  return raw
    .slice(0, 18)
    .replace(/[\uD800-\uDBFF]$/, '')
    .trim()
}

export function sanitizeName(raw: string) {
  return clipName(
    raw
      .replace(/[^\p{L}\p{N} '._-]/gu, '')
      .replace(/\.com/gi, '')
      .trim(),
  )
}

// ?beat= parsing: reject (don't clamp up) sub-legit values, reject empty
// strings (Number('') is 0), cap the top end.
export function parseChallengeMs(raw: unknown) {
  if (raw === undefined || raw === null || raw === '') {
    return undefined
  }

  const value = Number(raw)

  if (!Number.isFinite(value)) {
    return undefined
  }

  const rounded = Math.round(value)

  if (rounded < MIN_CHALLENGE_MS) {
    return undefined
  }

  return Math.min(rounded, MAX_CHALLENGE_MS)
}

export function formatTime(milliseconds: number) {
  const totalSeconds = milliseconds / 1000

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(2)}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60

  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`
}

export type ShareInput = {
  timeMs: number
  splitsMs: ReadonlyArray<number>
  origin: string
  playerName?: string
  streakDays?: number
  windAssisted?: boolean
  defeated?: string
}

export function buildShareText(input: ShareInput) {
  if (input.windAssisted) {
    return `I cheated at Scroll Race and all I got was this asterisk ✱ ${input.origin}`
  }

  const headline = input.defeated
    ? `I just took down ${input.defeated}’s 100 ft record 🏁 ${formatTime(input.timeMs)}`
    : `SCROLL RACE 🏁 ${formatTime(input.timeMs)}`
  const streakDays = input.streakDays ?? 0
  const streakSuffix = streakDays >= 3 ? ` · day ${streakDays} streak` : ''
  const rawByName = input.defeated ? input.playerName || 'Me' : input.playerName
  // Non-ASCII names expand 9x under percent-encoding; budget the encoded
  // length so the card stays a single short paste.
  const byName = rawByName ? fitEncodedBudget(rawByName, 54) : rawByName
  const bySuffix = byName ? `&by=${encodeURIComponent(byName)}` : ''
  const challengeUrl = `${input.origin}/?beat=${Math.round(input.timeMs)}${bySuffix}`

  return [
    headline,
    decileGrid(input.splitsMs, input.timeMs),
    `${rankTitle(input.timeMs)} · faster than ${fasterThanPercent(input.timeMs)}% of thumbs${streakSuffix}`,
    input.defeated ? `Your move: ${challengeUrl}` : `Beat me: ${challengeUrl}`,
  ].join('\n')
}

function fitEncodedBudget(name: string, budget: number) {
  let fitted = name

  while (fitted && encodeURIComponent(fitted).length > budget) {
    fitted = [...fitted].slice(0, -1).join('').trim()
  }

  return fitted
}

export function ftpsToMph(ftps: number) {
  return ftps * 0.681818
}

export function averageMph(timeMs: number) {
  return (TOTAL_FEET / (timeMs / 1000)) * 0.681818
}

export function speedTicketLine(topMph: number) {
  const shown = Math.min(Math.round(topMph), 99)
  const tier =
    topMph < 8
      ? 'a brisk jog'
      : topMph < 15
        ? 'keeping up with an e-bike'
        : topMph < 25
          ? 'doing the city speed limit'
          : topMph < 45
            ? 'a speeding ticket in a school zone'
            : 'license suspended, thumb impounded'

  return `Top speed: ${shown} mph — ${tier}`
}

const UNIT_LINES = [
  'You scrolled an entire blue whale, nose to tail.',
  'That’s 5.6 giraffes, stacked.',
  'That’s 2.9 school buses.',
  'That’s 0.66 Statues of Liberty (no pedestal).',
]

export function unitLine(runNumber: number) {
  return UNIT_LINES[((runNumber % 4) + 4) % 4]
}

// Where (in feet) a recorded run was at `elapsedMs`, interpolated between its
// per-foot splits. Falls back to linear pace for legacy entries with no splits.
export function feetAtTime(
  splitsMs: ReadonlyArray<number> | null,
  totalMs: number,
  elapsedMs: number,
) {
  if (totalMs <= 0 || elapsedMs >= totalMs) {
    return TOTAL_FEET
  }

  if (elapsedMs <= 0) {
    return 0
  }

  if (!splitsMs || splitsMs.length < TOTAL_FEET + 1) {
    return (elapsedMs / totalMs) * TOTAL_FEET
  }

  let low = 0
  let high = TOTAL_FEET

  while (low < high) {
    const mid = (low + high + 1) >> 1

    if (splitsMs[mid] <= elapsedMs) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  if (low >= TOTAL_FEET) {
    return TOTAL_FEET
  }

  const segmentStart = splitsMs[low]
  const segmentEnd = splitsMs[low + 1]
  const fraction =
    segmentEnd > segmentStart
      ? (elapsedMs - segmentStart) / (segmentEnd - segmentStart)
      : 1

  return Math.min(Math.max(low + fraction, 0), TOTAL_FEET)
}

// The elapsed ms a recorded run needed to reach `feet`.
export function timeAtFeet(
  splitsMs: ReadonlyArray<number> | null,
  totalMs: number,
  feet: number,
) {
  const clampedFeet = Math.min(Math.max(feet, 0), TOTAL_FEET)

  if (!splitsMs || splitsMs.length < TOTAL_FEET + 1) {
    return (clampedFeet / TOTAL_FEET) * totalMs
  }

  const wholeFeet = Math.floor(clampedFeet)

  if (wholeFeet >= TOTAL_FEET) {
    return totalMs
  }

  const fraction = clampedFeet - wholeFeet

  return (
    splitsMs[wholeFeet] +
    (splitsMs[wholeFeet + 1] - splitsMs[wholeFeet]) * fraction
  )
}
