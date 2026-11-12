'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { hideForIntro, introShouldPlay, markIntroSeen, revealPage } from '@/lib/intro'
import { LogoMark } from './Logo'
import './TalklyPreloader.css'

const REDUCED_MIN_MS = 500
const FONT_WAIT_MS = 400
const REVEAL_LEAD_MS = 180
const CURTAIN_SECONDS = 0.85
const curtainEase = [0.76, 0, 0.24, 1] as const
const softEase = [0.16, 1, 0.3, 1] as const
const SCROLL_KEYS = new Set([' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'])

const BAR_COUNT = 31
const BLUE = [36, 99, 235]
const PURPLE = [121, 85, 232]

// Fixed values, so the waveform looks the same on every visit and costs nothing to re-render.
const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
  const position = i / (BAR_COUNT - 1)
  const envelope = Math.sin(position * Math.PI) ** 0.65
  const detail = 0.45 + 0.55 * Math.abs(Math.sin(i * 1.9) * Math.cos(i * 0.7))
  const color = BLUE.map((channel, c) => Math.round(channel + (PURPLE[c] - channel) * position))
  return {
    height: `${Math.round(Math.max(0.14, envelope * detail) * 100)}%`,
    color: `rgb(${color.join(' ')})`,
    delay: `${((i * 149) % 1000) * -1}ms`,
    duration: `${900 + ((i * 83) % 600)}ms`,
  }
})

// Reports the share of first-screen work that has finished, as a number from 0 to 1.
function trackCriticalAssets(onProgress: (value: number) => void) {
  const inFirstScreen = (image: HTMLImageElement) => image.getBoundingClientRect().top < window.innerHeight
  const firstScreenImages = [...document.images].filter(inFirstScreen)

  const tasks: Promise<unknown>[] = [
    new Promise<void>((resolve) => {
      if (document.readyState === 'complete') resolve()
      else window.addEventListener('load', () => resolve(), { once: true })
    }),
    document.fonts.load('600 54px "Sora Variable"'),
    document.fonts.load('400 18px "Inter Variable"'),
    ...firstScreenImages.map((image) => image.decode().catch(() => undefined)),
  ]

  let finished = 0
  tasks.forEach((task) => {
    const settle = () => {
      finished += 1
      onProgress(finished / tasks.length)
    }
    task.then(settle, settle) // A failed asset must never hold the page back.
  })
}

function usePageLock(locked: boolean) {
  useLayoutEffect(() => {
    if (!locked) return undefined
    // The marketing layout's own wrapper, not Vite/CRA's "#root" - see
    // frontend/app/(marketing)/layout.tsx. The preloader itself portals to
    // document.body, a sibling of this element, so it's never made inert.
    const root = document.getElementById('site-root')
    const html = document.documentElement
    const block = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const blockKeys = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) block(event)
    }
    const options: AddEventListenerOptions = { capture: true, passive: false }

    if (root) (root as unknown as { inert: boolean }).inert = true
    html.classList.add('talkly-intro-active')
    window.addEventListener('wheel', block, options)
    window.addEventListener('touchmove', block, options)
    window.addEventListener('keydown', blockKeys, options)

    return () => {
      if (root) (root as unknown as { inert: boolean }).inert = false
      html.classList.remove('talkly-intro-active')
      window.removeEventListener('wheel', block, options)
      window.removeEventListener('touchmove', block, options)
      window.removeEventListener('keydown', blockKeys, options)
    }
  }, [locked])
}

export default function TalklyPreloader({
  minDuration = 2000,
  maxDuration = 4500,
  onReveal,
  onComplete,
}: {
  minDuration?: number
  maxDuration?: number
  onReveal?: () => void
  onComplete?: () => void
}) {
  const reduce = useReducedMotion()
  const [enabled, setEnabled] = useState(false)
  const [phase, setPhase] = useState<'intro' | 'leaving' | 'done'>('done')
  const [started, setStarted] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onReveal, onComplete })
  callbacks.current = { onReveal, onComplete }

  // Decided once, after mount, so the server-rendered markup and the
  // client's first paint always agree (both show nothing here) - see
  // frontend/lib/intro.ts. Hiding content and showing the curtain happen in
  // this same effect, never as two separate updates that could land a frame
  // apart.
  useEffect(() => {
    if (introShouldPlay()) {
      hideForIntro()
      setEnabled(true)
      setPhase('intro')
    }
  }, [])

  usePageLock(phase !== 'done')

  // Hold the first frame briefly so the wordmark never appears in a fallback font.
  useEffect(() => {
    if (phase === 'done') return undefined
    const begin = () => setStarted(true)
    const timer = setTimeout(begin, FONT_WAIT_MS)
    document.fonts.load('600 54px "Sora Variable"').then(begin, begin)
    return () => clearTimeout(timer)
  }, [phase])

  // The bar never runs ahead of the real work, and the time gate keeps it from jumping.
  useEffect(() => {
    if (phase !== 'intro' || !started) return undefined
    const minimum = reduce ? REDUCED_MIN_MS : minDuration
    const startTime = performance.now()
    let real = 0
    let shown = 0
    let frame: number
    const leave = () => setPhase('leaving')

    trackCriticalAssets((value) => {
      real = value
    })

    const tick = (now: number) => {
      const elapsed = now - startTime
      if (elapsed >= maxDuration) real = 1
      shown += (Math.min(real, elapsed / minimum) - shown) * 0.12
      if (barRef.current) barRef.current.style.transform = `scaleX(${shown})`
      if (real === 1 && elapsed >= minimum) {
        if (barRef.current) barRef.current.style.transform = 'scaleX(1)'
        leave()
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    // Animation frames stop in background tabs, so a timer guarantees the exit.
    const failsafe = setTimeout(leave, maxDuration + 500)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(failsafe)
    }
  }, [phase, started, reduce, minDuration, maxDuration])

  useEffect(() => {
    if (phase !== 'leaving') return undefined
    markIntroSeen()
    const finish = () => setPhase('done')
    const revealTimer = setTimeout(() => {
      revealPage()
      callbacks.current.onReveal?.()
    }, reduce ? 0 : REVEAL_LEAD_MS)
    const finishTimer = setTimeout(finish, CURTAIN_SECONDS * 1000 + 300)
    return () => {
      clearTimeout(revealTimer)
      clearTimeout(finishTimer)
    }
  }, [phase, reduce])

  useEffect(() => {
    if (enabled && phase === 'done') callbacks.current.onComplete?.()
  }, [enabled, phase])

  if (phase === 'done') return null

  const leaving = phase === 'leaving'
  const curtain = reduce ? { opacity: leaving ? 0 : 1 } : { y: leaving ? '-100%' : '0%' }
  const enter = (delay: number, from: Record<string, number | string> = { opacity: 0, y: 10 }) => ({
    initial: reduce ? { opacity: 0 } : from,
    animate: started ? { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' } : undefined,
    transition: { duration: reduce ? 0.3 : 0.7, delay: reduce ? 0 : delay, ease: softEase },
  })

  return createPortal(
    <motion.div
      className="talkly-preloader"
      role="status"
      aria-label="Loading Voice AI"
      animate={curtain}
      transition={{ duration: reduce ? 0.3 : CURTAIN_SECONDS, ease: curtainEase }}
      onAnimationComplete={() => {
        if (leaving) setPhase('done')
      }}
    >
      <div aria-hidden="true" className="talkly-preloader-glow talkly-preloader-glow-a" />
      <div aria-hidden="true" className="talkly-preloader-glow talkly-preloader-glow-b" />

      <motion.div
        aria-hidden="true"
        className="talkly-preloader-content"
        animate={leaving ? { opacity: 0, y: reduce ? 0 : -28 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="talkly-preloader-center">
          <motion.div
            className="talkly-preloader-logo"
            {...enter(0, { opacity: 0, scale: 0.92, filter: 'blur(10px)' })}
            transition={{ duration: reduce ? 0.3 : 0.9, ease: softEase }}
          >
            <LogoMark className="talkly-preloader-mark" />
            <span translate="no" className="talkly-preloader-name">Voice AI</span>
          </motion.div>

          <motion.div className="talkly-preloader-wave" {...enter(0.35)}>
            {bars.map((bar, index) => (
              <span
                key={index}
                style={{
                  height: bar.height,
                  backgroundColor: bar.color,
                  animationDelay: bar.delay,
                  animationDuration: bar.duration,
                }}
              />
            ))}
          </motion.div>

          <motion.div className="talkly-preloader-track" {...enter(0.5, { opacity: 0 })}>
            <div ref={barRef} className="talkly-preloader-bar" />
          </motion.div>
        </div>

        <motion.div className="talkly-preloader-powered" {...enter(0.7)}>
          <span className="talkly-preloader-label">Autonomous Enterprise</span>
          <span className="talkly-preloader-brand">
            <span className="talkly-preloader-dot" />
            <span translate="no" className="talkly-preloader-word">Voice Platform</span>
          </span>
        </motion.div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
