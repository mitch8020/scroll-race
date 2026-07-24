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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  createRulerTicks,
  CSS_PIXELS_PER_INCH,
  INCHES_PER_FOOT,
  MAX_PIXELS_PER_INCH,
  MIN_PIXELS_PER_INCH,
  normalizePixelsPerInch,
} from '../../lib/course'
import {
  DEFAULT_EVENT_FEET,
  EVENTS,
  averageMph,
  buildShareText,
  clipName,
  eventForFeet,
  fasterThanPercent,
  formatTime,
  ftpsToMph,
  randomRacerName,
  rankTitle,
  speedTicketLine,
  unitLine,
} from '../../lib/race'
import { SUBMIT_COOLDOWN_MS } from '../../lib/board'
import { fetchGlobalBoard, submitToGlobalBoard } from '../../lib/globalBoard'
import type { LeaderboardEntry } from '../../lib/localRaceStore'
import {
  MAX_LEADERBOARD_ENTRIES,
  createEntryId,
  detectDevice,
  getStreakRecency,
  readLeaderboard,
  readPixelsPerInch,
  readRunCount,
  readStoredEventFeet,
  readStoredName,
  readStreak,
  writeLeaderboard,
  writePixelsPerInch,
  writeStoredEventFeet,
  writeStoredName,
  writeStreak,
} from '../../lib/localRaceStore'
import * as sfx from '../../lib/sfx'
import { DecadeMarks, MilestoneGates, RulerRail } from './courseView'
import type { GlobalBoardState } from './leaderboardView'
import { Leaderboard, WorldBoard } from './leaderboardView'
import { ConfettiBurst, PbDeltaLine, verdictLine } from './resultView'
import type {
  Challenge,
  GhostPlan,
  RaceSearch,
  RaceResult,
  RaceStatus,
} from './types'
import { useRaceRuntime } from './useRaceRuntime'

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
type CourseStyle = CSSProperties & {
  '--course-height': string
  '--foot-size': string
  '--inch-size': string
}

export function ScrollRace({
  search,
  clearChallenge,
}: {
  search: RaceSearch
  clearChallenge: () => void
}) {
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
  const [leaderboard, setLeaderboard] = useState<Array<LeaderboardEntry>>([])
  const [playerName, setPlayerName] = useState('')
  const [savedName, setSavedName] = useState('')
  const [hasSaved, setHasSaved] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [lastSavedId, setLastSavedId] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [calibrateOpen, setCalibrateOpen] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [ghostPlan, setGhostPlan] = useState<GhostPlan | null>(null)
  const [streakDays, setStreakDays] = useState(0)
  const [lapsedStreak, setLapsedStreak] = useState<number | null>(null)
  const [runCount, setRunCount] = useState(0)
  const [noPbRuns, setNoPbRuns] = useState(0)
  const [shareFallback, setShareFallback] = useState<string | null>(null)
  const [boardTab, setBoardTab] = useState<'world' | 'device'>('world')
  const [globalBoard, setGlobalBoard] = useState<GlobalBoardState>({
    status: 'loading',
  })
  const [globalRank, setGlobalRank] = useState<number | null>(null)
  const finishTitleRef = useRef<HTMLHeadingElement | null>(null)
  const editNameButtonRef = useRef<HTMLButtonElement | null>(null)
  const justSubmittedNameRef = useRef(false)
  // Mirror of reducedMotion for the racing rAF: reading the ref keeps the
  // preference out of the racing effect's deps, where a mid-race change
  // would restart the clock and wipe telemetry.
  const reducedMotionRef = useRef(false)
  // One world-board submission per result, even if save paths re-fire.
  const submittedResultRef = useRef<RaceResult | null>(null)
  const {
    announcement,
    countdown,
    delta,
    dismissMilestone,
    elapsedMs,
    ghostDotRef,
    ghostRef,
    goFlash,
    lastResult,
    milestoneHit,
    passedMilestones,
    pbMs,
    prepareForCountdown,
    progressFeet,
    resetToIntroDisplay,
    speedLinesRef,
    streakARef,
    streakBRef,
  } = useRaceRuntime({
    raceStatus,
    setRaceStatus,
    activeEventFeet,
    pixelsPerFoot,
    ghostPlan,
    reducedMotionRef,
    setStreakDays,
    setRunCount,
    setNoPbRuns,
  })

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

  // Each event keeps its own local board.
  useEffect(() => {
    setLeaderboard(readLeaderboard(activeEventFeet))
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

  const beginCountdown = useCallback(() => {
    // Must stay synchronous in the click handler: iOS/Chrome gate audio on a
    // user gesture.
    sfx.ensureAudio()
    prepareForCountdown({
      challenge,
      boardBestAtStart: leaderboard[0]?.timeMs ?? null,
    })
    setHasSaved(false)
    setEditingName(false)
    setShareCopied(false)
    setLastSavedId(null)
    setShareFallback(null)
    setGlobalRank(null)
    // Drop any in-flight world-board submit from the previous run so a late
    // response can't pin run N's rank onto run N+1's finish panel.
    submittedResultRef.current = null

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
  }, [challenge, leaderboard, prepareForCountdown])

  // Send the player all the way back to the welcome screen at the top.
  const resetToTop = () => {
    setRaceStatus('intro')
    resetToIntroDisplay()
    setShareCopied(false)
    setEditingName(false)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  const saveEntry = useCallback(
    (name: string) => {
      if (!lastResult || lastResult.ineligibilityReason !== null) {
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
        clearChallenge()
      }
    },
    [lastResult, leaderboard, clearChallenge, pixelsPerInch],
  )

  // Zero-tap auto-save: returning players are on the board the moment they
  // cross the tape.
  useEffect(() => {
    if (
      raceStatus === 'finished' &&
      lastResult &&
      lastResult.ineligibilityReason === null &&
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

    if (!lastResult || lastResult.ineligibilityReason !== null) {
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
        desktopRun: lastResult.ineligibilityReason === 'desktop',
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
      const recoverNativeShare = (error: unknown) => {
        // Closing the native sheet is an intentional no-op. If the platform
        // advertises sharing but cannot complete it, keep the button useful
        // by exposing the same manual-copy fallback as older browsers.
        const cancelled =
          typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          error.name === 'AbortError'

        if (!cancelled) {
          setShareFallback(text)
        }
      }

      try {
        void navigator.share({ text }).catch(recoverNativeShare)
      } catch (error) {
        recoverNativeShare(error)
      }

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
      clearChallenge()
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
            onAnimationEnd={dismissMilestone}
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
        aria-hidden={
          raceStatus === 'intro' || raceStatus === 'countdown'
            ? true
            : undefined
        }
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
                {lastResult.ineligibilityReason ? (
                  <p className="windStamp">
                    {lastResult.ineligibilityReason === 'desktop'
                      ? 'DESKTOP RUN ✱'
                      : 'WIND-ASSISTED ✱'}
                  </p>
                ) : lastResult.isRecord ? (
                  <p className="recordBadge">★ New record</p>
                ) : (
                  <p className="rankStamp">
                    {rankTitle(lastResult.timeMs, lastResult.eventFeet)}
                  </p>
                )}
                {!lastResult.ineligibilityReason &&
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
                  {lastResult.ineligibilityReason ? '✱' : ''}
                </p>
                {lastResult.ineligibilityReason ? (
                  <p className="windNote">
                    {lastResult.ineligibilityReason === 'desktop'
                      ? 'Desktop runs are practice only. Race on a phone or tablet to qualify.'
                      : 'Times set with the End key don’t count. The ruler saw everything.'}
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
                {lastResult.ineligibilityReason ? (
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
          aria-modal="true"
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
