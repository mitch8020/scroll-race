import { createFileRoute } from '@tanstack/react-router'
import {
  ChevronsDown,
  Flag,
  Globe,
  Play,
  RotateCcw,
  Ruler,
  Share2,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { CSSProperties, FormEvent } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  clamp,
  createRulerTicks,
  CSS_PIXELS_PER_INCH,
  INCHES_PER_FOOT,
  MAX_PIXELS_PER_INCH,
  MIN_PIXELS_PER_INCH,
  normalizePixelsPerInch,
} from '../lib/course'
import type { RulerTick } from '../lib/course'
import {
  DEFAULT_EVENT_FEET,
  EVENTS,
  MIN_LEGIT_MS_PER_FOOT,
  PERCENT_STEPS,
  averageMph,
  buildShareText,
  clipName,
  eventForFeet,
  fasterThanPercent,
  formatTime,
  ftpsToMph,
  parseChallengeMs,
  parseEventFeet,
  percentAtTime,
  randomRacerName,
  rankTitle,
  sanitizeName,
  speedTicketLine,
  timeAtPercent,
  unitLine,
} from '../lib/race'
import type { GlobalEntry } from '../lib/board'
import { SUBMIT_COOLDOWN_MS } from '../lib/board'
import { fetchGlobalBoard, submitToGlobalBoard } from '../lib/globalBoard'
import type { LeaderboardEntry } from '../lib/localRaceStore'
import {
  MAX_LEADERBOARD_ENTRIES,
  bumpRunCount,
  createEntryId,
  detectDevice,
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
  writeLeaderboard,
  writePb,
  writePixelsPerInch,
  writeSessionNoPbRuns,
  writeStoredEventFeet,
  writeStoredName,
  writeStreak,
} from '../lib/localRaceStore'
import * as sfx from '../lib/sfx'

export { formatTime }
export { createRulerTicks, normalizePixelsPerInch } from '../lib/course'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => {
    // Event first: the challenge floor scales with the distance, so a link
    // can never demand a time the wind-assist check would auto-flag.
    const event = parseEventFeet(search.event)
    const beat = parseChallengeMs(search.beat, event ?? DEFAULT_EVENT_FEET)
    const by = sanitizeName(typeof search.by === 'string' ? search.by : '')

    return {
      beat,
      by: by || undefined,
      event,
    }
  },
  component: Home,
})

const MEET_BANNER_TEXT =
  'OFFICIAL SCROLL MEET · ALL THUMBS WELCOME · SANCTIONED BY NOBODY'
// Brand marks as Simple Icons path data (CC0): lucide ships no Discord glyph,
// so all four brands render from one filled 24×24 set for a matched weight.
const BRAND_PATHS = {
  github:
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  instagram:
    'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  linkedin:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  discord:
    'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z',
} as const

const CREDIT_LINKS: Array<{
  label: string
  href: string
  brand: keyof typeof BRAND_PATHS | null
}> = [
  {
    label: 'Personal Website',
    href: 'https://jpmitra.netlify.app/',
    brand: null,
  },
  { label: 'GitHub', href: 'https://github.com/mitch8020', brand: 'github' },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/johnestofpauls/',
    brand: 'instagram',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/johnestofpauls/',
    brand: 'linkedin',
  },
  {
    label: 'Discord',
    href: 'https://discord.com/users/929047382618955867',
    brand: 'discord',
  },
]
// Milestone gates sit at quarters of the course, whatever its length.
const MILESTONE_PERCENTS = [25, 50, 75]
const COUNTDOWN_FROM = 3
const COUNTDOWN_BEAT_MS = 750
// A single-frame jump bigger than this is a teleport, not a scroll.
const MAX_FRAME_JUMP_VH = 6
const MIN_FRAME_JUMP_PX = 6000
// Teleport-gate jank tolerance: the allowance scales with the gap between
// samples (dropped frames concentrate legit momentum into one reading) but
// is capped so a deliberate stall can't buy an unbounded window.
const FRAME_BUDGET_MS = 16.7
const MAX_JANK_SCALE = 30
const DELTA_UPDATE_INTERVAL_MS = 250
const DELTA_SIGN_HYSTERESIS_MS = 60
// Vertical dash periods of the speed-line layers; transforms wrap on these so
// the pattern tiles seamlessly. Must match the gradients in styles.css.
const SPEED_LAYER_WRAP_A = 220
const SPEED_LAYER_WRAP_B = 110

// Course-side copy positioned by percent so every event distance reads the
// same arc. The labels show real feet for the active event.
const DECADE_MARKS = [
  { percent: 10, copy: 'WARMING UP' },
  { percent: 20, copy: 'FIND YOUR STRIDE' },
  { percent: 30, copy: 'TOP GEAR' },
  { percent: 40, copy: "DON'T BLINK" },
  { percent: 50, copy: 'HALFWAY · NO BRAKES' },
  { percent: 60, copy: 'LUNGS ON FIRE' },
  { percent: 70, copy: "THE WALL ISN'T REAL" },
  { percent: 80, copy: 'EYES ON THE TAPE' },
  { percent: 90, copy: 'SEND IT' },
]

type RaceStatus = 'intro' | 'countdown' | 'racing' | 'finished'

type Challenge = {
  name: string
  timeMs: number
  eventFeet: number
}

type RaceResult = {
  timeMs: number
  eventFeet: number
  splitsMs: Array<number>
  topFtps: number
  windAssisted: boolean
  prevPbMs: number | null
  isPb: boolean
  isRecord: boolean
  streakDays: number
  firstOfDay: boolean
  newDailyBest: boolean
  runNumber: number
  challenge: Challenge | null
}

type GhostPlan =
  | { kind: 'challenge'; name: string; totalMs: number; splitsMs: null }
  | {
      kind: 'pb'
      name: string
      totalMs: number
      splitsMs: Array<number> | null
    }

type GlobalBoardState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: Array<GlobalEntry>; total: number }

type CourseStyle = CSSProperties & {
  '--course-height': string
  '--foot-size': string
  '--inch-size': string
}

function Home() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [pixelsPerInch, setPixelsPerInch] = useState(CSS_PIXELS_PER_INCH)
  const [eventFeet, setEventFeet] = useState(DEFAULT_EVENT_FEET)
  // A challenge link pins the event it was set on. Legacy links carry ?beat
  // with no &event — those were all set on the original 100 ft course, so a
  // pending challenge must never fall through to the local stored event.
  const activeEventFeet =
    search.beat !== undefined
      ? (search.event ?? DEFAULT_EVENT_FEET)
      : (search.event ?? eventFeet)
  const activeEvent = eventForFeet(activeEventFeet)
  const pixelsPerFoot = pixelsPerInch * INCHES_PER_FOOT
  const courseHeight = activeEventFeet * pixelsPerFoot
  const ticks = useMemo(
    () => createRulerTicks(pixelsPerInch, activeEvent),
    [pixelsPerInch, activeEvent],
  )
  const [raceStatus, setRaceStatus] = useState<RaceStatus>('intro')
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM)
  const [goFlash, setGoFlash] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [progressFeet, setProgressFeet] = useState(0)
  const [leaderboard, setLeaderboard] = useState<Array<LeaderboardEntry>>([])
  const [lastResult, setLastResult] = useState<RaceResult | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [hasSaved, setHasSaved] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [lastSavedId, setLastSavedId] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [calibrateOpen, setCalibrateOpen] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [milestoneHit, setMilestoneHit] = useState<{
    feet: number
    key: number
  } | null>(null)
  const [passedMilestones, setPassedMilestones] = useState<Array<number>>([])
  const [ghostPlan, setGhostPlan] = useState<GhostPlan | null>(null)
  const [delta, setDelta] = useState<{ ms: number; ahead: boolean } | null>(
    null,
  )
  const [pbMs, setPbMs] = useState<number | null>(null)
  const [streakDays, setStreakDays] = useState(0)
  const [lapsedStreak, setLapsedStreak] = useState<number | null>(null)
  const [runCount, setRunCount] = useState(0)
  const [noPbRuns, setNoPbRuns] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const [shareFallback, setShareFallback] = useState<string | null>(null)
  const [boardTab, setBoardTab] = useState<'world' | 'device'>('world')
  const [globalBoard, setGlobalBoard] = useState<GlobalBoardState>({
    status: 'loading',
  })
  const [globalRank, setGlobalRank] = useState<number | null>(null)
  const startTimeRef = useRef(0)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const ghostDotRef = useRef<HTMLSpanElement | null>(null)
  const speedLinesRef = useRef<HTMLDivElement | null>(null)
  const streakARef = useRef<HTMLDivElement | null>(null)
  const streakBRef = useRef<HTMLDivElement | null>(null)
  const finishTitleRef = useRef<HTMLHeadingElement | null>(null)
  const editNameButtonRef = useRef<HTMLButtonElement | null>(null)
  const justSubmittedNameRef = useRef(false)
  // Mirror of reducedMotion for the racing rAF: reading the ref keeps the
  // preference out of the racing effect's deps, where a mid-race change
  // would restart the clock and wipe telemetry.
  const reducedMotionRef = useRef(false)
  // In-session PB fallback for when localStorage writes silently fail —
  // keyed by event so switching distances doesn't wipe it.
  const pbRef = useRef<Record<number, number | null>>({})
  // One world-board submission per result, even if save paths re-fire.
  const submittedResultRef = useRef<RaceResult | null>(null)
  const boardBestAtStartRef = useRef<number | null>(null)
  const raceChallengeRef = useRef<Challenge | null>(null)
  const deltaUpdateAtRef = useRef(0)
  const deltaSignRef = useRef<1 | -1>(1)

  const challenge = useMemo<Challenge | null>(
    () =>
      search.beat
        ? {
            timeMs: search.beat,
            name: search.by ?? 'A rival',
            eventFeet: search.event ?? DEFAULT_EVENT_FEET,
          }
        : null,
    [search.beat, search.by, search.event],
  )

  const bestTime = leaderboard[0]?.timeMs
  const resultRank = lastResult
    ? leaderboard.filter((entry) => entry.timeMs < lastResult.timeMs).length + 1
    : null
  const hudVisible = raceStatus === 'racing' || raceStatus === 'finished'

  useEffect(() => {
    setPixelsPerInch(readPixelsPerInch())
    setEventFeet(readStoredEventFeet())
    setRunCount(readRunCount())
    setSoundOn(!sfx.isMuted())

    const storedName = readStoredName()

    setSavedName(storedName)
    setPlayerName(storedName)

    const streak = readStreak()
    const streakRecency = getStreakRecency(streak)

    setStreakDays(streakRecency === 'lapsed' ? 0 : streak.streak)

    // The lapse note shows exactly once after a 3+ day streak dies.
    if (streak.prevStreak >= 3) {
      setLapsedStreak(streak.prevStreak)
      writeStreak({ ...streak, prevStreak: 0 })
    } else if (streak.streak >= 3 && streakRecency === 'lapsed') {
      setLapsedStreak(streak.streak)
      writeStreak({ ...streak, streak: 0, prevStreak: 0 })
    }

    // Track the preference live: enabling reduce-motion mid-session (the
    // exact scenario it exists for) must silence the JS-driven effects too.
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const applyMotionPreference = () => {
      setReducedMotion(mediaQuery.matches)
      reducedMotionRef.current = mediaQuery.matches
      sfx.setHaptics(!mediaQuery.matches)
    }

    applyMotionPreference()
    mediaQuery.addEventListener('change', applyMotionPreference)

    return () => mediaQuery.removeEventListener('change', applyMotionPreference)
  }, [])

  // Each event keeps its own board and personal best.
  useEffect(() => {
    setLeaderboard(readLeaderboard(activeEventFeet))

    const storedPb = readPb(activeEventFeet) ?? pbRef.current[activeEventFeet]

    setPbMs(storedPb ?? null)
    pbRef.current[activeEventFeet] = storedPb ?? null
  }, [activeEventFeet])

  // World board: refresh whenever the intro is showing (mount, event switch,
  // and back-from-a-race so a fresh post appears). Local-first — failure just
  // means the tab falls back to this device's board. Warm data stays on
  // screen during a refresh instead of flashing the skeleton, and the
  // request aborts if the player starts racing. Event switches reset to the
  // skeleton via the eventEpoch key so one event's board never lingers under
  // another's header.
  const lastBoardEventRef = useRef<number | null>(null)

  useEffect(() => {
    if (raceStatus !== 'intro') {
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const sameEvent = lastBoardEventRef.current === activeEventFeet

    lastBoardEventRef.current = activeEventFeet
    setGlobalBoard((previous) =>
      sameEvent && previous.status === 'ready'
        ? previous
        : { status: 'loading' },
    )
    void fetchGlobalBoard(activeEventFeet, controller.signal).then((board) => {
      if (cancelled) {
        return
      }

      setGlobalBoard((previous) =>
        board
          ? { status: 'ready', entries: board.entries, total: board.total }
          : sameEvent && previous.status === 'ready'
            ? previous
            : { status: 'error' },
      )
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [raceStatus, activeEventFeet])

  // Lock the page while the intro / countdown are showing so the player only
  // sees the welcome screen until the race actually begins.
  useEffect(() => {
    const locked = raceStatus === 'intro' || raceStatus === 'countdown'

    document.body.style.overflow = locked ? 'hidden' : ''

    return () => {
      document.body.style.overflow = ''
    }
  }, [raceStatus])

  useEffect(() => {
    // The racing rAF drives progressFeet itself; a second scroll-driven
    // setState here would double React commits mid-fling.
    if (raceStatus === 'racing') {
      return
    }

    const updateProgress = () => {
      const maxScroll = getMaxScroll()
      const progress =
        maxScroll === 0 ? 0 : clamp(window.scrollY / maxScroll, 0, 1)

      setProgressFeet(Number((progress * activeEventFeet).toFixed(1)))
    }

    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress)

    return () => {
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
    }
  }, [raceStatus, activeEventFeet])

  // 3 . 2 . 1 . GO — skippable the moment the player moves. A false start is
  // not penalized; eager players are the signal.
  useEffect(() => {
    if (raceStatus !== 'countdown') {
      return
    }

    setCountdown(COUNTDOWN_FROM)
    sfx.countTick()
    sfx.buzz(15)

    let value = COUNTDOWN_FROM

    const launch = () => {
      window.clearInterval(intervalId)
      setCountdown(0)
      setRaceStatus('racing')
    }

    const intervalId = window.setInterval(() => {
      value -= 1

      if (value <= 0) {
        launch()
      } else {
        setCountdown(value)
        sfx.countTick()
        sfx.buzz(15)
      }
    }, COUNTDOWN_BEAT_MS)

    const skip = () => launch()
    // Trackpad momentum keeps emitting wheel events for 1-2s after the
    // fingers lift; without a grace window a leftover tick from the scroll
    // that preceded clicking Start skips the countdown instantly.
    const mountedAt = performance.now()
    const skipOnWheel = () => {
      if (performance.now() - mountedAt > 250) {
        launch()
      }
    }
    const skipOnKey = (event: KeyboardEvent) => {
      if (event.repeat) {
        return
      }

      if ([' ', 'Enter', 'ArrowDown', 'PageDown'].includes(event.key)) {
        event.preventDefault()
        launch()
      }
    }

    window.addEventListener('pointerdown', skip)
    window.addEventListener('wheel', skipOnWheel, { passive: true })
    window.addEventListener('touchmove', skip, { passive: true })
    window.addEventListener('keydown', skipOnKey)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('wheel', skipOnWheel)
      window.removeEventListener('touchmove', skip)
      window.removeEventListener('keydown', skipOnKey)
    }
  }, [raceStatus])

  useEffect(() => {
    if (raceStatus !== 'racing') {
      return
    }

    startTimeRef.current = performance.now()

    // Telemetry for the race: per-percent splits, smoothed velocity, teleport
    // detection. All refs + locals — the only per-frame setState calls are
    // setElapsedMs + setProgressFeet (batched into one commit), plus rare
    // event-driven writes (milestones, delta at 4Hz).
    const raceFeet = activeEventFeet
    const minLegitMs = raceFeet * MIN_LEGIT_MS_PER_FOOT
    const splits = new Array<number>(PERCENT_STEPS + 1).fill(0)
    let lastPercentMark = 0
    let prevPercent = 0
    let lastY = window.scrollY
    let lastTs = performance.now()
    let velocity = 0
    let topVelocity = 0
    let windAssisted = false
    // The countdown overlay latches the skipping touch (touch-action: none on
    // the overlay means that gesture can never scroll), so the clock slides
    // forward until the first real movement — mobile players don't pay a
    // dead-gesture tax. Times therefore exclude GO-reaction latency.
    let clockArmed = false
    const startY = window.scrollY
    // Cached layout reads: the course height is static mid-race, and
    // innerHeight only moves when the mobile toolbar collapses — refresh both
    // on resize so the rAF never forces a reflow.
    let maxScroll = getMaxScroll()
    let viewportHeight = window.innerHeight

    const refreshViewport = () => {
      maxScroll = getMaxScroll()
      viewportHeight = window.innerHeight
    }

    deltaUpdateAtRef.current = 0
    deltaSignRef.current = 1
    setGoFlash(true)
    setAnnouncement('Go — scroll to the finish')
    sfx.goBlast()
    sfx.buzz(40)

    let frameId = 0
    let finished = false
    const goTimeout = window.setTimeout(() => setGoFlash(false), 720)
    const plan = ghostPlan
    const boardBestAtStart = boardBestAtStartRef.current

    const finishRace = () => {
      if (finished) {
        return
      }

      finished = true

      const finalTime = Math.max(performance.now() - startTimeRef.current, 0)

      // The scroll listener can finish the race between rAF frames, so the
      // final jump must be teleport-checked here too — otherwise one End-key
      // leap straight onto the tape bypasses detection entirely. The gap
      // scaling mirrors the in-loop gate (see updateTimer).
      const finishGapMs = Math.max(performance.now() - lastTs, FRAME_BUDGET_MS)

      if (
        Math.abs(window.scrollY - lastY) >
        Math.max(viewportHeight * MAX_FRAME_JUMP_VH, MIN_FRAME_JUMP_PX) *
          Math.min(finishGapMs / FRAME_BUDGET_MS, MAX_JANK_SCALE)
      ) {
        windAssisted = true
      }

      while (lastPercentMark < PERCENT_STEPS) {
        lastPercentMark += 1
        splits[lastPercentMark] = finalTime
      }

      if (finalTime < minLegitMs) {
        windAssisted = true
      }

      if (speedLinesRef.current) {
        speedLinesRef.current.style.opacity = '0'
      }

      // A sub-720ms finish would otherwise leave the GO flash mounted (its
      // timeout gets cleared by the effect teardown) — and visible forever
      // under reduced motion.
      setGoFlash(false)

      // Storage is best-effort: if writes silently fail, the in-session ref
      // keeps PB deltas honest instead of claiming a first time every run.
      const prevPb = readPb(raceFeet) ?? pbRef.current[raceFeet] ?? null
      const isPb = !windAssisted && (prevPb === null || finalTime < prevPb)

      if (isPb) {
        writePb(raceFeet, finalTime)
        setPbMs(finalTime)
        pbRef.current[raceFeet] = finalTime
      }

      const isRecord =
        !windAssisted &&
        boardBestAtStart !== null &&
        finalTime < boardBestAtStart

      let streakNow = 0
      let firstOfDay = false
      let newDailyBest = false

      if (!windAssisted) {
        const update = updateStreakOnFinish(finalTime)

        streakNow = update.streak
        firstOfDay = update.firstOfDay
        newDailyBest = update.newDailyBest
        setStreakDays(update.streak)
      }

      const runNumber = bumpRunCount()

      setRunCount(runNumber)

      const sessionNoPb = isPb ? 0 : readSessionNoPbRuns() + 1

      writeSessionNoPbRuns(sessionNoPb)
      setNoPbRuns(sessionNoPb)

      sfx.fanfare(isRecord)
      sfx.buzz(isRecord ? [25, 40, 25, 40, 120] : [35, 50, 70])

      setElapsedMs(finalTime)
      setProgressFeet(raceFeet)
      setAnnouncement(`Finished — ${formatTime(finalTime)}`)
      setLastResult({
        timeMs: finalTime,
        eventFeet: raceFeet,
        splitsMs: splits.slice(),
        topFtps: topVelocity,
        windAssisted,
        prevPbMs: prevPb,
        isPb,
        isRecord,
        streakDays: streakNow,
        firstOfDay,
        newDailyBest,
        runNumber,
        challenge: raceChallengeRef.current,
      })
      setRaceStatus('finished')
    }

    // The rAF path passes the y it already read this frame so the style
    // writes above it never precede a fresh layout read; the scroll-listener
    // path reads fresh because it runs outside the frame.
    const finishIfDone = (currentMaxScroll: number, currentY: number) => {
      if (currentMaxScroll > 0 && currentMaxScroll - currentY <= 2) {
        finishRace()
      }
    }

    // Registered directly as a scroll listener — must take no parameters so
    // the Event argument can't shadow the cached maxScroll.
    const checkFinish = () => finishIfDone(maxScroll, window.scrollY)

    // iOS Safari does not reliably honor overscroll-behavior on the root
    // scroller, so while racing, a downward drag from the very top is
    // cancelled before pull-to-refresh can engage. The 12px slop leaves
    // legitimate upward flicks untouched.
    let touchAnchorY = 0
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        touchAnchorY = event.touches[0].clientY
      }
    }
    const onTouchMove = (event: TouchEvent) => {
      if (window.scrollY > 0 || event.touches.length !== 1) {
        return
      }

      const pullDistance = event.touches[0].clientY - touchAnchorY

      if (pullDistance > 12 && event.cancelable) {
        event.preventDefault()
      }
    }

    const updateTimer = () => {
      if (finished) {
        return
      }

      const now = performance.now()

      if (!clockArmed) {
        if (window.scrollY !== startY) {
          clockArmed = true
        } else {
          // Slide the start forward: waiting at the line costs zero time.
          startTimeRef.current = now
        }
      }

      const elapsed = Math.max(now - startTimeRef.current, 0)
      const y = window.scrollY
      const percent =
        maxScroll === 0 ? 0 : clamp(y / maxScroll, 0, 1) * PERCENT_STEPS
      const feet = (percent / PERCENT_STEPS) * raceFeet

      // Per-percent splits. A fling that skips marks fills every skipped one
      // with the same timestamp, so the array is always complete.
      while (lastPercentMark < Math.floor(percent)) {
        lastPercentMark += 1
        splits[lastPercentMark] = elapsed
      }

      const dt = now - lastTs
      const dy = y - lastY

      if (dt > 0) {
        const ftps = Math.max(0, dy / pixelsPerFoot / (dt / 1000))

        velocity = velocity * 0.85 + ftps * 0.15
        topVelocity = Math.max(topVelocity, velocity)
      }

      // A stall concentrates several frames of legit momentum into one
      // sample; scale the teleport gate by the frame gap (capped) so jank
      // doesn't read as cheating. A real End-key jump lands inside one
      // ~16.7ms frame and still trips the unscaled threshold; scripted fast
      // finishes remain backstopped by the minLegitMs time floor.
      const jumpAllowance =
        Math.max(viewportHeight * MAX_FRAME_JUMP_VH, MIN_FRAME_JUMP_PX) *
        Math.min(
          Math.max(dt, FRAME_BUDGET_MS) / FRAME_BUDGET_MS,
          MAX_JANK_SCALE,
        )

      if (Math.abs(dy) > jumpAllowance) {
        windAssisted = true
      }

      lastY = y
      lastTs = now

      const crossed = MILESTONE_PERCENTS.filter(
        (milestone) => prevPercent < milestone && percent >= milestone,
      )

      if (crossed.length > 0) {
        const lastCrossed = crossed[crossed.length - 1]
        const crossedFeet = Math.round((lastCrossed / PERCENT_STEPS) * raceFeet)

        setPassedMilestones((prev) => [...new Set([...prev, ...crossed])])

        if (!reducedMotionRef.current) {
          setMilestoneHit({ feet: crossedFeet, key: now })
        }

        // Screen-reader cue must not depend on the visual-motion gate above.
        setAnnouncement(`${crossedFeet} feet`)
        sfx.milestoneTick(lastCrossed)
        sfx.buzz(18)
      }

      prevPercent = percent

      const lines = speedLinesRef.current

      if (lines && !reducedMotionRef.current) {
        lines.style.opacity = String(clamp((velocity - 8) / 22, 0, 1) * 0.55)

        // Compositor-only parallax: two small dash layers translate at
        // different rates, wrapping on their dash periods.
        if (streakARef.current) {
          streakARef.current.style.transform = `translateY(${-((y * 1.4) % SPEED_LAYER_WRAP_A)}px)`
        }

        if (streakBRef.current) {
          streakBRef.current.style.transform = `translateY(${-((y * 2.1) % SPEED_LAYER_WRAP_B)}px)`
        }
      }

      if (plan) {
        const ghostPercent =
          plan.kind === 'challenge'
            ? Math.min(elapsed / plan.totalMs, 1) * PERCENT_STEPS
            : percentAtTime(plan.splitsMs, plan.totalMs, elapsed)

        if (ghostRef.current) {
          // The challenger line is offset so it crosses the finish tape at
          // exactly the challenge time, matching the player's own win
          // condition (viewport bottom reaching page bottom). The PB ghost is
          // positioned by course percent so it stays fair even if the px/in
          // calibration changed since the PB run — intentional, not a bug.
          const ghostTop =
            plan.kind === 'challenge'
              ? (ghostPercent / PERCENT_STEPS) * maxScroll + viewportHeight - 44
              : (ghostPercent / PERCENT_STEPS) * raceFeet * pixelsPerFoot

          ghostRef.current.style.transform = `translateY(${ghostTop}px)`
        }

        if (ghostDotRef.current) {
          ghostDotRef.current.style.left = `${ghostPercent}%`
        }

        if (now - deltaUpdateAtRef.current >= DELTA_UPDATE_INTERVAL_MS) {
          deltaUpdateAtRef.current = now

          const deltaMs =
            plan.kind === 'challenge'
              ? maxScroll === 0
                ? 0
                : (y / maxScroll) * plan.totalMs - elapsed
              : timeAtPercent(plan.splitsMs, plan.totalMs, percent) - elapsed

          if (Math.abs(deltaMs) > DELTA_SIGN_HYSTERESIS_MS) {
            deltaSignRef.current = deltaMs >= 0 ? 1 : -1
          }

          setDelta({ ms: Math.abs(deltaMs), ahead: deltaSignRef.current > 0 })
        }
      }

      // Both setters batch into a single React commit per frame.
      setElapsedMs(elapsed)
      setProgressFeet(Number(feet.toFixed(1)))
      finishIfDone(maxScroll, y)
      frameId = window.requestAnimationFrame(updateTimer)
    }

    window.addEventListener('scroll', checkFinish, { passive: true })
    window.addEventListener('resize', refreshViewport)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    updateTimer()

    return () => {
      window.clearTimeout(goTimeout)
      window.removeEventListener('scroll', checkFinish)
      window.removeEventListener('resize', refreshViewport)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.cancelAnimationFrame(frameId)
    }
    // reducedMotion is intentionally read via ref: a mid-race preference
    // change must not restart this effect (it would reset the clock).
    // activeEventFeet and pixelsPerFoot only change on the intro screen.
  }, [raceStatus, pixelsPerFoot, ghostPlan, activeEventFeet])

  const beginCountdown = useCallback(() => {
    // Must stay synchronous in the click handler: iOS/Chrome gate audio on a
    // user gesture.
    sfx.ensureAudio()
    setElapsedMs(0)
    setProgressFeet(0)
    setLastResult(null)
    setHasSaved(false)
    setEditingName(false)
    setShareCopied(false)
    setGoFlash(false)
    setMilestoneHit(null)
    setPassedMilestones([])
    setDelta(null)
    setLastSavedId(null)
    setAnnouncement('')
    setShareFallback(null)
    setGlobalRank(null)
    // Drop any in-flight world-board submit from the previous run so a late
    // response can't pin run N's rank onto run N+1's finish panel.
    submittedResultRef.current = null
    raceChallengeRef.current = challenge
    boardBestAtStartRef.current = leaderboard[0]?.timeMs ?? null

    const best = leaderboard.at(0)

    setGhostPlan(
      challenge
        ? {
            kind: 'challenge',
            name: challenge.name,
            totalMs: challenge.timeMs,
            splitsMs: null,
          }
        : best
          ? {
              kind: 'pb',
              name: best.name,
              totalMs: best.timeMs,
              splitsMs: best.splitsMs ?? null,
            }
          : null,
    )
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    setRaceStatus('countdown')
  }, [challenge, leaderboard])

  // Send the player all the way back to the welcome screen at the top.
  const resetToTop = () => {
    setRaceStatus('intro')
    setElapsedMs(0)
    setProgressFeet(0)
    setGoFlash(false)
    setMilestoneHit(null)
    setPassedMilestones([])
    setDelta(null)
    setShareCopied(false)
    setEditingName(false)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  const saveEntry = useCallback(
    (name: string) => {
      if (!lastResult || lastResult.windAssisted) {
        return
      }

      const entry: LeaderboardEntry = {
        id: createEntryId(),
        // Skipping the form earns a deadpan bib name, not "Anonymous".
        name: clipName(name.trim()) || randomRacerName(),
        timeMs: lastResult.timeMs,
        completedAt: new Date().toISOString(),
        splitsMs: lastResult.splitsMs,
        eventFeet: lastResult.eventFeet,
        ppi: pixelsPerInch,
        device: detectDevice(),
      }
      const nextLeaderboard = [...leaderboard, entry]
        .sort((left, right) => left.timeMs - right.timeMs)
        .slice(0, MAX_LEADERBOARD_ENTRIES)

      setLeaderboard(nextLeaderboard)
      writeLeaderboard(lastResult.eventFeet, nextLeaderboard)
      setHasSaved(true)
      setLastSavedId(entry.id)
      setSavedName(entry.name)
      setPlayerName(entry.name)
      writeStoredName(entry.name)

      // Saving publishes to the world board too (once per result). The form
      // copy discloses this; wind-assisted runs never reach saveEntry. A
      // rapid Run-it-back rhythm can trip the server cooldown, so a 429
      // earns exactly one delayed retry — and every callback checks the ref
      // so a response landing after the next race starts is dropped.
      if (submittedResultRef.current !== lastResult) {
        submittedResultRef.current = lastResult

        const submission = {
          name: entry.name,
          timeMs: lastResult.timeMs,
          eventFeet: lastResult.eventFeet,
          splitsMs: lastResult.splitsMs,
          ppi: pixelsPerInch,
          device: detectDevice(),
        }

        const postRun = (attempt: number) => {
          void submitToGlobalBoard(submission).then((result) => {
            if (submittedResultRef.current !== lastResult) {
              return
            }

            if (result === 'rate-limited' && attempt === 0) {
              window.setTimeout(() => {
                if (submittedResultRef.current === lastResult) {
                  postRun(1)
                }
              }, SUBMIT_COOLDOWN_MS + 500)

              return
            }

            if (result && result !== 'rate-limited') {
              setGlobalRank(result.rank)
            }
          })
        }

        postRun(0)
      }

      // A won challenge is settled: clear the params so future shares don't
      // carry a stale ?beat. A lost one stays standing for retries.
      if (
        lastResult.challenge &&
        lastResult.timeMs < lastResult.challenge.timeMs
      ) {
        // Adopt the challenge's event as the local selection first so
        // clearing ?event doesn't snap the course to a different distance
        // while the finish panel is up.
        setEventFeet(lastResult.eventFeet)
        writeStoredEventFeet(lastResult.eventFeet)
        void navigate({
          search: { beat: undefined, by: undefined, event: undefined },
          replace: true,
          // Without this, scroll restoration yanks the player from the
          // finish panel back to the top of the course mid-celebration.
          resetScroll: false,
        })
      }
    },
    [lastResult, leaderboard, navigate, pixelsPerInch],
  )

  // Zero-tap auto-save: returning players are on the board the moment they
  // cross the tape.
  useEffect(() => {
    if (
      raceStatus === 'finished' &&
      lastResult &&
      !lastResult.windAssisted &&
      !hasSaved &&
      savedName
    ) {
      saveEntry(savedName)
    }
  }, [raceStatus, lastResult, hasSaved, savedName, saveEntry])

  // R or Enter races again from the finish panel — but only when no control
  // is focused, so Enter can't be stolen from forms, links, or buttons.
  useEffect(() => {
    if (raceStatus !== 'finished') {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return
      }

      const target = event.target as HTMLElement | null

      if (target && target !== document.body && target.id !== 'finish-title') {
        return
      }

      if (event.key === 'r' || event.key === 'R' || event.key === 'Enter') {
        beginCountdown()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [raceStatus, beginCountdown])

  // Land screen readers and keyboards on the result when the race ends.
  useEffect(() => {
    if (raceStatus === 'finished') {
      finishTitleRef.current?.focus()
    }
  }, [raceStatus])

  // After an interactive save unmounts the form, park focus on the visible
  // 'Not {name}?' control instead of letting it drop to <body>, where the
  // next Enter would silently restart the race.
  useEffect(() => {
    if (hasSaved && !editingName && justSubmittedNameRef.current) {
      justSubmittedNameRef.current = false
      editNameButtonRef.current?.focus()
    }
  }, [hasSaved, editingName])

  const saveResult = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!lastResult || lastResult.windAssisted) {
      return
    }

    justSubmittedNameRef.current = true

    const trimmed = clipName(playerName.trim())

    if (hasSaved && lastSavedId) {
      const name = trimmed || randomRacerName()
      const nextLeaderboard = leaderboard.map((entry) =>
        entry.id === lastSavedId ? { ...entry, name } : entry,
      )

      setLeaderboard(nextLeaderboard)
      writeLeaderboard(lastResult.eventFeet, nextLeaderboard)
      setSavedName(name)
      setPlayerName(name)
      writeStoredName(name)
      setEditingName(false)

      return
    }

    saveEntry(trimmed)
    setEditingName(false)
  }

  const shareRun = () => {
    if (!lastResult) {
      return
    }

    let text: string

    try {
      text = buildShareText({
        timeMs: lastResult.timeMs,
        splitsMs: lastResult.splitsMs,
        origin: window.location.origin,
        eventFeet: lastResult.eventFeet,
        playerName: savedName || undefined,
        streakDays: lastResult.streakDays,
        windAssisted: lastResult.windAssisted,
        defeated:
          lastResult.challenge &&
          lastResult.timeMs < lastResult.challenge.timeMs
            ? lastResult.challenge.name
            : undefined,
      })
    } catch {
      return
    }

    if (typeof navigator.share === 'function') {
      navigator.share({ text }).catch(() => {})

      return
    }

    try {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setShareCopied(true)
          window.setTimeout(() => setShareCopied(false), 2000)
        })
        .catch(() => setShareFallback(text))
    } catch {
      // No share sheet, no clipboard (insecure context / old WebView): show
      // the text so the button always visibly does something.
      setShareFallback(text)
    }
  }

  const toggleSound = () => {
    sfx.setMuted(soundOn)
    setSoundOn(!soundOn)
  }

  const selectEvent = (feet: number) => {
    // Re-clicking the checked radio is a no-op — it must not silently
    // dismiss a pending challenge.
    if (feet === activeEventFeet) {
      return
    }

    setEventFeet(feet)
    writeStoredEventFeet(feet)

    // Picking a different event dismisses a pending challenge: the slip and
    // the pinned distance both came from the link.
    if (search.beat !== undefined || search.event !== undefined) {
      void navigate({
        search: { beat: undefined, by: undefined, event: undefined },
        replace: true,
        resetScroll: false,
      })
    }
  }

  // WAI-ARIA radiogroup keyboard model: one tab stop, arrows move selection.
  const eventOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const onEventPickerKeyDown = (event: React.KeyboardEvent) => {
    const current = EVENTS.findIndex(
      (raceEvent) => raceEvent.feet === activeEventFeet,
    )
    let next = -1

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (current + 1) % EVENTS.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (current - 1 + EVENTS.length) % EVENTS.length
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = EVENTS.length - 1
    }

    if (next === -1) {
      return
    }

    // Arrows/Home/End otherwise scroll the document — bad in a scroll game.
    event.preventDefault()
    selectEvent(EVENTS[next].feet)
    eventOptionRefs.current[next]?.focus()
  }

  const updatePixelsPerInch = (nextValue: number) => {
    const normalizedValue = normalizePixelsPerInch(nextValue)

    setPixelsPerInch(normalizedValue)
    writePixelsPerInch(normalizedValue)
  }

  const resetPixelsPerInch = () => {
    setPixelsPerInch(CSS_PIXELS_PER_INCH)
    writePixelsPerInch(CSS_PIXELS_PER_INCH)
  }

  const courseStyle: CourseStyle = {
    '--course-height': `${courseHeight}px`,
    '--foot-size': `${pixelsPerFoot}px`,
    '--inch-size': `${pixelsPerInch}px`,
  }

  const savedEntry = lastSavedId
    ? leaderboard.find((entry) => entry.id === lastSavedId)
    : undefined
  const savedRank = savedEntry ? leaderboard.indexOf(savedEntry) + 1 : null

  return (
    <main className="scrollRace" data-status={raceStatus} style={courseStyle}>
      {/* Discrete announcements only (milestones, finish) — never the
          per-frame timer, which would flood screen readers. */}
      <div className="srOnly" aria-live="polite">
        {announcement}
      </div>

      {hudVisible ? (
        <header className="raceHud">
          <div className="hudMetric" role="timer" aria-label="Elapsed time">
            <Timer size={18} aria-hidden="true" />
            <span>{formatTime(elapsedMs)}</span>
          </div>
          <div className="hudProgress">
            <span>{progressFeet.toFixed(1)} ft</span>
            <span className="hudTrack">
              <progress
                value={progressFeet}
                max={activeEventFeet}
                aria-label="Race progress"
              />
              {ghostPlan ? (
                <span
                  className="hudGhostDot"
                  ref={ghostDotRef}
                  aria-hidden="true"
                />
              ) : null}
            </span>
          </div>
          <button
            className="hudIconButton"
            type="button"
            onClick={toggleSound}
            aria-label="Sound"
            aria-pressed={soundOn}
            title={soundOn ? 'Mute sounds' : 'Unmute sounds'}
          >
            {soundOn ? (
              <Volume2 size={18} aria-hidden="true" />
            ) : (
              <VolumeX size={18} aria-hidden="true" />
            )}
          </button>
          <button
            className="hudButton"
            type="button"
            onClick={beginCountdown}
            title="Restart the race"
          >
            <RotateCcw size={18} aria-hidden="true" />
            <span>Restart</span>
          </button>
        </header>
      ) : null}

      {raceStatus === 'racing' && ghostPlan && delta ? (
        <div
          className={`deltaChip ${delta.ahead ? 'isAhead' : 'isBehind'}`}
          aria-hidden="true"
        >
          {delta.ahead ? '▲' : '▼'} {(delta.ms / 1000).toFixed(2)}s{' '}
          {delta.ahead ? 'ahead of' : 'behind'}{' '}
          {ghostPlan.kind === 'pb' ? 'PB' : ghostPlan.name}
        </div>
      ) : null}

      {raceStatus === 'racing' && !reducedMotion ? (
        <div className="speedLines" ref={speedLinesRef} aria-hidden="true">
          <div className="speedLayer speedLayer-a" ref={streakARef} />
          <div className="speedLayer speedLayer-b" ref={streakBRef} />
        </div>
      ) : null}

      {milestoneHit ? (
        <>
          <div
            className="milestoneToast"
            key={milestoneHit.key}
            aria-hidden="true"
            onAnimationEnd={() => setMilestoneHit(null)}
          >
            <span className="milestoneToastBack">{milestoneHit.feet} FT</span>
            <span className="milestoneToastFront">{milestoneHit.feet} FT</span>
          </div>
          <div
            className="edgePulse"
            key={`pulse-${milestoneHit.key}`}
            aria-hidden="true"
          />
        </>
      ) : null}

      <section
        className="raceCourse"
        aria-label={`${activeEventFeet}-foot scroll race course`}
      >
        <RulerRail ticks={ticks} />

        <div className="raceLane" aria-hidden="true" />

        <div className="courseStart" aria-hidden="true">
          <div className="courseStartLine">
            <span className="courseStartLabel">
              <Flag size={16} aria-hidden="true" />
              Start · 0 ft
            </span>
          </div>
          <p className="courseScrollHint">
            <ChevronsDown size={20} aria-hidden="true" />
            Scroll to the finish
          </p>
        </div>

        <DecadeMarks eventFeet={activeEventFeet} courseHeight={courseHeight} />

        <MilestoneGates
          passed={passedMilestones}
          eventFeet={activeEventFeet}
          courseHeight={courseHeight}
        />

        {ghostPlan && (raceStatus === 'racing' || raceStatus === 'finished') ? (
          <div
            className={`paceGhost paceGhost-${ghostPlan.kind}`}
            ref={ghostRef}
            aria-hidden="true"
          >
            <span className="paceGhostLabel">
              {ghostPlan.kind === 'challenge'
                ? `🏁 ${ghostPlan.name} · ${formatTime(ghostPlan.totalMs)} pace`
                : `◌ PB · ${ghostPlan.name} · ${formatTime(ghostPlan.totalMs)}`}
            </span>
          </div>
        ) : null}

        <section className="finishZone" aria-labelledby="finish-title">
          <div className="finishTape" aria-hidden="true">
            <span className="tapeHalf tapeHalf-l" />
            <span className="tapeHalf tapeHalf-r" />
            {Array.from({ length: 7 }, (_, index) => (
              <i
                key={index}
                className="tapeShard"
                style={{ '--i': index } as CSSProperties}
              />
            ))}
          </div>
          <div
            className="finishPanel"
            key={raceStatus === 'finished' ? 'finished' : 'idle'}
          >
            {raceStatus === 'finished' && lastResult ? (
              <>
                {lastResult.windAssisted ? (
                  <p className="windStamp">WIND-ASSISTED ✱</p>
                ) : lastResult.isRecord ? (
                  <p className="recordBadge">★ New record</p>
                ) : (
                  <p className="rankStamp">
                    {rankTitle(lastResult.timeMs, lastResult.eventFeet)}
                  </p>
                )}
                {!lastResult.windAssisted &&
                !lastResult.isRecord &&
                (lastResult.firstOfDay || lastResult.newDailyBest) ? (
                  <p className="dayPill">
                    {lastResult.firstOfDay
                      ? `Day ${lastResult.streakDays} stamped ✓`
                      : 'New daily best'}
                  </p>
                ) : null}
                <h2 id="finish-title" tabIndex={-1} ref={finishTitleRef}>
                  Finished!
                </h2>
                <p className="resultTime">
                  {formatTime(lastResult.timeMs)}
                  {lastResult.windAssisted ? '✱' : ''}
                </p>
                {lastResult.windAssisted ? (
                  <p className="windNote">
                    Times set with the End key don’t count. The ruler saw
                    everything.
                  </p>
                ) : (
                  <>
                    <PbDeltaLine result={lastResult} />
                    {lastResult.challenge ? (
                      <p className="resultRank">
                        {verdictLine(lastResult, lastResult.challenge)}
                      </p>
                    ) : (
                      <p className="resultRank">
                        {resultRank === 1
                          ? 'Fastest run on record'
                          : `That run ranks #${resultRank}`}
                      </p>
                    )}
                    <p className="percentileLine">
                      Faster than{' '}
                      {fasterThanPercent(
                        lastResult.timeMs,
                        lastResult.eventFeet,
                      )}
                      % of thumbs
                    </p>
                    <ul className="funFacts">
                      <li>
                        Average thumb speed:{' '}
                        {averageMph(
                          lastResult.timeMs,
                          lastResult.eventFeet,
                        ).toFixed(1)}{' '}
                        mph
                      </li>
                      <li>{speedTicketLine(ftpsToMph(lastResult.topFtps))}</li>
                      <li>
                        {unitLine(lastResult.runNumber, lastResult.eventFeet)}
                      </li>
                    </ul>
                  </>
                )}
                <div className="finishActions">
                  <button
                    className={`secondaryButton finishAction${shareCopied ? ' isCopied' : ''}`}
                    type="button"
                    onClick={shareRun}
                  >
                    <Share2 size={18} aria-hidden="true" />
                    {shareCopied
                      ? 'Copied — go intimidate someone.'
                      : 'Share this run'}
                  </button>
                  <button
                    className="primaryButton finishAction"
                    type="button"
                    onClick={beginCountdown}
                  >
                    <RotateCcw size={18} aria-hidden="true" />
                    {noPbRuns >= 3
                      ? 'One more. For real this time.'
                      : 'Run it back'}
                  </button>
                </div>
                {shareFallback ? (
                  <textarea
                    className="shareFallback"
                    readOnly
                    rows={4}
                    value={shareFallback}
                    aria-label="Share text — copy it yourself"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                ) : null}
                {lastResult.windAssisted ? (
                  <button
                    className="secondaryButton notEligible"
                    disabled
                    type="button"
                  >
                    <Trophy size={18} aria-hidden="true" />
                    Not eligible
                  </button>
                ) : hasSaved && !editingName ? (
                  <p className="savedNote">
                    {savedRank ? 'On the board as ' : 'Saved as '}
                    <strong>{savedEntry?.name ?? savedName}</strong>
                    {savedRank ? ` · #${savedRank}` : ' — outside the top 10'}
                    {globalRank ? ` · #${globalRank} worldwide` : ''}
                    <button
                      className="textButton"
                      type="button"
                      ref={editNameButtonRef}
                      onClick={() => setEditingName(true)}
                    >
                      Not {savedEntry?.name ?? savedName}?
                    </button>
                  </p>
                ) : (
                  <form className="saveForm" onSubmit={saveResult}>
                    <label className="srOnly" htmlFor="player-name">
                      Name for leaderboard
                    </label>
                    <input
                      id="player-name"
                      maxLength={18}
                      onChange={(event) => setPlayerName(event.target.value)}
                      placeholder="Add your name to the board"
                      type="text"
                      autoComplete="nickname"
                      enterKeyHint="done"
                      autoCapitalize="words"
                      value={playerName}
                    />
                    <button className="secondaryButton" type="submit">
                      <Trophy size={18} aria-hidden="true" />
                      {hasSaved ? 'Update name' : 'Save time'}
                    </button>
                    {hasSaved ? null : (
                      <p className="saveHint">
                        Posts to this device and the world board.
                      </p>
                    )}
                  </form>
                )}
                <button className="backLink" type="button" onClick={resetToTop}>
                  Back to the start
                </button>
              </>
            ) : (
              <>
                <p className="eyebrow">{activeEventFeet} ft</p>
                <h2 id="finish-title">Finish line</h2>
                <p className="finishHint">Cross the tape to stop the clock.</p>
              </>
            )}
          </div>
        </section>
      </section>

      {raceStatus === 'finished' && lastResult?.isRecord && !reducedMotion ? (
        <ConfettiBurst key={lastResult.timeMs} />
      ) : null}

      {raceStatus === 'intro' ? (
        // data-returning lands post-hydration (runCount loads in an effect to
        // keep SSR markup deterministic), so returning players see the first
        // ~1-2 frames of the stagger before it snaps off — accepted tradeoff.
        <div
          className="introScreen"
          role="dialog"
          aria-label="Scroll Race"
          data-returning={runCount > 0 ? '' : undefined}
        >
          <div className="introGrain" aria-hidden="true" />
          <p className="meetBanner" aria-hidden="true">
            <span className="meetBannerTrack">
              <span>{MEET_BANNER_TEXT}</span>
              <span>{MEET_BANNER_TEXT}</span>
            </span>
          </p>
          <div className="introInner">
            <div className="introMain">
              <div className="introTape" aria-hidden="true" />
              <p className="introEyebrow">The thumb athletics championship</p>
              <h1 className="introTitle">
                <span className="titleLine">Scroll</span>
                <span className="titleLine titleLine-accent">Race</span>
              </h1>
              {challenge ? (
                <div className="challengeSlip">
                  <p className="eyebrow">Challenge received</p>
                  <p className="challengeSlipBody">
                    <strong>{challenge.name}</strong> scrolled{' '}
                    {challenge.eventFeet} ft in{' '}
                    <strong>{formatTime(challenge.timeMs)}</strong>. Think
                    you’re faster?
                  </p>
                </div>
              ) : null}
              <p className="introDesc">
                Scroll {activeEventFeet} feet of ruler as fast as your thumb
                allows.
              </p>
              <div
                className="eventPicker"
                role="radiogroup"
                aria-label="Event distance"
                onKeyDown={onEventPickerKeyDown}
              >
                {EVENTS.map((event, index) => (
                  <button
                    key={event.feet}
                    type="button"
                    role="radio"
                    aria-checked={activeEventFeet === event.feet}
                    tabIndex={activeEventFeet === event.feet ? 0 : -1}
                    ref={(element) => {
                      eventOptionRefs.current[index] = element
                    }}
                    className={`eventOption${
                      activeEventFeet === event.feet ? ' isSelected' : ''
                    }`}
                    onClick={() => selectEvent(event.feet)}
                  >
                    <strong>{event.feet} ft</strong>
                    <span>{event.name}</span>
                  </button>
                ))}
              </div>
              <p className="eventTagline">{activeEvent.tagline}</p>
              <div className="introStats">
                <div className="introStat">
                  <span>{pbMs ? 'Your best' : 'Best time'}</span>
                  <strong
                    className={pbMs || bestTime ? undefined : 'introStatMuted'}
                  >
                    {pbMs
                      ? formatTime(pbMs)
                      : bestTime
                        ? formatTime(bestTime)
                        : 'none yet'}
                  </strong>
                </div>
                <div className="introStat">
                  <span>Runs</span>
                  <strong>
                    {globalBoard.status === 'ready'
                      ? globalBoard.total.toLocaleString()
                      : leaderboard.length}
                  </strong>
                </div>
                {challenge ? (
                  <div className="introStat">
                    <span>Target</span>
                    <strong>{formatTime(challenge.timeMs)}</strong>
                  </div>
                ) : (
                  <div className="introStat">
                    <span>Streak</span>
                    <strong
                      className={streakDays >= 3 ? 'introStatHot' : undefined}
                    >
                      {streakDays > 0 ? `🔥 ${streakDays}` : '—'}
                    </strong>
                  </div>
                )}
              </div>
              {lapsedStreak ? (
                <p className="streakLapse">
                  Streak reset — the ruler waited up for you. ({lapsedStreak}{' '}
                  days, gone.)
                </p>
              ) : null}
              <div className="introCta">
                <button
                  className="primaryButton startBtn"
                  type="button"
                  onClick={beginCountdown}
                >
                  <Play size={22} aria-hidden="true" />
                  {challenge
                    ? `Beat ${formatTime(challenge.timeMs)}`
                    : runCount > 0
                      ? 'Race again'
                      : 'Start race'}
                </button>
              </div>
              <div className="utilityRow">
                <button
                  className="calibrateToggle"
                  type="button"
                  aria-expanded={calibrateOpen}
                  aria-controls="calibrate-panel"
                  onClick={() => setCalibrateOpen((open) => !open)}
                >
                  <Ruler size={15} aria-hidden="true" />
                  Calibrate
                </button>
                <button
                  className="soundToggle"
                  type="button"
                  aria-pressed={soundOn}
                  aria-label="Sound"
                  title={soundOn ? 'Mute sounds' : 'Unmute sounds'}
                  onClick={toggleSound}
                >
                  {soundOn ? (
                    <Volume2 size={16} aria-hidden="true" />
                  ) : (
                    <VolumeX size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
              {calibrateOpen ? (
                <div className="calibrateBody" id="calibrate-panel">
                  <div className="scaleSample" aria-hidden="true">
                    <span className="scaleSampleBar" />
                    <span>1 in</span>
                  </div>
                  <div className="scaleControls">
                    <label htmlFor="scale-range">px / in</label>
                    <input
                      id="scale-range"
                      max={MAX_PIXELS_PER_INCH}
                      min={MIN_PIXELS_PER_INCH}
                      onChange={(event) =>
                        updatePixelsPerInch(Number(event.target.value))
                      }
                      type="range"
                      value={pixelsPerInch}
                    />
                    <input
                      aria-label="Pixels per inch"
                      max={MAX_PIXELS_PER_INCH}
                      min={MIN_PIXELS_PER_INCH}
                      onChange={(event) =>
                        updatePixelsPerInch(Number(event.target.value))
                      }
                      type="number"
                      value={pixelsPerInch}
                    />
                    <button type="button" onClick={resetPixelsPerInch}>
                      Reset
                    </button>
                  </div>
                </div>
              ) : null}
              <p className="printRow" aria-hidden="true">
                SCROLL RACE · REV D · {activeEventFeet * 12} IN. · LANE 1 OF 1 ·
                PRINTED ON RECYCLED PHOTONS
              </p>
            </div>

            <aside className="introBoard" aria-labelledby="leaderboard-title">
              <div className="boardHead">
                <h2 id="leaderboard-title">
                  <Trophy size={18} aria-hidden="true" />
                  Leaderboard
                </h2>
                <div className="boardTabs">
                  <button
                    type="button"
                    className={`boardTab${boardTab === 'world' ? ' isActive' : ''}`}
                    aria-pressed={boardTab === 'world'}
                    onClick={() => setBoardTab('world')}
                  >
                    World
                  </button>
                  <button
                    type="button"
                    className={`boardTab${boardTab === 'device' ? ' isActive' : ''}`}
                    aria-pressed={boardTab === 'device'}
                    onClick={() => setBoardTab('device')}
                  >
                    This device
                  </button>
                </div>
              </div>
              <p className="boardSub">
                <span>
                  {activeEventFeet} FT · {activeEvent.name.toUpperCase()}
                </span>
                <span
                  className="boardStatus"
                  data-state={
                    boardTab === 'device'
                      ? 'local'
                      : globalBoard.status === 'ready'
                        ? 'live'
                        : globalBoard.status === 'loading'
                          ? 'sync'
                          : 'offline'
                  }
                >
                  <i className="boardStatusDot" aria-hidden="true" />
                  {boardTab === 'device'
                    ? 'Local'
                    : globalBoard.status === 'ready'
                      ? 'Live'
                      : globalBoard.status === 'loading'
                        ? 'Syncing'
                        : 'Offline'}
                </span>
              </p>
              {boardTab === 'world' ? (
                <WorldBoard state={globalBoard} fallbackEntries={leaderboard} />
              ) : (
                <Leaderboard
                  entries={leaderboard}
                  justSavedId={lastSavedId}
                  onGlowEnd={() => setLastSavedId(null)}
                />
              )}
            </aside>
          </div>
          <footer className="siteFooter">
            <p>Created by JP Mitra</p>
            <nav className="creditLinks" aria-label="Creator links">
              {CREDIT_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={link.label}
                  title={link.label}
                >
                  {link.brand ? (
                    <svg
                      viewBox="0 0 24 24"
                      width={17}
                      height={17}
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d={BRAND_PATHS[link.brand]} />
                    </svg>
                  ) : (
                    <Globe size={17} aria-hidden="true" />
                  )}
                </a>
              ))}
            </nav>
          </footer>
        </div>
      ) : null}

      {raceStatus === 'countdown' ? (
        <div className="countdownScreen" aria-live="assertive">
          <span className="countdownLabel">Get ready</span>
          <span className="countdownNumber" key={countdown}>
            {countdown}
          </span>
          <span className="countdownHint">
            <ChevronsDown size={18} aria-hidden="true" />
            Scroll the moment it says GO
          </span>
          <span className="countdownSkip">or tap anywhere to go now</span>
        </div>
      ) : null}

      {goFlash ? (
        <div className="goFlash" aria-hidden="true">
          <span>GO!</span>
        </div>
      ) : null}
    </main>
  )
}

// The course furniture is memoized at module scope: setElapsedMs commits once
// per rAF frame, and without the bailout every commit would re-reconcile the
// 1,201 ruler ticks plus all course marks — pure waste in the hottest path.
const RulerRail = memo(function RulerRail({
  ticks,
}: {
  ticks: Array<RulerTick>
}) {
  return (
    <div className="rulerRail" aria-hidden="true">
      {ticks.map((tick) => (
        <div
          className={`rulerTick rulerTick-${tick.kind}`}
          key={tick.inch}
          style={{ top: `${tick.top}px` }}
        >
          {tick.label ? <span>{tick.label}</span> : null}
        </div>
      ))}
    </div>
  )
})

const DecadeMarks = memo(function DecadeMarks({
  eventFeet,
  courseHeight,
}: {
  eventFeet: number
  courseHeight: number
}) {
  return (
    <>
      {DECADE_MARKS.map((mark) => (
        <div
          className={`decadeMark${mark.percent >= 80 ? ' decadeMark-dark' : ''}${mark.percent === 90 ? ' decadeMark-send' : ''}`}
          key={mark.percent}
          style={{ top: `${(mark.percent / PERCENT_STEPS) * courseHeight}px` }}
          aria-hidden="true"
        >
          <span>
            {Math.round((mark.percent / PERCENT_STEPS) * eventFeet)} FT
          </span>
          <strong>{mark.copy}</strong>
        </div>
      ))}
    </>
  )
})

const MilestoneGates = memo(function MilestoneGates({
  passed,
  eventFeet,
  courseHeight,
}: {
  passed: Array<number>
  eventFeet: number
  courseHeight: number
}) {
  return (
    <>
      {MILESTONE_PERCENTS.map((percent) => (
        <div
          className="milestone"
          key={percent}
          data-passed={passed.includes(percent) ? '' : undefined}
          style={{ top: `${(percent / PERCENT_STEPS) * courseHeight}px` }}
        >
          <span>{Math.round((percent / PERCENT_STEPS) * eventFeet)} ft</span>
        </div>
      ))}
    </>
  )
})

function PbDeltaLine({ result }: { result: RaceResult }) {
  if (result.prevPbMs === null) {
    return (
      <p className="pbDelta pbDelta-first">Your first time on the books.</p>
    )
  }

  const diff = result.timeMs - result.prevPbMs

  if (diff < 0) {
    return (
      <p className="pbDelta pbDelta-pb">
        ▼ {(Math.abs(diff) / 1000).toFixed(2)}s — new personal best
      </p>
    )
  }

  // Only needle the player when they were close — shown on every loss it
  // gets old.
  if (result.timeMs <= result.prevPbMs * 1.05) {
    return (
      <p className="pbDelta pbDelta-close">
        +{(diff / 1000).toFixed(2)}s off your best. You’re not leaving it like
        that, are you?
      </p>
    )
  }

  return (
    <p className="pbDelta pbDelta-off">
      +{(diff / 1000).toFixed(2)}s off your best ({formatTime(result.prevPbMs)})
    </p>
  )
}

function verdictLine(result: RaceResult, challenge: Challenge) {
  const diff = challenge.timeMs - result.timeMs

  if (Math.abs(diff) < 10) {
    return `Dead heat with ${challenge.name}. Run it again.`
  }

  if (diff > 0) {
    return `You beat ${challenge.name} by ${(diff / 1000).toFixed(2)}s. Send it back.`
  }

  return `${challenge.name} survives — you were ${(Math.abs(diff) / 1000).toFixed(2)}s short.`
}

// Timing-tower convention: the leader posts the time, the field posts the
// gap to it.
function GapToLeader({
  timeMs,
  leaderMs,
}: {
  timeMs: number
  leaderMs: number | undefined
}) {
  if (leaderMs === undefined) {
    return null
  }

  return (
    <span className="leaderboardGap">
      +{(Math.max(0, timeMs - leaderMs) / 1000).toFixed(2)}s
    </span>
  )
}

function GhostRows({ names }: { names: Array<string> }) {
  return (
    <ol className="leaderboardList">
      {names.map((name, index) => (
        <li
          className="ghostRow"
          key={index}
          style={{ '--i': index } as CSSProperties}
        >
          <span className="leaderboardRank">{index + 1}</span>
          <span className="leaderboardName">{name}</span>
          <span className="leaderboardTime">--.--s</span>
        </li>
      ))}
    </ol>
  )
}

// The world tab: live top-10 from the leaderboard function, with this
// device's board as the graceful fallback when the network isn't there.
function WorldBoard({
  state,
  fallbackEntries,
}: {
  state: GlobalBoardState
  fallbackEntries: Array<LeaderboardEntry>
}) {
  if (state.status === 'loading') {
    return (
      <ol className="leaderboardList" aria-label="World leaderboard loading">
        {[1, 2, 3].map((rank) => (
          <li
            className="ghostRow isLoading"
            key={rank}
            style={{ '--i': rank - 1 } as CSSProperties}
          >
            <span className="leaderboardRank">{rank}</span>
            <span className="leaderboardName">…</span>
            <span className="leaderboardTime">--.--s</span>
          </li>
        ))}
      </ol>
    )
  }

  if (state.status === 'error') {
    return (
      <>
        <p className="boardNote">
          World board unreachable — showing this device.
        </p>
        <Leaderboard entries={fallbackEntries} />
      </>
    )
  }

  if (state.entries.length === 0) {
    return (
      <>
        <p className="emptyBoardTitle">The world record is wide open.</p>
        <GhostRows names={['Your name here', '—', '—']} />
      </>
    )
  }

  const top = state.entries.slice(0, 10)
  const leaderMs = top.at(0)?.timeMs

  return (
    <>
      <ol className="leaderboardList">
        {top.map((entry, index) => (
          <li
            key={entry.id}
            data-medal={index < 3 ? index + 1 : undefined}
            style={{ '--i': index } as CSSProperties}
          >
            <span className="leaderboardRank">{index + 1}</span>
            <span className="leaderboardName">
              <span className="leaderboardPlayer">{entry.name}</span>
              <span className="leaderboardMeta">
                {[entry.device, entry.country]
                  .filter((part) => part && part !== 'Unknown')
                  .join(' · ')}
              </span>
            </span>
            <span className="leaderboardTime">
              {formatTime(entry.timeMs)}
              {index > 0 ? (
                <GapToLeader timeMs={entry.timeMs} leaderMs={leaderMs} />
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {state.total > 0 ? (
        <p className="boardTotal">
          {state.total.toLocaleString()} run{state.total === 1 ? '' : 's'}{' '}
          worldwide
        </p>
      ) : null}
    </>
  )
}

function Leaderboard({
  entries,
  justSavedId,
  onGlowEnd,
}: {
  entries: Array<LeaderboardEntry>
  justSavedId?: string | null
  onGlowEnd?: () => void
}) {
  if (entries.length === 0) {
    return (
      <>
        <p className="emptyBoardTitle">The record is wide open.</p>
        <GhostRows names={['Your name here', '—', '—']} />
      </>
    )
  }

  const leaderMs = entries.at(0)?.timeMs

  return (
    <ol className="leaderboardList">
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          data-medal={index < 3 ? index + 1 : undefined}
          className={entry.id === justSavedId ? 'justSaved' : undefined}
          onAnimationEnd={entry.id === justSavedId ? onGlowEnd : undefined}
          style={{ '--i': index } as CSSProperties}
        >
          <span className="leaderboardRank">{index + 1}</span>
          <span className="leaderboardName">
            <span className="leaderboardPlayer">{entry.name}</span>
          </span>
          <span className="leaderboardTime">
            {formatTime(entry.timeMs)}
            {index > 0 ? (
              <GapToLeader timeMs={entry.timeMs} leaderMs={leaderMs} />
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

// Two cannons of brand-colored paper — it must look like the poster tore
// itself up, not party confetti. Self-terminates within 3 seconds.
function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    const width = window.innerWidth
    const height = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width = width * dpr
    canvas.height = height * dpr
    // CSS size set from the same values as the buffer: 100vh would stretch
    // the canvas behind a collapsed mobile toolbar.
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    context.scale(dpr, dpr)

    const colors = ['#e8472b', '#f3c33b', '#fffaf0', '#b8311a', '#19231d']
    const particles = Array.from({ length: 140 }, (_, index) => {
      const fromLeft = index % 2 === 0
      const angle = ((60 + Math.random() * 18) * Math.PI) / 180
      const speed = 900 + Math.random() * 700

      return {
        x: (fromLeft ? 0.08 : 0.92) * width,
        y: 0.78 * height,
        vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
        vy: -Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        spin: Math.random() * 24 - 12,
        size: 5 + Math.random() * 6,
        circle: Math.random() < 0.3,
        color: colors[index % colors.length],
        life: 0,
        ttl: 1.8 + Math.random() * 0.8,
      }
    })

    let frameId = 0
    let last = performance.now()
    const startedAt = last

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)

      last = now
      context.clearRect(0, 0, width, height)

      let alive = 0

      for (const particle of particles) {
        particle.life += dt

        if (particle.life >= particle.ttl) {
          continue
        }

        alive += 1
        particle.vy += 2200 * dt
        particle.vx *= 0.985
        particle.vy *= 0.985
        particle.x += particle.vx * dt
        particle.y += particle.vy * dt
        particle.rotation += particle.spin * dt

        const remaining = particle.ttl - particle.life

        context.globalAlpha = remaining < 0.4 ? remaining / 0.4 : 1
        context.fillStyle = particle.color

        if (particle.circle) {
          context.beginPath()
          context.arc(particle.x, particle.y, particle.size / 2, 0, Math.PI * 2)
          context.fill()
        } else {
          context.save()
          context.translate(particle.x, particle.y)
          context.rotate(particle.rotation)
          context.fillRect(
            -particle.size / 2,
            -particle.size / 4,
            particle.size,
            particle.size / 2,
          )
          context.restore()
        }
      }

      if (alive > 0 && now - startedAt < 3000) {
        frameId = window.requestAnimationFrame(tick)
      } else {
        setDone(true)
      }
    }

    frameId = window.requestAnimationFrame(tick)

    return () => window.cancelAnimationFrame(frameId)
  }, [])

  if (done) {
    return null
  }

  return (
    <canvas className="confettiCanvas" ref={canvasRef} aria-hidden="true" />
  )
}

function getMaxScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 0
  }

  return Math.max(document.documentElement.scrollHeight - window.innerHeight, 0)
}
