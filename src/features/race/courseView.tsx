import { memo } from 'react'

import type { RulerTick } from '../../lib/course'
import { PERCENT_STEPS } from '../../lib/race'

export const MILESTONE_PERCENTS = [25, 50, 75]

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

// The course furniture is memoized at module scope: setElapsedMs commits once
// per rAF frame, and without the bailout every commit would re-reconcile the
// 1,201 ruler ticks plus all course marks — pure waste in the hottest path.
export const RulerRail = memo(function RulerRail({
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

export const DecadeMarks = memo(function DecadeMarks({
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

export const MilestoneGates = memo(function MilestoneGates({
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
