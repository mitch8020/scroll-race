// Pure race math + share-text helpers, kept free of DOM access so they can be
// unit tested directly.
//
// Telemetry is PERCENT-based (101 splits, one per percent of the course) so
// every event distance shares one engine: the decile grid, ghost
// interpolation, and pace deltas are identical whether the course is 100 ft
// or 1000 ft. For the original 100 ft event, percent == feet, which keeps
// old stored entries (per-foot splits) fully compatible.

export const PERCENT_STEPS = 100
// A legit scroll needs at least ~5ms per foot of course; the challenge
// floor scales with the event so nobody can mint a link that auto-flags its
// own winner as wind-assisted — a griefing link.
export const MIN_LEGIT_MS_PER_FOOT = 5
export const MAX_CHALLENGE_MS = 5_999_000

export function minChallengeMs(eventFeet: number) {
  return eventFeet * MIN_LEGIT_MS_PER_FOOT
}

export type RaceEvent = {
  feet: number
  name: string
  tagline: string
  /** Ruler tick spacing — coarser for longer courses to cap DOM nodes. */
  tickEveryInches: number
  labelEveryFeet: number
  /** Whole-foot ticks at this interval render as major ticks. */
  majorTickFeet: number
}

export const EVENTS: ReadonlyArray<RaceEvent> = [
  {
    feet: 100,
    name: 'The Sprint',
    tagline: 'The classic. Blink and it’s over.',
    tickEveryInches: 1,
    labelEveryFeet: 5,
    majorTickFeet: 1,
  },
  {
    feet: 250,
    name: 'The Dash',
    tagline: 'Long enough to regret your pace.',
    tickEveryInches: 3,
    labelEveryFeet: 10,
    majorTickFeet: 1,
  },
  {
    feet: 500,
    name: 'The Haul',
    tagline: 'Bring water.',
    tickEveryInches: 6,
    labelEveryFeet: 25,
    majorTickFeet: 1,
  },
  {
    feet: 1000,
    name: 'The Marathon',
    tagline: 'Tell your family you love them.',
    tickEveryInches: 12,
    labelEveryFeet: 50,
    majorTickFeet: 5,
  },
]

export const DEFAULT_EVENT_FEET = 100

export function eventForFeet(feet: number): RaceEvent {
  return EVENTS.find((event) => event.feet === feet) ?? EVENTS[0]
}

export function parseEventFeet(raw: unknown) {
  const value = Number(raw)

  return EVENTS.some((event) => event.feet === value) ? value : undefined
}

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

// Titles and percentiles are judged on pace (time per 100 ft), so a steady
// thumb earns the same title in every event.
function pacePer100FtSeconds(timeMs: number, eventFeet: number) {
  return (timeMs / 1000) * (100 / Math.max(eventFeet, 1))
}

export function rankTitle(timeMs: number, eventFeet = 100) {
  const seconds = pacePer100FtSeconds(timeMs, eventFeet)

  for (const [maxSeconds, title] of RANK_TITLES) {
    if (seconds < maxSeconds) {
      return title
    }
  }

  return 'Lost in the Fine Print'
}

// Logistic curve centered on an 11.5s/100ft pace; copy says "of thumbs".
export function fasterThanPercent(timeMs: number, eventFeet = 100) {
  const seconds = Math.max(pacePer100FtSeconds(timeMs, eventFeet), 0.001)
  const percent =
    100 / (1 + Math.exp((Math.log(seconds) - Math.log(11.5)) / 0.42))

  return Math.min(Math.max(Math.round(percent), 1), 99)
}

// Ten squares, one per tenth of the course, judged against the run's own
// average pace. A decile of zero ms (the fling really was that fast)
// classifies fast.
export function decileGrid(
  splitsMs: ReadonlyArray<number>,
  timeMs: number,
): string {
  if (splitsMs.length < PERCENT_STEPS + 1 || timeMs <= 0) {
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

// A display name is the only player identity available on the anonymous
// leaderboards. Normalize it for comparisons so casing, Unicode presentation,
// or extra spaces cannot create duplicate rows for the same visible player.
export function leaderboardNameKey(raw: string) {
  return (sanitizeName(raw) || 'Racer')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// Deadpan race-official bib names for players who skip the form. Both lists
// are curated so every combination fits the 18-character name budget.
const NAME_FIRSTS = [
  'Turbo',
  'Sneaky',
  'Feral',
  'Mighty',
  'Wobbly',
  'Speedy',
  'Slippery',
  'Electric',
  'Galloping',
  'Unhinged',
  'Sizzling',
  'Frantic',
  'Blazing',
  'Polite',
  'Howling',
  'Rogue',
]

const NAME_LASTS = [
  'Thumb',
  'Gazelle',
  'Walrus',
  'Cheetah',
  'Pigeon',
  'Ferret',
  'Comet',
  'Heron',
  'Mongoose',
  'Yeti',
  'Stallion',
  'Falcon',
  'Otter',
  'Lemur',
  'Wombat',
  'Swift',
]

export function randomRacerName(rng: () => number = Math.random) {
  const first = NAME_FIRSTS[Math.floor(rng() * NAME_FIRSTS.length)]
  const last = NAME_LASTS[Math.floor(rng() * NAME_LASTS.length)]

  return `${first} ${last}`
}

// ?beat= parsing: reject (don't clamp up) values below the event's legit
// floor, reject empty strings (Number('') is 0), cap the top end.
export function parseChallengeMs(
  raw: unknown,
  eventFeet: number = DEFAULT_EVENT_FEET,
) {
  if (raw === undefined || raw === null || raw === '') {
    return undefined
  }

  const value = Number(raw)

  if (!Number.isFinite(value)) {
    return undefined
  }

  const rounded = Math.round(value)

  if (rounded < minChallengeMs(eventFeet)) {
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
  eventFeet?: number
  playerName?: string
  streakDays?: number
  windAssisted?: boolean
  desktopRun?: boolean
  defeated?: string
}

export function buildShareText(input: ShareInput) {
  const eventFeet = input.eventFeet ?? DEFAULT_EVENT_FEET

  if (input.desktopRun) {
    return `SCROLL RACE PRACTICE RUN 🖥️ ${eventFeet} FT · ${formatTime(input.timeMs)} ✱ Desktop runs aren’t eligible. ${input.origin}`
  }

  if (input.windAssisted) {
    return `I cheated at Scroll Race and all I got was this asterisk ✱ ${input.origin}`
  }

  const headline = input.defeated
    ? `I just took down ${input.defeated}’s ${eventFeet} ft record 🏁 ${formatTime(input.timeMs)}`
    : `SCROLL RACE 🏁 ${eventFeet} FT · ${formatTime(input.timeMs)}`
  const streakDays = input.streakDays ?? 0
  const streakSuffix = streakDays >= 3 ? ` · day ${streakDays} streak` : ''
  const rawByName = input.defeated ? input.playerName || 'Me' : input.playerName
  // Non-ASCII names expand 9x under percent-encoding; budget the encoded
  // length so the card stays a single short paste.
  const byName = rawByName ? fitEncodedBudget(rawByName, 54) : rawByName
  const bySuffix = byName ? `&by=${encodeURIComponent(byName)}` : ''
  const challengeUrl = `${input.origin}/?beat=${Math.round(input.timeMs)}&event=${eventFeet}${bySuffix}`

  return [
    headline,
    decileGrid(input.splitsMs, input.timeMs),
    `${rankTitle(input.timeMs, eventFeet)} · faster than ${fasterThanPercent(input.timeMs, eventFeet)}% of thumbs${streakSuffix}`,
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

export function averageMph(timeMs: number, eventFeet = 100) {
  return (eventFeet / (timeMs / 1000)) * 0.681818
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

// Real-world yardsticks, computed per event distance.
const BLUE_WHALE_FT = 98
const GIRAFFE_FT = 17.9
const SCHOOL_BUS_FT = 34.5
const LIBERTY_FT = 151

function formatCount(count: number) {
  if (count < 1) {
    return count.toFixed(2)
  }

  const formatted = count < 100 ? count.toFixed(1) : String(Math.round(count))

  return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted
}

export function unitLine(runNumber: number, eventFeet = 100) {
  const pick = ((runNumber % 4) + 4) % 4

  if (pick === 0) {
    const whales = eventFeet / BLUE_WHALE_FT

    return whales > 0.95 && whales < 1.1
      ? 'You scrolled an entire blue whale, nose to tail.'
      : `You scrolled ${formatCount(whales)} blue whales, nose to tail.`
  }

  if (pick === 1) {
    return `That’s ${formatCount(eventFeet / GIRAFFE_FT)} giraffes, stacked.`
  }

  if (pick === 2) {
    return `That’s ${formatCount(eventFeet / SCHOOL_BUS_FT)} school buses.`
  }

  return `That’s ${formatCount(eventFeet / LIBERTY_FT)} Statues of Liberty (no pedestal).`
}

// Where (in percent of the course) a recorded run was at `elapsedMs`,
// interpolated between its per-percent splits. Falls back to linear pace for
// legacy entries with no splits.
export function percentAtTime(
  splitsMs: ReadonlyArray<number> | null,
  totalMs: number,
  elapsedMs: number,
) {
  if (totalMs <= 0 || elapsedMs >= totalMs) {
    return PERCENT_STEPS
  }

  if (elapsedMs <= 0) {
    return 0
  }

  if (!splitsMs || splitsMs.length < PERCENT_STEPS + 1) {
    return (elapsedMs / totalMs) * PERCENT_STEPS
  }

  let low = 0
  let high = PERCENT_STEPS

  while (low < high) {
    const mid = (low + high + 1) >> 1

    if (splitsMs[mid] <= elapsedMs) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  if (low >= PERCENT_STEPS) {
    return PERCENT_STEPS
  }

  const segmentStart = splitsMs[low]
  const segmentEnd = splitsMs[low + 1]
  const fraction =
    segmentEnd > segmentStart
      ? (elapsedMs - segmentStart) / (segmentEnd - segmentStart)
      : 1

  return Math.min(Math.max(low + fraction, 0), PERCENT_STEPS)
}

// The elapsed ms a recorded run needed to reach `percent` of the course.
export function timeAtPercent(
  splitsMs: ReadonlyArray<number> | null,
  totalMs: number,
  percent: number,
) {
  const clamped = Math.min(Math.max(percent, 0), PERCENT_STEPS)

  if (!splitsMs || splitsMs.length < PERCENT_STEPS + 1) {
    return (clamped / PERCENT_STEPS) * totalMs
  }

  const whole = Math.floor(clamped)

  if (whole >= PERCENT_STEPS) {
    return totalMs
  }

  const fraction = clamped - whole

  return splitsMs[whole] + (splitsMs[whole + 1] - splitsMs[whole]) * fraction
}
