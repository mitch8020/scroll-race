import type { Dispatch, RefObject, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { clamp } from '../../lib/course'
import {
  MIN_LEGIT_MS_PER_FOOT,
  PERCENT_STEPS,
  formatTime,
  percentAtTime,
  timeAtPercent,
} from '../../lib/race'
import { isMobileDeviceClass } from '../../lib/device'
import {
  bumpRunCount,
  detectDevice,
  readPb,
  readSessionNoPbRuns,
  updateStreakOnFinish,
  writePb,
  writeSessionNoPbRuns,
} from '../../lib/localRaceStore'
import * as sfx from '../../lib/sfx'
import { MILESTONE_PERCENTS } from './courseView'
import type {
  Challenge,
  GhostPlan,
  RaceIneligibilityReason,
  RaceResult,
  RaceStatus,
} from './types'

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

type RaceRuntimeOptions = {
  raceStatus: RaceStatus
  setRaceStatus: Dispatch<SetStateAction<RaceStatus>>
  activeEventFeet: number
  pixelsPerFoot: number
  ghostPlan: GhostPlan | null
  reducedMotionRef: RefObject<boolean>
  setStreakDays: Dispatch<SetStateAction<number>>
  setRunCount: Dispatch<SetStateAction<number>>
  setNoPbRuns: Dispatch<SetStateAction<number>>
}

type RaceContext = {
  challenge: Challenge | null
  boardBestAtStart: number | null
}

export function useRaceRuntime({
  raceStatus,
  setRaceStatus,
  activeEventFeet,
  pixelsPerFoot,
  ghostPlan,
  reducedMotionRef,
  setStreakDays,
  setRunCount,
  setNoPbRuns,
}: RaceRuntimeOptions) {
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM)
  const [goFlash, setGoFlash] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [progressFeet, setProgressFeet] = useState(0)
  const [lastResult, setLastResult] = useState<RaceResult | null>(null)
  const [milestoneHit, setMilestoneHit] = useState<{
    feet: number
    key: number
  } | null>(null)
  const [passedMilestones, setPassedMilestones] = useState<Array<number>>([])
  const [delta, setDelta] = useState<{ ms: number; ahead: boolean } | null>(
    null,
  )
  const [pbMs, setPbMs] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const startTimeRef = useRef(0)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const ghostDotRef = useRef<HTMLSpanElement | null>(null)
  const speedLinesRef = useRef<HTMLDivElement | null>(null)
  const streakARef = useRef<HTMLDivElement | null>(null)
  const streakBRef = useRef<HTMLDivElement | null>(null)
  // In-session PB fallback for when localStorage writes silently fail —
  // keyed by event so switching distances doesn't wipe it.
  const pbRef = useRef<Record<number, number | null>>({})
  const boardBestAtStartRef = useRef<number | null>(null)
  const raceChallengeRef = useRef<Challenge | null>(null)
  const deltaUpdateAtRef = useRef(0)
  const deltaSignRef = useRef<1 | -1>(1)

  // Each event keeps its own personal best.
  useEffect(() => {
    if (!isMobileDeviceClass(detectDevice())) {
      setPbMs(null)

      return
    }

    const storedPb = readPb(activeEventFeet) ?? pbRef.current[activeEventFeet]

    setPbMs(storedPb ?? null)
    pbRef.current[activeEventFeet] = storedPb ?? null
  }, [activeEventFeet])

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
  }, [raceStatus, setRaceStatus])

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

      const ineligibilityReason: RaceIneligibilityReason | null =
        !isMobileDeviceClass(detectDevice())
          ? 'desktop'
          : windAssisted
            ? 'wind-assisted'
            : null
      const eligible = ineligibilityReason === null

      if (speedLinesRef.current) {
        speedLinesRef.current.style.opacity = '0'
      }

      // A sub-720ms finish would otherwise leave the GO flash mounted (its
      // timeout gets cleared by the effect teardown) — and visible forever
      // under reduced motion.
      setGoFlash(false)

      // Storage is best-effort: if writes silently fail, the in-session ref
      // keeps PB deltas honest instead of claiming a first time every run.
      const prevPb = eligible
        ? (readPb(raceFeet) ?? pbRef.current[raceFeet] ?? null)
        : null
      const isPb = eligible && (prevPb === null || finalTime < prevPb)

      if (isPb) {
        writePb(raceFeet, finalTime)
        setPbMs(finalTime)
        pbRef.current[raceFeet] = finalTime
      }

      const isRecord =
        eligible && boardBestAtStart !== null && finalTime < boardBestAtStart

      let streakNow = 0
      let firstOfDay = false
      let newDailyBest = false

      if (eligible) {
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
        ineligibilityReason,
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

        setPassedMilestones((previous) => [
          ...new Set([...previous, ...crossed]),
        ])

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
  }, [
    activeEventFeet,
    ghostPlan,
    pixelsPerFoot,
    raceStatus,
    reducedMotionRef,
    setNoPbRuns,
    setRaceStatus,
    setRunCount,
    setStreakDays,
  ])

  const prepareForCountdown = useCallback(
    ({ challenge, boardBestAtStart }: RaceContext) => {
      setElapsedMs(0)
      setProgressFeet(0)
      setLastResult(null)
      setGoFlash(false)
      setMilestoneHit(null)
      setPassedMilestones([])
      setDelta(null)
      setAnnouncement('')
      raceChallengeRef.current = challenge
      boardBestAtStartRef.current = boardBestAtStart
    },
    [],
  )

  const resetToIntroDisplay = useCallback(() => {
    setElapsedMs(0)
    setProgressFeet(0)
    setGoFlash(false)
    setMilestoneHit(null)
    setPassedMilestones([])
    setDelta(null)
  }, [])

  const dismissMilestone = useCallback(() => setMilestoneHit(null), [])

  return {
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
  }
}

function getMaxScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 0
  }

  return Math.max(document.documentElement.scrollHeight - window.innerHeight, 0)
}
