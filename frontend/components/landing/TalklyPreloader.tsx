'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { hideForIntro, introShouldPlay, markIntroSeen, revealPage } from '@/lib/intro'
import { LogoMark } from './Logo'
import './TalklyPreloader.css'

// Total on screen is about 1.5-2s: ~0.1s font hold, 1.05-1.5s of waveform + logo, then a 0.45s fade.
const REDUCED_MIN_MS = 250
const FONT_WAIT_MS = 120
const REVEAL_LEAD_MS = 60
const CURTAIN_SECONDS = 0.45
const curtainEase = [0.4, 0, 0.2, 1] as const
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
  // Both measured from the start of the page load (performance.now()), not from when scripts ran,
  // so slow script loading never makes the intro longer.
  minDuration = 1200,
  maxDuration = 1500,
  onReveal,
  onComplete,
}: {
  minDuration?: number
  maxDuration?: number
  onReveal?: () => void
  onComplete?: () => void
}) {
  const liveReduce = useReducedMotion()
  // useReducedMotion() is unknown during SSR; use `false` until mounted so the markup matches.
  const [mounted, setMounted] = useState(false)
  const reduce = mounted ? Boolean(liveReduce) : false
  // The curtain is part of the server-rendered HTML, so it is the very first thing painted on a
  // direct visit or refresh (no flash of the page underneath). After a client-side navigation the
  // layout may remount without a server render; then introShouldPlay() is false and nothing shows.
  const [initialPhase] = useState<'intro' | 'done'>(() => (typeof window === 'undefined' || introShouldPlay() ? 'intro' : 'done'))
  const enabled = initialPhase === 'intro'
  const [phase, setPhase] = useState<'intro' | 'leaving' | 'done'>(initialPhase)
  const [started, setStarted] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onReveal, onComplete })
  callbacks.current = { onReveal, onComplete }

  // Claim the intro for this page load at once (so a remount can never start a second one), and set the
  // page's entrance animations to their starting state while the curtain still covers them.
  useEffect(() => {
    setMounted(true)
    if (initialPhase === 'intro') {
      markIntroSeen()
      hideForIntro()
    }
  }, [initialPhase])

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
    // With reduced motion the intro is only a brief static frame, so it never waits long for assets.
    const ceiling = reduce ? REDUCED_MIN_MS + 350 : maxDuration
    const startTime = 0 // page-load start
    let real = 0
    let shown = 0
    let frame: number
    const leave = () => setPhase('leaving')

    trackCriticalAssets((value) => {
      real = value
    })

    const tick = (now: number) => {
      const elapsed = now - startTime
      if (elapsed >= ceiling) real = 1
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
    const failsafe = setTimeout(leave, Math.max(0, ceiling - performance.now()) + 400)
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
  // A clean fade (no sliding curtain); the content lifts slightly as it goes.
  const curtain = { opacity: leaving ? 0 : 1 }


  return (
    <>
      {/* Without JavaScript the curtain could never lift, so it is simply not shown. */}
      <noscript>
        <style>{'.talkly-preloader{display:none!important}'}</style>
      </noscript>
    <motion.div
      className="talkly-preloader"
      role="status"
      aria-label="Loading TalklyAI"
      animate={curtain}
      transition={{ duration: reduce ? 0.2 : CURTAIN_SECONDS, ease: curtainEase }}
      onAnimationComplete={() => {
        if (leaving) setPhase('done')
      }}
    >
      <div aria-hidden="true" className="talkly-preloader-glow talkly-preloader-glow-a" />
      <div aria-hidden="true" className="talkly-preloader-glow talkly-preloader-glow-b" />

      <motion.div
        aria-hidden="true"
        className="talkly-preloader-content"
        animate={leaving ? { opacity: 0, y: reduce ? 0 : -12, scale: reduce ? 1 : 1.02 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0.2 : 0.4, ease: 'easeOut' }}
      >
        <div className="talkly-preloader-center">
          {/* Entrance order (CSS, runs from first paint): waveform, then the logo, then the bar and credit. */}
          <div className="talkly-preloader-logo">
            <LogoMark className="talkly-preloader-mark" />
            <span translate="no" className="talkly-preloader-name">TalklyAI</span>
          </div>

          <div className="talkly-preloader-wave">
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
          </div>

          <div className="talkly-preloader-track">
            <div ref={barRef} className="talkly-preloader-bar" />
          </div>
        </div>

        <div className="talkly-preloader-powered">
          <span className="talkly-preloader-label">Powered by</span>
          <span className="talkly-preloader-brand">
            <span className="talkly-preloader-dot" />
            <span translate="no" className="talkly-preloader-word">Novalantis</span>
          </span>
        </div>
      </motion.div>
    </motion.div>
    </>
  )
}
