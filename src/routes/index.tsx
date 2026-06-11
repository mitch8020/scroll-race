import { createFileRoute } from '@tanstack/react-router'
import {
  ChevronsDown,
  Flag,
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
  TOTAL_FEET,
  averageMph,
  buildShareText,
  clipName,
  fasterThanPercent,
  feetAtTime,
  formatTime,
  ftpsToMph,
  parseChallengeMs,
  rankTitle,
  sanitizeName,
  speedTicketLine,
  timeAtFeet,
  unitLine,
} from '../lib/race'
import * as sfx from '../lib/sfx'

export { formatTime }

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => {
    const beat = parseChallengeMs(search.beat)
    const by = sanitizeName(typeof search.by === 'string' ? search.by : '')

    return {
      beat,
      by: by || undefined,
    }
  },
  component: Home,
})

const INCHES_PER_FOOT = 12
const CSS_PIXELS_PER_INCH = 96
const MIN_PIXELS_PER_INCH = 72
const MAX_PIXELS_PER_INCH = 220
const STORAGE_KEY = 'scroll-race-leaderboard-v1'
const SCALE_STORAGE_KEY = 'scroll-race-pixels-per-inch-v1'
const PB_STORAGE_KEY = 'scroll-race-pb-v1'
const NAME_STORAGE_KEY = 'scroll-race-player-name-v1'
const STREAK_STORAGE_KEY = 'scroll-race-streak-v1'
const RUNS_STORAGE_KEY = 'scroll-race-runs-v1'
const SESSION_NO_PB_KEY = 'scroll-race-session-no-pb-runs'
const MAX_LEADERBOARD_ENTRIES = 10
const MILESTONES = [25, 50, 75]
const COUNTDOWN_FROM = 3
const COUNTDOWN_BEAT_MS = 750
// A single-frame jump bigger than this is a teleport, not a scroll.
const MAX_FRAME_JUMP_VH = 6
const MIN_FRAME_JUMP_PX = 6000
const MIN_LEGIT_TIME_MS = 1000
const DELTA_UPDATE_INTERVAL_MS = 250
const DELTA_SIGN_HYSTERESIS_MS = 60
// Vertical dash periods of the speed-line layers; transforms wrap on these so
// the pattern tiles seamlessly. Must match the gradients in styles.css.
const SPEED_LAYER_WRAP_A = 220
const SPEED_LAYER_WRAP_B = 110

const DECADE_MARKS = [
  { feet: 10, copy: 'WARMING UP' },
  { feet: 20, copy: 'FIND YOUR STRIDE' },
  { feet: 30, copy: 'TOP GEAR' },
  { feet: 40, copy: "DON'T BLINK" },
  { feet: 50, copy: 'HALFWAY · NO BRAKES' },
  { feet: 60, copy: 'LUNGS ON FIRE' },
  { feet: 70, copy: "THE WALL ISN'T REAL" },
  { feet: 80, copy: 'EYES ON THE TAPE' },
  { feet: 90, copy: 'SEND IT' },
]

type RaceStatus = 'intro' | 'countdown' | 'racing' | 'finished'

type RulerTick = {
  inch: number
  top: number
  kind: 'foot' | 'half' | 'quarter' | 'inch'
  label?: string
}

type LeaderboardEntry = {
  id: string
  name: string
  timeMs: number
  completedAt: string
  splitsMs?: Array<number>
}

type Challenge = {
  name: string
  timeMs: number
}

type RaceResult = {
  timeMs: number
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

type StreakData = {
  lastDay: string
  streak: number
  prevStreak: number
  todayBestMs: number | null
}

type CourseStyle = CSSProperties & {
  '--course-height': string
  '--foot-size': string
  '--inch-size': string
}

type TiltStyle = CSSProperties & { '--tilt': string }

function Home() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [pixelsPerInch, setPixelsPerInch] = useState(CSS_PIXELS_PER_INCH)
  const pixelsPerFoot = pixelsPerInch * INCHES_PER_FOOT
  const courseHeight = TOTAL_FEET * pixelsPerFoot
  const ticks = useMemo(() => createRulerTicks(pixelsPerInch), [pixelsPerInch])
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
  // In-session PB fallback for when localStorage writes silently fail.
  const pbRef = useRef<number | null>(null)
  const boardBestAtStartRef = useRef<number | null>(null)
  const raceChallengeRef = useRef<Challenge | null>(null)
  const deltaUpdateAtRef = useRef(0)
  const deltaSignRef = useRef<1 | -1>(1)

  const challenge = useMemo<Challenge | null>(
    () =>
      search.beat
        ? { timeMs: search.beat, name: search.by ?? 'A rival' }
        : null,
    [search.beat, search.by],
  )

  const bestTime = leaderboard[0]?.timeMs
  const resultRank = lastResult
    ? leaderboard.filter((entry) => entry.timeMs < lastResult.timeMs).length + 1
    : null
  const hudVisible = raceStatus === 'racing' || raceStatus === 'finished'

  useEffect(() => {
    setLeaderboard(readLeaderboard())
    setPixelsPerInch(readPixelsPerInch())

    const storedPb = readPb()

    setPbMs(storedPb)
    pbRef.current = storedPb
    setRunCount(readRunCount())
    setSoundOn(!sfx.isMuted())

    const storedName = readStoredName()

    setSavedName(storedName)
    setPlayerName(storedName)

    const today = localDay(0)
    const yesterday = localDay(-1)
    const streak = readStreak()

    setStreakDays(
      streak.lastDay === today || streak.lastDay === yesterday
        ? streak.streak
        : 0,
    )

    // The lapse note shows exactly once after a 3+ day streak dies.
    if (streak.prevStreak >= 3) {
      setLapsedStreak(streak.prevStreak)
      writeStreak({ ...streak, prevStreak: 0 })
    } else if (
      streak.streak >= 3 &&
      streak.lastDay !== today &&
      streak.lastDay !== yesterday
    ) {
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

      setProgressFeet(Number((progress * TOTAL_FEET).toFixed(1)))
    }

    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress)

    return () => {
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
    }
  }, [raceStatus])

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

    // Telemetry for the race: per-foot splits, smoothed velocity, teleport
    // detection. All refs + locals — the only per-frame setState calls are
    // setElapsedMs + setProgressFeet (batched into one commit), plus rare
    // event-driven writes (milestones, delta at 4Hz).
    const splits = new Array<number>(TOTAL_FEET + 1).fill(0)
    let lastFoot = 0
    let prevFeet = 0
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
      // leap straight onto the tape bypasses detection entirely.
      if (
        Math.abs(window.scrollY - lastY) >
        Math.max(viewportHeight * MAX_FRAME_JUMP_VH, MIN_FRAME_JUMP_PX)
      ) {
        windAssisted = true
      }

      while (lastFoot < TOTAL_FEET) {
        lastFoot += 1
        splits[lastFoot] = finalTime
      }

      if (finalTime < MIN_LEGIT_TIME_MS) {
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
      const prevPb = readPb() ?? pbRef.current
      const isPb = !windAssisted && (prevPb === null || finalTime < prevPb)

      if (isPb) {
        writePb(finalTime)
        setPbMs(finalTime)
        pbRef.current = finalTime
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
      setProgressFeet(TOTAL_FEET)
      setAnnouncement(`Finished — ${formatTime(finalTime)}`)
      setLastResult({
        timeMs: finalTime,
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

    const finishIfDone = (currentMaxScroll: number) => {
      if (currentMaxScroll > 0 && currentMaxScroll - window.scrollY <= 2) {
        finishRace()
      }
    }

    // Registered directly as a scroll listener — must take no parameters so
    // the Event argument can't shadow the cached maxScroll.
    const checkFinish = () => finishIfDone(maxScroll)

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
      const feet = maxScroll === 0 ? 0 : clamp(y / maxScroll, 0, 1) * TOTAL_FEET

      // Per-foot splits. A fling that skips feet fills every skipped foot
      // with the same timestamp, so the array is always complete.
      while (lastFoot < Math.floor(feet)) {
        lastFoot += 1
        splits[lastFoot] = elapsed
      }

      const dt = now - lastTs
      const dy = y - lastY

      if (dt > 0) {
        const ftps = Math.max(0, dy / pixelsPerFoot / (dt / 1000))

        velocity = velocity * 0.85 + ftps * 0.15
        topVelocity = Math.max(topVelocity, velocity)
      }

      if (
        Math.abs(dy) >
        Math.max(viewportHeight * MAX_FRAME_JUMP_VH, MIN_FRAME_JUMP_PX)
      ) {
        windAssisted = true
      }

      lastY = y
      lastTs = now

      const crossed = MILESTONES.filter(
        (milestone) => prevFeet < milestone && feet >= milestone,
      )

      if (crossed.length > 0) {
        const lastCrossed = crossed[crossed.length - 1]

        setPassedMilestones((prev) => [...new Set([...prev, ...crossed])])

        if (!reducedMotionRef.current) {
          setMilestoneHit({ feet: lastCrossed, key: now })
        }

        // Screen-reader cue must not depend on the visual-motion gate above.
        setAnnouncement(`${lastCrossed} feet`)
        sfx.milestoneTick(lastCrossed)
        sfx.buzz(18)
      }

      prevFeet = feet

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
        const ghostFeet =
          plan.kind === 'challenge'
            ? Math.min(elapsed / plan.totalMs, 1) * TOTAL_FEET
            : feetAtTime(plan.splitsMs, plan.totalMs, elapsed)

        if (ghostRef.current) {
          // The challenger line is offset so it crosses the finish tape at
          // exactly the challenge time, matching the player's own win
          // condition (viewport bottom reaching page bottom). The PB ghost is
          // positioned in feet so it stays fair even if the px/in calibration
          // changed since the PB run — that is intentional, not a bug.
          const ghostTop =
            plan.kind === 'challenge'
              ? (ghostFeet / TOTAL_FEET) * maxScroll + viewportHeight - 44
              : ghostFeet * pixelsPerFoot

          ghostRef.current.style.transform = `translateY(${ghostTop}px)`
        }

        if (ghostDotRef.current) {
          ghostDotRef.current.style.left = `${ghostFeet}%`
        }

        if (now - deltaUpdateAtRef.current >= DELTA_UPDATE_INTERVAL_MS) {
          deltaUpdateAtRef.current = now

          const deltaMs =
            plan.kind === 'challenge'
              ? maxScroll === 0
                ? 0
                : (y / maxScroll) * plan.totalMs - elapsed
              : timeAtFeet(plan.splitsMs, plan.totalMs, feet) - elapsed

          if (Math.abs(deltaMs) > DELTA_SIGN_HYSTERESIS_MS) {
            deltaSignRef.current = deltaMs >= 0 ? 1 : -1
          }

          setDelta({ ms: Math.abs(deltaMs), ahead: deltaSignRef.current > 0 })
        }
      }

      // Both setters batch into a single React commit per frame.
      setElapsedMs(elapsed)
      setProgressFeet(Number(feet.toFixed(1)))
      finishIfDone(maxScroll)
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
  }, [raceStatus, pixelsPerFoot, ghostPlan])

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
        name: clipName(name.trim()) || 'Anonymous',
        timeMs: lastResult.timeMs,
        completedAt: new Date().toISOString(),
        splitsMs: lastResult.splitsMs,
      }
      const nextLeaderboard = [...leaderboard, entry]
        .sort((left, right) => left.timeMs - right.timeMs)
        .slice(0, MAX_LEADERBOARD_ENTRIES)

      setLeaderboard(nextLeaderboard)
      writeLeaderboard(nextLeaderboard)
      setHasSaved(true)
      setLastSavedId(entry.id)
      setSavedName(entry.name)
      setPlayerName(entry.name)
      writeStoredName(entry.name)

      // A won challenge is settled: clear the params so future shares don't
      // carry a stale ?beat. A lost one stays standing for retries.
      if (
        lastResult.challenge &&
        lastResult.timeMs < lastResult.challenge.timeMs
      ) {
        void navigate({
          search: { beat: undefined, by: undefined },
          replace: true,
          // Without this, scroll restoration yanks the player from the
          // finish panel back to the top of the course mid-celebration.
          resetScroll: false,
        })
      }
    },
    [lastResult, leaderboard, navigate],
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
      const name = trimmed || 'Anonymous'
      const nextLeaderboard = leaderboard.map((entry) =>
        entry.id === lastSavedId ? { ...entry, name } : entry,
      )

      setLeaderboard(nextLeaderboard)
      writeLeaderboard(nextLeaderboard)
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
                max={TOTAL_FEET}
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

      <section className="raceCourse" aria-label="100-foot scroll race course">
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

        <DecadeMarks pixelsPerFoot={pixelsPerFoot} />

        <MilestoneGates
          passed={passedMilestones}
          pixelsPerFoot={pixelsPerFoot}
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
                  <p className="rankStamp">{rankTitle(lastResult.timeMs)}</p>
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
                      Faster than {fasterThanPercent(lastResult.timeMs)}% of
                      thumbs
                    </p>
                    <ul className="funFacts">
                      <li>
                        Average thumb speed:{' '}
                        {averageMph(lastResult.timeMs).toFixed(1)} mph
                      </li>
                      <li>{speedTicketLine(ftpsToMph(lastResult.topFtps))}</li>
                      <li>{unitLine(lastResult.runNumber)}</li>
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
                  </form>
                )}
                <button className="backLink" type="button" onClick={resetToTop}>
                  ↑ Back to the start
                </button>
              </>
            ) : (
              <>
                <p className="eyebrow">100 ft</p>
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
          <div className="introInner">
            <div className="introMain">
              <div className="introTape" aria-hidden="true" />
              <p className="introEyebrow">100-foot scroll sprint</p>
              <h1 className="introTitle">
                <span
                  className="titleLine"
                  style={{ '--tilt': '-0.6deg' } as TiltStyle}
                >
                  Scroll
                </span>
                <span
                  className="titleLine titleLine-accent"
                  style={{ '--tilt': '0.8deg' } as TiltStyle}
                >
                  Race
                </span>
                <span className="inkStamp" aria-hidden="true">
                  EST. 100 FT
                </span>
              </h1>
              <p className="introDesc">
                Scroll 100 feet of ruler as fast as your thumb allows.
              </p>
              <ol className="introSteps" aria-label="How to play">
                <li>Tap start</li>
                <li>3 · 2 · 1</li>
                <li>Fling!</li>
              </ol>
              {challenge ? (
                <div className="challengeSlip">
                  <p className="eyebrow">Challenge received</p>
                  <p className="challengeSlipBody">
                    <strong>{challenge.name}</strong> scrolled 100 ft in{' '}
                    <strong>{formatTime(challenge.timeMs)}</strong>. Think
                    you’re faster?
                  </p>
                </div>
              ) : null}
              <div className="introStats">
                <div className="introStat">
                  <span>Distance</span>
                  <strong>100 ft</strong>
                </div>
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
                  <span>Racers</span>
                  <strong>{leaderboard.length}</strong>
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
              <details className="calibrate">
                <summary>
                  <Ruler size={15} aria-hidden="true" />
                  Calibrate ruler to your screen
                </summary>
                <div className="calibrateBody">
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
              </details>
              <button
                className="soundToggle"
                type="button"
                aria-pressed={soundOn}
                onClick={toggleSound}
              >
                Sound: {soundOn ? 'on' : 'off'}
              </button>
              <p className="printRow" aria-hidden="true">
                SCROLL RACE · REV C · 1200 IN. · LANE 1 OF 1 · PRINTED ON
                RECYCLED PHOTONS
              </p>
            </div>

            <aside className="introBoard" aria-labelledby="leaderboard-title">
              <h2 id="leaderboard-title">
                <Trophy size={18} aria-hidden="true" />
                Leaderboard
              </h2>
              <Leaderboard
                entries={leaderboard}
                justSavedId={lastSavedId}
                onGlowEnd={() => setLastSavedId(null)}
              />
            </aside>
          </div>
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
  pixelsPerFoot,
}: {
  pixelsPerFoot: number
}) {
  return (
    <>
      {DECADE_MARKS.map((mark, index) => (
        <div
          className={`decadeMark${mark.feet >= 80 ? ' decadeMark-dark' : ''}${mark.feet === 90 ? ' decadeMark-send' : ''}`}
          key={mark.feet}
          style={
            {
              top: `${mark.feet * pixelsPerFoot}px`,
              '--tilt': `${index % 2 ? 1.4 : -1.8}deg`,
            } as TiltStyle
          }
          aria-hidden="true"
        >
          <span>{mark.feet} FT</span>
          <strong>{mark.copy}</strong>
        </div>
      ))}
    </>
  )
})

const MilestoneGates = memo(function MilestoneGates({
  passed,
  pixelsPerFoot,
}: {
  passed: Array<number>
  pixelsPerFoot: number
}) {
  return (
    <>
      {MILESTONES.map((feet) => (
        <div
          className="milestone"
          key={feet}
          data-passed={passed.includes(feet) ? '' : undefined}
          style={{ top: `${feet * pixelsPerFoot}px` }}
        >
          <span>{feet} ft</span>
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
        <ol className="leaderboardList">
          {['Your name here', '—', '—'].map((name, index) => (
            <li className="ghostRow" key={index}>
              <span className="leaderboardRank">{index + 1}</span>
              <span className="leaderboardName">{name}</span>
              <span className="leaderboardTime">--.--s</span>
            </li>
          ))}
        </ol>
      </>
    )
  }

  return (
    <ol className="leaderboardList">
      {entries.map((entry, index) => (
        <li
          key={entry.id}
          data-medal={index < 3 ? index + 1 : undefined}
          className={entry.id === justSavedId ? 'justSaved' : undefined}
          onAnimationEnd={entry.id === justSavedId ? onGlowEnd : undefined}
        >
          <span className="leaderboardRank">{index + 1}</span>
          <span className="leaderboardName">{entry.name}</span>
          <span className="leaderboardTime">{formatTime(entry.timeMs)}</span>
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

export function createRulerTicks(
  pixelsPerInch = CSS_PIXELS_PER_INCH,
): Array<RulerTick> {
  return Array.from({ length: TOTAL_FEET * INCHES_PER_FOOT + 1 }, (_, inch) => {
    const wholeFeet = Math.floor(inch / INCHES_PER_FOOT)
    const inchInFoot = inch % INCHES_PER_FOOT
    const kind =
      inchInFoot === 0
        ? 'foot'
        : inchInFoot === 6
          ? 'half'
          : inchInFoot % 3 === 0
            ? 'quarter'
            : 'inch'

    return {
      inch,
      top: inch * pixelsPerInch,
      kind,
      label:
        inchInFoot === 0 && wholeFeet % 5 === 0 ? `${wholeFeet} ft` : undefined,
    }
  })
}

function localDay(offsetDays: number) {
  // Calendar arithmetic, not epoch math: a fixed 86,400,000ms offset misses
  // "yesterday" across DST transitions and would break honest streaks.
  const date = new Date()

  date.setDate(date.getDate() + offsetDays)

  return date.toLocaleDateString('sv')
}

function readPixelsPerInch() {
  if (typeof window === 'undefined') {
    return CSS_PIXELS_PER_INCH
  }

  const storedValue = Number(window.localStorage.getItem(SCALE_STORAGE_KEY))

  return normalizePixelsPerInch(storedValue || CSS_PIXELS_PER_INCH)
}

function writePixelsPerInch(pixelsPerInch: number) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    SCALE_STORAGE_KEY,
    String(normalizePixelsPerInch(pixelsPerInch)),
  )
}

function readLeaderboard(): Array<LeaderboardEntry> {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawLeaderboard = window.localStorage.getItem(STORAGE_KEY)

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

function writeLeaderboard(entries: Array<LeaderboardEntry>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
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
    (entry.splitsMs === undefined ||
      (Array.isArray(entry.splitsMs) &&
        entry.splitsMs.every((split) => typeof split === 'number')))
  )
}

function readPb(): number | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(PB_STORAGE_KEY)
    const value = raw === null ? Number.NaN : Number(raw)

    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function writePb(timeMs: number) {
  try {
    window.localStorage.setItem(PB_STORAGE_KEY, String(timeMs))
  } catch {
    return
  }
}

function readStoredName() {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    return sanitizeName(window.localStorage.getItem(NAME_STORAGE_KEY) ?? '')
  } catch {
    return ''
  }
}

function writeStoredName(name: string) {
  try {
    window.localStorage.setItem(NAME_STORAGE_KEY, name)
  } catch {
    return
  }
}

function readStreak(): StreakData {
  const fallback: StreakData = {
    lastDay: '',
    streak: 0,
    prevStreak: 0,
    todayBestMs: null,
  }

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(STREAK_STORAGE_KEY)

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

function writeStreak(data: StreakData) {
  try {
    window.localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(data))
  } catch {
    return
  }
}

function updateStreakOnFinish(timeMs: number) {
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

function readRunCount() {
  if (typeof window === 'undefined') {
    return 0
  }

  try {
    const value = Number(window.localStorage.getItem(RUNS_STORAGE_KEY))

    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

function bumpRunCount() {
  const next = readRunCount() + 1

  try {
    window.localStorage.setItem(RUNS_STORAGE_KEY, String(next))
  } catch {
    return next
  }

  return next
}

function readSessionNoPbRuns() {
  try {
    const value = Number(window.sessionStorage.getItem(SESSION_NO_PB_KEY))

    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

function writeSessionNoPbRuns(count: number) {
  try {
    window.sessionStorage.setItem(SESSION_NO_PB_KEY, String(count))
  } catch {
    return
  }
}

function getMaxScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 0
  }

  return Math.max(document.documentElement.scrollHeight - window.innerHeight, 0)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function normalizePixelsPerInch(value: number) {
  if (!Number.isFinite(value)) {
    return CSS_PIXELS_PER_INCH
  }

  return Math.round(clamp(value, MIN_PIXELS_PER_INCH, MAX_PIXELS_PER_INCH))
}

function createEntryId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
