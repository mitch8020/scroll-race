import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowUp,
  ChevronsDown,
  Flag,
  Play,
  RotateCcw,
  Ruler,
  Timer,
  Trophy,
} from 'lucide-react'
import type { CSSProperties, FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

export const Route = createFileRoute('/')({ component: Home })

const TOTAL_FEET = 100
const INCHES_PER_FOOT = 12
const CSS_PIXELS_PER_INCH = 96
const MIN_PIXELS_PER_INCH = 72
const MAX_PIXELS_PER_INCH = 220
const STORAGE_KEY = 'scroll-race-leaderboard-v1'
const SCALE_STORAGE_KEY = 'scroll-race-pixels-per-inch-v1'
const MAX_LEADERBOARD_ENTRIES = 10
const MILESTONES = [25, 50, 75]
const COUNTDOWN_FROM = 3

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
}

type RaceResult = {
  timeMs: number
}

type CourseStyle = CSSProperties & {
  '--course-height': string
  '--foot-size': string
  '--inch-size': string
}

function Home() {
  const [pixelsPerInch, setPixelsPerInch] = useState(CSS_PIXELS_PER_INCH)
  const pixelsPerFoot = pixelsPerInch * INCHES_PER_FOOT
  const courseHeight = TOTAL_FEET * pixelsPerFoot
  const ticks = useMemo(() => createRulerTicks(pixelsPerInch), [pixelsPerInch])
  const [raceStatus, setRaceStatus] = useState<RaceStatus>('intro')
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM)
  const [goFlash, setGoFlash] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [progressFeet, setProgressFeet] = useState(0)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [lastResult, setLastResult] = useState<RaceResult | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [hasSaved, setHasSaved] = useState(false)
  const startTimeRef = useRef(0)

  const bestTime = leaderboard[0]?.timeMs
  const resultRank = lastResult
    ? leaderboard.filter((entry) => entry.timeMs < lastResult.timeMs).length + 1
    : null
  const hudVisible = raceStatus === 'racing' || raceStatus === 'finished'

  useEffect(() => {
    setLeaderboard(readLeaderboard())
    setPixelsPerInch(readPixelsPerInch())
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
  }, [])

  // 3 . 2 . 1 . GO — a brief head start before the clock runs.
  useEffect(() => {
    if (raceStatus !== 'countdown') {
      return
    }

    setCountdown(COUNTDOWN_FROM)
    let value = COUNTDOWN_FROM

    const intervalId = window.setInterval(() => {
      value -= 1

      if (value <= 0) {
        window.clearInterval(intervalId)
        setCountdown(0)
        setRaceStatus('racing')
      } else {
        setCountdown(value)
      }
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [raceStatus])

  useEffect(() => {
    if (raceStatus !== 'racing') {
      return
    }

    startTimeRef.current = performance.now()
    setGoFlash(true)

    let frameId = 0
    let finished = false
    const goTimeout = window.setTimeout(() => setGoFlash(false), 720)

    const finishRace = () => {
      if (finished) {
        return
      }

      finished = true
      const finalTime = Math.max(performance.now() - startTimeRef.current, 0)

      setElapsedMs(finalTime)
      setLastResult({ timeMs: finalTime })
      setRaceStatus('finished')
    }

    const checkFinish = () => {
      const maxScroll = getMaxScroll()

      if (maxScroll > 0 && maxScroll - window.scrollY <= 2) {
        finishRace()
      }
    }

    const updateTimer = () => {
      if (finished) {
        return
      }

      setElapsedMs(Math.max(performance.now() - startTimeRef.current, 0))
      checkFinish()
      frameId = window.requestAnimationFrame(updateTimer)
    }

    window.addEventListener('scroll', checkFinish, { passive: true })
    updateTimer()

    return () => {
      window.clearTimeout(goTimeout)
      window.removeEventListener('scroll', checkFinish)
      window.cancelAnimationFrame(frameId)
    }
  }, [raceStatus])

  const beginCountdown = () => {
    setElapsedMs(0)
    setProgressFeet(0)
    setLastResult(null)
    setHasSaved(false)
    setPlayerName('')
    setGoFlash(false)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    setRaceStatus('countdown')
  }

  // Send the player all the way back to the welcome screen at the top.
  const resetToTop = () => {
    setRaceStatus('intro')
    setElapsedMs(0)
    setProgressFeet(0)
    setGoFlash(false)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  const saveResult = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!lastResult || hasSaved) {
      return
    }

    const entry: LeaderboardEntry = {
      id: createEntryId(),
      name: playerName.trim().slice(0, 18) || 'Anonymous',
      timeMs: lastResult.timeMs,
      completedAt: new Date().toISOString(),
    }
    const nextLeaderboard = [...leaderboard, entry]
      .sort((left, right) => left.timeMs - right.timeMs)
      .slice(0, MAX_LEADERBOARD_ENTRIES)

    setLeaderboard(nextLeaderboard)
    writeLeaderboard(nextLeaderboard)
    setHasSaved(true)
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

  return (
    <main className="scrollRace" data-status={raceStatus} style={courseStyle}>
      {hudVisible ? (
        <header className="raceHud" aria-live="polite">
          <div className="hudMetric">
            <Timer size={18} aria-hidden="true" />
            <span>{formatTime(elapsedMs)}</span>
          </div>
          <div className="hudProgress">
            <span>{progressFeet.toFixed(1)} ft</span>
            <progress
              value={progressFeet}
              max={TOTAL_FEET}
              aria-label="Race progress"
            />
          </div>
          <button
            className="hudButton"
            type="button"
            onClick={resetToTop}
            title="Back to the start"
          >
            <RotateCcw size={18} aria-hidden="true" />
            <span>Restart</span>
          </button>
        </header>
      ) : null}

      <section className="raceCourse" aria-label="100-foot scroll race course">
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

        {MILESTONES.map((feet) => (
          <div
            className="milestone"
            key={feet}
            style={{ top: `${feet * pixelsPerFoot}px` }}
          >
            <span>{feet} ft</span>
          </div>
        ))}

        <section className="finishZone" aria-labelledby="finish-title">
          <div className="finishTape" aria-hidden="true" />
          <div className="finishPanel">
            {raceStatus === 'finished' && lastResult ? (
              <>
                {resultRank === 1 ? (
                  <p className="recordBadge">★ New record</p>
                ) : (
                  <p className="eyebrow">100 ft · finish line</p>
                )}
                <h2 id="finish-title">Finished!</h2>
                <p className="resultTime">{formatTime(lastResult.timeMs)}</p>
                <p className="resultRank">
                  {resultRank === 1
                    ? 'Fastest run on record'
                    : `That run ranks #${resultRank}`}
                </p>
                <form className="saveForm" onSubmit={saveResult}>
                  <label className="srOnly" htmlFor="player-name">
                    Name for leaderboard
                  </label>
                  <input
                    id="player-name"
                    maxLength={18}
                    onChange={(event) => setPlayerName(event.target.value)}
                    placeholder="Add your name"
                    type="text"
                    value={playerName}
                  />
                  <button
                    className="secondaryButton"
                    disabled={hasSaved}
                    type="submit"
                  >
                    <Trophy size={18} aria-hidden="true" />
                    {hasSaved ? 'Saved' : 'Save time'}
                  </button>
                </form>
                <button
                  className="resetButton"
                  type="button"
                  onClick={resetToTop}
                >
                  <ArrowUp size={18} aria-hidden="true" />
                  Reset to the top
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

      {raceStatus === 'intro' ? (
        <div className="introScreen" role="dialog" aria-label="Scroll Race">
          <div className="introGrain" aria-hidden="true" />
          <div className="introInner">
            <div className="introMain">
              <div className="introTape" aria-hidden="true" />
              <p className="introEyebrow">100-foot scroll sprint</p>
              <h1 className="introTitle">
                Scroll
                <span>Race</span>
              </h1>
              <p className="introDesc">
                Race your thumb down a hundred-foot ruler. Hit{' '}
                <strong>Start</strong>, wait out the three-second countdown, then
                scroll to the finish line as fast as you possibly can. Beat the
                clock — and the leaderboard.
              </p>
              <div className="introStats">
                <div className="introStat">
                  <span>Distance</span>
                  <strong>100 ft</strong>
                </div>
                <div className="introStat">
                  <span>Best time</span>
                  <strong>{bestTime ? formatTime(bestTime) : '—'}</strong>
                </div>
                <div className="introStat">
                  <span>Racers</span>
                  <strong>{leaderboard.length}</strong>
                </div>
              </div>
              <button
                className="primaryButton startBtn"
                type="button"
                onClick={beginCountdown}
              >
                <Play size={22} aria-hidden="true" />
                Start race
              </button>
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
            </div>

            <aside className="introBoard" aria-labelledby="leaderboard-title">
              <h2 id="leaderboard-title">
                <Trophy size={18} aria-hidden="true" />
                Leaderboard
              </h2>
              <Leaderboard entries={leaderboard} />
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

function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="emptyBoard">No times yet — be the first to finish.</p>
  }

  return (
    <ol className="leaderboardList">
      {entries.map((entry, index) => (
        <li key={entry.id} data-medal={index < 3 ? index + 1 : undefined}>
          <span className="leaderboardRank">{index + 1}</span>
          <span className="leaderboardName">{entry.name}</span>
          <span className="leaderboardTime">{formatTime(entry.timeMs)}</span>
        </li>
      ))}
    </ol>
  )
}

export function createRulerTicks(
  pixelsPerInch = CSS_PIXELS_PER_INCH,
): RulerTick[] {
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

function readLeaderboard(): LeaderboardEntry[] {
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
      .sort((left, right) => left.timeMs - right.timeMs)
      .slice(0, MAX_LEADERBOARD_ENTRIES)
  } catch {
    return []
  }
}

function writeLeaderboard(entries: LeaderboardEntry[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    return
  }
}

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
    typeof entry.completedAt === 'string'
  )
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

export function formatTime(milliseconds: number) {
  const totalSeconds = milliseconds / 1000

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(2)}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds - minutes * 60

  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`
}

function createEntryId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
