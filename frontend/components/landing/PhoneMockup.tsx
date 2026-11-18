'use client'

import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import { CalendarCheck, Check, IndianRupee, MessageCircle, Pause, PhoneOff, Play, UserRoundCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { heroCall } from '@/lib/landing-content'
import { useIntroRevealed } from '@/lib/intro'
import { LogoMark } from './Logo'
import { easeSoft } from './Reveal'
import Waveform from './Waveform'

const outcomes = [
  // Even 22% vertical steps and one shared left edge that only overlaps the phone's bezel, never its screen content.
  { label: 'Qualified Leads', icon: UserRoundCheck, tint: 'text-[#16855a] bg-[#e4f6ee]', pos: 'sm:top-[10%] sm:left-[calc(100%-8px)]' },
  { label: 'Book Appointments', icon: CalendarCheck, tint: 'text-[#d03f5c] bg-[#fdebef]', pos: 'sm:top-[32%] sm:left-[calc(100%-8px)]' },
  { label: 'Collect Payments', icon: IndianRupee, tint: 'text-[#b76b08] bg-[#fdf2dd]', pos: 'sm:top-[54%] sm:left-[calc(100%-8px)]' },
  { label: 'WhatsApp Follow-ups', icon: MessageCircle, tint: 'text-[#16855a] bg-[#e4f6ee]', pos: 'sm:top-[76%] sm:left-[calc(100%-8px)]' },
]

const LINE_MS = 3000
const HOLD_MS = 5000
const lastLine = heroCall.lines.length - 1

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

// Runs the scripted sample call. It stops while off screen or when paused by the visitor.
function useSampleCall(active: boolean) {
  const [line, setLine] = useState(0)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!active) return undefined
    const atEnd = line === lastLine
    const timer = setTimeout(() => {
      setLine(atEnd ? 0 : line + 1)
      if (atEnd) setSeconds(0)
    }, atEnd ? HOLD_MS : LINE_MS)
    return () => clearTimeout(timer)
  }, [active, line])

  useEffect(() => {
    if (!active) return undefined
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [active])

  return { line, seconds }
}

export default function PhoneMockup() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-80px' })
  const liveReduce = useReducedMotion()
  // useReducedMotion() can't see the browser's media query during SSR, so it
  // always starts as null there. Trusting it immediately on the client (which
  // may already know prefers-reduced-motion: reduce) would mismatch the
  // server-rendered markup, so keep the SSR-safe `false` until after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const reduce = mounted ? liveReduce : false
  const [paused, setPaused] = useState(false)
  const revealed = useIntroRevealed()
  const running = inView && !paused && !reduce && revealed
  const { line, seconds } = useSampleCall(running)

  const shownLine = reduce ? lastLine : line
  const current = heroCall.lines[shownLine]
  // The two most recent lines of the scripted call, oldest first, so it reads like a live chat.
  const recent = heroCall.lines
    .map((entry, index) => ({ entry, index }))
    .slice(Math.max(0, shownLine - 1), shownLine + 1)
  const reached = heroCall.lines.slice(0, shownLine + 1).reduce(
    (latest, entry) => (entry.outcome === undefined ? latest : entry.outcome),
    -1,
  )

  return (
    // `isolate` keeps the -z-10 glow and waveform above the hero's own background layer.
    <div ref={ref} className="relative isolate mx-auto w-full max-w-[33rem]">
      {/* Soft blue-purple glow behind the phone; it breathes slowly only while the sample call runs. */}
      <motion.div
        aria-hidden="true"
        className="absolute left-1/2 top-[44%] -z-10 aspect-square w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(36_99_235/0.22),rgb(121_85_232/0.16)_55%,transparent)] blur-2xl sm:w-[62%]"
        initial={{ opacity: 0 }}
        animate={revealed ? (running ? { opacity: [0.75, 1, 0.75], scale: [1, 1.06, 1] } : { opacity: 0.85, scale: 1 }) : { opacity: 0 }}
        transition={running ? { duration: 6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.8, ease: easeSoft }}
      />
      <div aria-hidden="true" className="absolute left-1/2 top-[44%] -z-10 hidden w-[125%] -translate-x-1/2 -translate-y-1/2 sm:block">
        <div className="mx-auto aspect-square w-[64%] rounded-full bg-[radial-gradient(closest-side,rgb(36_99_235/0.09),rgb(121_85_232/0.05)_70%,transparent)]" />
        <div className="absolute inset-x-0 top-1/2 h-44 -translate-y-1/2 text-brand/25 [mask-image:linear-gradient(90deg,transparent,#000_30%,#000_70%,transparent)]">
          <Waveform bars={68} playing={running} still={Boolean(reduce)} barWidth={3} gap={6} />
        </div>
      </div>

      <div className="relative mx-auto w-full sm:ml-[8%] sm:w-[16.25rem] lg:ml-0 xl:ml-[8%]">
        <motion.div
          className="mx-auto w-[15.5rem] sm:w-full"
          initial={{ opacity: 0, y: 36 }}
          animate={revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 36 }}
          transition={{ duration: 1, delay: 0.3, ease: easeSoft }}
        >
          <div className="float">
            <div className="rounded-[2.75rem] bg-ink p-[9px] shadow-[0_40px_70px_-30px_rgb(17_24_39/0.55),0_2px_0_0_#374151_inset]">
              <div className="relative flex h-[30rem] flex-col overflow-hidden rounded-[2.2rem] bg-gradient-to-b from-white to-mist px-4 pb-5 pt-9">
                <div aria-hidden="true" className="absolute left-1/2 top-2.5 h-[18px] w-[4.75rem] -translate-x-1/2 rounded-full bg-ink" />

                <div className="text-center">
                  <LogoMark className="mx-auto h-6 w-6" />
                  <p translate="no" className="mt-1.5 font-display text-[0.9375rem] font-semibold text-ink">
                    TalklyAI
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-haze px-2.5 py-0.5 text-[0.6875rem] font-medium text-brand-dark">
                    <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
                      {running && <span className="absolute inline-flex h-full w-full rounded-full bg-[#16a34a] opacity-70 motion-safe:animate-ping" />}
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                    </span>
                    Sample call
                  </p>
                  <p className="mt-2 text-sm font-medium text-ink">{heroCall.customer}</p>
                  <p className="text-xs tabular-nums text-muted">{heroCall.number}</p>
                  <p className="mt-1 text-xs tabular-nums text-muted">{reduce ? '00:24' : formatTime(seconds)}</p>
                </div>

                <div
                  className={`mt-3 h-14 transition-colors duration-300 ${current.speaker === 'ai' ? 'text-brand' : 'text-accent'}`}
                >
                  <Waveform bars={26} playing={running} still={Boolean(reduce)} barWidth={3} gap={3} />
                </div>

                {/* Fixed height, so a longer line never shifts the controls. Newest bubble sits at the
                    bottom; the earlier one fades out under the top edge. */}
                <div
                  className="mt-2 flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_8%)]"
                  aria-live="off"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {recent.map(({ entry, index }) => {
                      const latest = index === shownLine
                      return (
                        <motion.div
                          key={index}
                          layout={!reduce}
                          data-call-bubble
                          lang="hi-Latn"
                          initial={{ opacity: 0, y: 14, scale: 0.96 }}
                          // Both visible bubbles stay fully opaque so their text keeps full contrast.
                          animate={{ opacity: 1, y: 0, scale: latest ? 1 : 0.98 }}
                          exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                          transition={{ duration: 0.38, ease: easeSoft }}
                          className={`shrink-0 rounded-2xl px-3 py-2.5 text-[0.8125rem] leading-snug ${
                            entry.speaker === 'ai'
                              ? 'mr-5 origin-bottom-left rounded-bl-sm border border-line bg-white text-ink'
                              : 'ml-5 origin-bottom-right rounded-br-sm border border-[#d9cdfa] bg-[#ebe4fd] text-ink'
                          }`}
                        >
                          <span className={`mb-0.5 block text-[0.6875rem] font-semibold ${entry.speaker === 'ai' ? 'text-brand-dark' : 'text-[#4a2ba3]'}`}>
                            {entry.speaker === 'ai' ? 'TalklyAI' : 'Customer'}
                          </span>
                          {entry.text}
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>

                <div className="mt-2 flex items-center justify-center gap-6">
                  {!reduce && (
                    <button
                      type="button"
                      onClick={() => setPaused((value) => !value)}
                      aria-label={paused ? 'Play sample call' : 'Pause sample call'}
                      className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-ink transition-colors hover:bg-haze"
                    >
                      {paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
                    </button>
                  )}
                  <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[#dc3545] text-white">
                    <PhoneOff size={18} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <ul className="mt-6 grid grid-cols-2 gap-2.5 sm:contents" aria-label="What a call can lead to">
          {outcomes.map((outcome, index) => {
            const Icon = outcome.icon
            const done = index <= reached
            return (
              <motion.li
                key={outcome.label}
                initial={{ opacity: 0, x: 18, y: 10 }}
                animate={revealed ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: 18, y: 10 }}
                transition={{ duration: 0.75, delay: 0.75 + index * 0.14, ease: easeSoft }}
                className={`sm:absolute sm:w-max ${outcome.pos}`}
              >
                <div className="float-sm" style={{ animationDelay: `${index * -1.2}s` }}>
                  <div
                    className={`flex items-center gap-2 rounded-[14px] border bg-white py-2 pl-2 pr-3 text-[0.8125rem] font-semibold text-ink transition-[border-color,box-shadow] duration-500 ${
                      done ? 'border-brand/40 shadow-lift' : 'border-line shadow-card'
                    }`}
                  >
                    <span className={`grid h-7 w-7 flex-none place-items-center rounded-lg ${outcome.tint}`}>
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 max-sm:text-xs">{outcome.label}</span>
                    {/* The tick pops in when the sample call reaches this outcome. */}
                    <motion.span
                      aria-hidden="true"
                      className="flex-none text-brand max-sm:hidden"
                      initial={false}
                      animate={done ? { opacity: 1, scale: reduce ? 1 : [0.4, 1.25, 1] } : { opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.45, ease: easeSoft }}
                    >
                      <Check size={15} strokeWidth={2.5} />
                    </motion.span>
                  </div>
                </div>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
