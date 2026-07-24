import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'

import { createRulerTicks, normalizePixelsPerInch } from '../lib/course'
import {
  DEFAULT_EVENT_FEET,
  formatTime,
  parseChallengeMs,
  parseEventFeet,
  sanitizeName,
} from '../lib/race'
import { ScrollRace } from '../features/race/ScrollRace'

export { createRulerTicks, formatTime, normalizePixelsPerInch }

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
  component: ScrollRaceRoute,
})

function ScrollRaceRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const clearChallenge = useCallback(() => {
    void navigate({
      search: { beat: undefined, by: undefined, event: undefined },
      replace: true,
      // Without this, scroll restoration yanks the player from the finish
      // panel back to the top of the course mid-celebration.
      resetScroll: false,
    })
  }, [navigate])

  return <ScrollRace search={search} clearChallenge={clearChallenge} />
}
