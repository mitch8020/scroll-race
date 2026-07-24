import type { RaceEvent } from './race'
import { EVENTS } from './race'

export const INCHES_PER_FOOT = 12
export const CSS_PIXELS_PER_INCH = 96
export const MIN_PIXELS_PER_INCH = 72
export const MAX_PIXELS_PER_INCH = 220

export type RulerTick = {
  inch: number
  top: number
  kind: 'foot' | 'half' | 'quarter' | 'inch'
  label?: string
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function normalizePixelsPerInch(value: number) {
  if (!Number.isFinite(value)) {
    return CSS_PIXELS_PER_INCH
  }

  return Math.round(clamp(value, MIN_PIXELS_PER_INCH, MAX_PIXELS_PER_INCH))
}

export function createRulerTicks(
  pixelsPerInch = CSS_PIXELS_PER_INCH,
  event: RaceEvent = EVENTS[0],
): Array<RulerTick> {
  // Tick spacing coarsens with course length so the DOM stays ~1,200 nodes:
  // every inch at 100 ft, every foot at 1000 ft.
  const tickCount =
    Math.floor((event.feet * INCHES_PER_FOOT) / event.tickEveryInches) + 1

  return Array.from({ length: tickCount }, (_, index) => {
    const inch = index * event.tickEveryInches
    const wholeFeet = Math.floor(inch / INCHES_PER_FOOT)
    const inchInFoot = inch % INCHES_PER_FOOT
    const kind =
      inchInFoot === 0
        ? wholeFeet % event.majorTickFeet === 0
          ? 'foot'
          : 'half'
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
        inchInFoot === 0 && wholeFeet % event.labelEveryFeet === 0
          ? `${wholeFeet} ft`
          : undefined,
    }
  })
}
