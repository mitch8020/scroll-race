import type { CSSProperties } from 'react'

import type { GlobalEntry } from '../../lib/board'
import type { LeaderboardEntry } from '../../lib/localRaceStore'
import { formatTime } from '../../lib/race'

export type GlobalBoardState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: Array<GlobalEntry>; total: number }

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
export function WorldBoard({
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

export function Leaderboard({
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
