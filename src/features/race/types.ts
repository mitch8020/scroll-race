export type RaceStatus = 'intro' | 'countdown' | 'racing' | 'finished'

export type RaceSearch = {
  beat?: number
  by?: string
  event?: number
}

export type Challenge = {
  name: string
  timeMs: number
  eventFeet: number
}

export type RaceResult = {
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

export type GhostPlan =
  | { kind: 'challenge'; name: string; totalMs: number; splitsMs: null }
  | {
      kind: 'pb'
      name: string
      totalMs: number
      splitsMs: Array<number> | null
    }
