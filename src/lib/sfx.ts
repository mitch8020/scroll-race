// Synthesized sound + haptics. No audio files: every cue is built from
// oscillators at call time. ensureAudio() must run synchronously inside a user
// gesture (the Start button click) — iOS and Chrome gate audio on it.

const MUTE_STORAGE_KEY = 'scroll-race-muted-v1'

let context: AudioContext | null = null
let master: GainNode | null = null
let muted = false
let mutedLoaded = false
let hapticsEnabled = true

function loadMuted() {
  if (mutedLoaded || typeof window === 'undefined') {
    return
  }

  mutedLoaded = true

  try {
    muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    muted = false
  }
}

export function isMuted() {
  loadMuted()

  return muted
}

export function setMuted(value: boolean) {
  loadMuted()
  muted = value

  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Storage being unavailable should never break the game.
  }
}

export function setHaptics(enabled: boolean) {
  hapticsEnabled = enabled
}

export function ensureAudio() {
  if (typeof window === 'undefined') {
    return
  }

  loadMuted()

  try {
    if (!context) {
      const audioWindow = window as Window & {
        AudioContext?: typeof AudioContext
        webkitAudioContext?: typeof AudioContext
      }
      const Constructor =
        audioWindow.AudioContext ?? audioWindow.webkitAudioContext

      if (!Constructor) {
        return
      }

      context = new Constructor()
      master = context.createGain()
      // Synth squares are harsh at full volume.
      master.gain.value = 0.22
      master.connect(context.destination)
    }

    if (context.state !== 'running') {
      // iOS Safari reports a non-standard 'interrupted' state after a phone
      // call / Siri / screen lock; resume from any non-running state inside
      // the gesture. Swallow rejections — the next gesture retries.
      context.resume().catch(() => {})
    }
  } catch {
    context = null
    master = null
  }
}

type NoteOptions = {
  at?: number
  durationMs: number
  peak: number
  type?: OscillatorType
  detuneCents?: number
}

function note(frequency: number, options: NoteOptions) {
  if (muted || !context || !master) {
    return
  }

  const start = context.currentTime + (options.at ?? 0)
  const stop = start + options.durationMs / 1000
  const oscillator = context.createOscillator()

  oscillator.type = options.type ?? 'sine'
  oscillator.frequency.value = frequency

  if (options.detuneCents) {
    oscillator.detune.value = options.detuneCents
  }

  const gain = context.createGain()

  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(options.peak, start + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, stop)

  oscillator.connect(gain)
  gain.connect(master)
  oscillator.start(start)
  oscillator.stop(stop + 0.05)
}

export function countTick() {
  note(740, { durationMs: 90, peak: 0.5 })
}

// Same timbre as the count, resolved up a fifth: the race-start chord.
export function goBlast() {
  note(1109, { durationMs: 220, peak: 0.18, type: 'square' })
  note(554, { durationMs: 220, peak: 0.3 })
}

const MILESTONE_FREQUENCIES: Record<number, number> = {
  25: 988,
  50: 1175,
  75: 1319,
}

export function milestoneTick(feet: number) {
  note(MILESTONE_FREQUENCIES[feet] ?? 988, {
    durationMs: 70,
    peak: 0.35,
    type: 'triangle',
  })
}

export function fanfare(isRecord: boolean) {
  note(523.25, { at: 0, durationMs: 280, peak: 0.3, type: 'triangle' })
  note(659.25, { at: 0.09, durationMs: 280, peak: 0.3, type: 'triangle' })
  note(783.99, { at: 0.18, durationMs: 280, peak: 0.3, type: 'triangle' })

  if (isRecord) {
    note(1046.5, { at: 0.27, durationMs: 600, peak: 0.3, type: 'triangle' })
    note(1046.5, {
      at: 0.27,
      durationMs: 600,
      peak: 0.2,
      type: 'triangle',
      detuneCents: 6,
    })
    tapeSnapNoise()
  }
}

// A 120ms band-passed white-noise transient — the finish tape snapping.
function tapeSnapNoise() {
  if (muted || !context || !master) {
    return
  }

  const length = Math.floor(context.sampleRate * 0.12)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)

  for (let index = 0; index < length; index += 1) {
    data[index] = Math.random() * 2 - 1
  }

  const source = context.createBufferSource()

  source.buffer = buffer

  const filter = context.createBiquadFilter()

  filter.type = 'bandpass'
  filter.frequency.value = 1800
  filter.Q.value = 2

  const gain = context.createGain()
  const now = context.currentTime

  gain.gain.setValueAtTime(0.5, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  source.start(now)
}

// Haptics are independent of the audio mute (a muted phone still deserves the
// GO kick) but suppressed under prefers-reduced-motion via setHaptics(false).
export function buzz(pattern: number | Array<number>) {
  if (!hapticsEnabled || typeof navigator === 'undefined') {
    return
  }

  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {
    // Some browsers throw on vibrate without a gesture; ignore.
  }
}
