import { useEffect, useRef, useState } from 'react'

import { formatTime } from '../../lib/race'
import type { Challenge, RaceResult } from './types'

export function PbDeltaLine({ result }: { result: RaceResult }) {
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

export function verdictLine(result: RaceResult, challenge: Challenge) {
  const diff = challenge.timeMs - result.timeMs

  if (Math.abs(diff) < 10) {
    return `Dead heat with ${challenge.name}. Run it again.`
  }

  if (diff > 0) {
    return `You beat ${challenge.name} by ${(diff / 1000).toFixed(2)}s. Send it back.`
  }

  return `${challenge.name} survives — you were ${(Math.abs(diff) / 1000).toFixed(2)}s short.`
}

// Two cannons of brand-colored paper — it must look like the poster tore
// itself up, not party confetti. Self-terminates within 3 seconds.
export function ConfettiBurst() {
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
