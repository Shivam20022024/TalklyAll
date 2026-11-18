'use client'

import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import { ArrowRight, BrainCircuit, CalendarCheck, Check, MessageCircle, PhoneOutgoing, PlayCircle, RotateCcw, UserRoundPlus } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useIntroRevealed } from '@/lib/intro'
import Reveal, { easeSoft } from './Reveal'
import Waveform from './Waveform'

/*
 * A scripted, clearly labelled sample of the TalklyAI flow: lead in, call out,
 * qualification, booked outcome. Nothing here talks to the backend or places a call.
 *
 * Timing: each step is BEATS beats of BEAT_MS. Inside a step, later details appear
 * on later beats (around 0.5-0.6s apart), so every step plays as a short, readable sequence.
 */
const BEAT_MS = 600
const BEATS = 6 // 3.6s per step
const LAST = 3

const steps = [
  { title: 'Lead received', body: 'A new enquiry arrives from your website or lead list.', icon: UserRoundPlus },
  { title: 'AI initiates the call', body: 'TalklyAI places an outbound call to the lead.', icon: PhoneOutgoing },
  { title: 'AI understands & qualifies', body: 'It listens, picks up the intent and qualifies the lead.', icon: BrainCircuit },
  { title: 'Action completed', body: 'A site visit is booked and a WhatsApp confirmation goes out.', icon: CalendarCheck },
]

const lead = { initials: 'PS', name: 'Priya Sharma', phone: '+91 98••• ••431' }

const pop = { initial: { opacity: 0, scale: 0.6 }, animate: { opacity: 1, scale: [0.6, 1.15, 1] }, transition: { duration: 0.45, ease: easeSoft } }

// Appears once `beat` reaches `at`; space is reserved from the start, so nothing shifts.
function Show({ beat, at, children, className = '', y = 10 }: { beat: number; at: number; children: React.ReactNode; className?: string; y?: number }) {
  const on = beat >= at
  return (
    <motion.div
      className={className}
      initial={false}
      animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.5, ease: easeSoft }}
      aria-hidden={!on}
    >
      {children}
    </motion.div>
  )
}

function LeadStep({ beat }: { beat: number }) {
  return (
    <div className="flex h-full flex-col justify-center">
      <Show beat={beat} at={0} y={18} className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#e8effe] font-display text-[0.9375rem] font-semibold text-brand-dark">{lead.initials}</span>
            <div>
              <p className="text-base font-semibold text-ink">{lead.name}</p>
              <p className="text-sm tabular-nums text-body">{lead.phone}</p>
            </div>
          </div>
          {beat >= 1 && (
            <motion.span {...pop} className="rounded-full bg-[#e8effe] px-2.5 py-1 text-xs font-semibold text-brand-dark">
              New lead
            </motion.span>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2.5 text-sm">
          {[
            ['Source', 'Website form', 2],
            ['Interest', '2 BHK, Pune', 2],
            ['Budget', 'Not shared yet', 3],
            ['Received', 'Just now', 3],
          ].map(([k, v, at]) => (
            <Show key={k as string} beat={beat} at={at as number} y={6} className="rounded-xl bg-mist px-3 py-2">
              <dt className="text-xs text-body">{k}</dt>
              <dd className="font-medium text-ink">{v}</dd>
            </Show>
          ))}
        </dl>
      </Show>
      <Show beat={beat} at={4} className="mt-3 flex items-center gap-2 text-sm font-medium text-brand-dark">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-brand opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
        </span>
        Queued for an AI call
      </Show>
    </div>
  )
}

function CallStep({ beat, running }: { beat: number; running: boolean }) {
  const connected = beat >= 2
  const seconds = connected ? Math.max(0, Math.round(((beat - 2) * BEAT_MS) / 1000)) : 0
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="relative grid h-24 w-24 place-items-center">
        {!connected && running && (
          <>
            <span className="absolute inset-0 rounded-full bg-brand/15 motion-safe:animate-ping" />
            <span className="absolute inset-2 rounded-full bg-brand/10" />
          </>
        )}
        <span className={`relative grid h-16 w-16 place-items-center rounded-full text-white shadow-lift transition-colors duration-500 ${connected ? 'bg-[#16855a]' : 'bg-brand'}`}>
          <PhoneOutgoing size={26} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-base font-semibold text-ink">{connected ? `Connected with ${lead.name}` : `Calling ${lead.name}…`}</p>
      <p className="mt-1 text-sm tabular-nums text-body">{connected ? `00:0${Math.min(seconds, 9)}` : 'Ringing'}</p>
      <div className={`mt-5 h-14 w-full max-w-[18rem] transition-colors duration-500 ${connected ? 'text-brand' : 'text-line'}`}>
        <Waveform bars={30} playing={connected && running} still={!running} barWidth={3} gap={3} />
      </div>
      <Show beat={beat} at={3} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#e4f6ee] px-3 py-1 text-xs font-semibold text-[#14714d]">
        <Check size={13} strokeWidth={2.5} aria-hidden="true" />
        Call answered
      </Show>
    </div>
  )
}

function QualifyStep({ beat }: { beat: number }) {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      <Show beat={beat} at={0} className="mr-8 rounded-2xl rounded-bl-sm border border-line bg-white px-3.5 py-2.5 text-sm leading-snug text-ink" >
        <span lang="hi-Latn">
          <span className="mb-0.5 block text-xs font-semibold text-brand-dark">TalklyAI</span>
          Namaste Priya ji, aapne Pune mein 2 BHK ke liye enquiry ki thi. Budget kitna socha hai?
        </span>
      </Show>
      <Show beat={beat} at={1} className="ml-8 rounded-2xl rounded-br-sm border border-[#d9cdfa] bg-[#ebe4fd] px-3.5 py-2.5 text-sm leading-snug text-ink">
        <span lang="hi-Latn">
          <span className="mb-0.5 block text-xs font-semibold text-[#4a2ba3]">Customer</span>
          Around 70 lakh. Weekend pe site dekhna hai.
        </span>
      </Show>
      <Show beat={beat} at={3} className="mt-1 flex flex-wrap gap-2">
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink">Intent: Site visit</span>
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink">Budget: ₹70 lakh</span>
        <span className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink">Timeline: This weekend</span>
      </Show>
      <Show beat={beat} at={4} className="mt-1 flex items-center gap-2.5 rounded-xl border border-[#bfe6d3] bg-[#effaf4] px-3.5 py-2.5">
        {beat >= 4 && (
          <motion.span {...pop} className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[#16855a] text-white">
            <Check size={15} strokeWidth={3} aria-hidden="true" />
          </motion.span>
        )}
        <span className="text-sm font-semibold text-[#14714d]">Lead qualified: ready for a site visit</span>
      </Show>
    </div>
  )
}

function DoneStep({ beat }: { beat: number }) {
  const rows = [
    { at: 0, icon: CalendarCheck, tint: 'bg-[#fdebef] text-[#c03553]', title: 'Site visit booked', detail: 'Sunday, 11:00 AM' },
    { at: 2, icon: MessageCircle, tint: 'bg-[#e4f6ee] text-[#16855a]', title: 'WhatsApp confirmation sent', detail: 'Visit details and location shared' },
  ]
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {rows.map((row) => {
        const Icon = row.icon
        return (
          <Show key={row.title} beat={beat} at={row.at} y={14} className="flex items-center gap-3.5 rounded-2xl border border-line bg-white p-4 shadow-card">
            <span className={`grid h-11 w-11 flex-none place-items-center rounded-xl ${row.tint}`}>
              <Icon size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-semibold text-ink">{row.title}</p>
              <p className="text-sm text-body">{row.detail}</p>
            </div>
            {beat >= row.at + 1 && (
              <motion.span {...pop} className="grid h-7 w-7 flex-none place-items-center rounded-full bg-brand text-white">
                <Check size={15} strokeWidth={3} aria-hidden="true" />
              </motion.span>
            )}
          </Show>
        )
      })}
      <Show beat={beat} at={4} className="mt-1 text-center text-sm font-medium text-body">
        Sample outcome. Nothing was booked or sent.
      </Show>
    </div>
  )
}

export default function ProductDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const revealed = useIntroRevealed()
  const liveReduce = useReducedMotion()
  // Same SSR-safe pattern as the hero: trust the media query only after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const reduce = mounted ? Boolean(liveReduce) : false

  const [step, setStep] = useState(0)
  const [beat, setBeat] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)

  // Start once, the first time the demo scrolls into view (after the intro has cleared).
  useEffect(() => {
    if (started || !inView || !revealed || !mounted) return
    setStarted(true)
    if (reduce) {
      setStep(LAST)
      setBeat(BEATS)
    } else {
      setStep(0)
      setBeat(0)
      setPlaying(true)
    }
  }, [inView, revealed, mounted, reduce, started])

  useEffect(() => {
    if (!playing) return undefined
    const timer = setTimeout(() => {
      if (beat + 1 < BEATS) setBeat(beat + 1)
      else if (step < LAST) {
        setStep(step + 1)
        setBeat(0)
      } else {
        setBeat(BEATS)
        setPlaying(false)
      }
    }, BEAT_MS)
    return () => clearTimeout(timer)
  }, [playing, step, beat])

  const replay = () => {
    setStarted(true)
    setStep(0)
    setBeat(reduce ? BEATS : 0)
    setPlaying(!reduce)
  }
  const jumpTo = (index: number) => {
    setStarted(true)
    setPlaying(false)
    setStep(index)
    setBeat(BEATS)
  }

  const finished = !playing && started && step === LAST && beat >= BEATS
  // Progress of the line joining the steps (0 to 1).
  const progress = started ? Math.min(1, (step + Math.min(beat, BEATS) / BEATS) / LAST) : 0
  const shownBeat = started ? beat : -1

  return (
    <section id="product-demo" className="section overflow-hidden" aria-labelledby="product-demo-title">
      <div className="wrap">
        <div ref={ref} className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
          <div>
            <Reveal y={12} amount={0.5}>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe3fb] bg-white px-3 py-1 text-[0.8125rem] font-semibold text-brand-dark">
                <PlayCircle size={14} aria-hidden="true" />
                Product demo
              </p>
            </Reveal>
            <Reveal y={16} amount={0.5} delay={0.08}>
              <h2 id="product-demo-title" className="h-section mt-4">
                See TalklyAI in Action
              </h2>
            </Reveal>
            <Reveal y={12} amount={0.5} delay={0.16}>
              <p className="mt-4 max-w-[32rem] text-[1.0625rem] leading-relaxed text-pretty">
                A sample call showing how TalklyAI takes a new lead from enquiry to a booked site visit.
              </p>
            </Reveal>

            {/* Steps: also the controls for jumping to any step. */}
            <ol className="relative mt-8 space-y-2" aria-label="Demo steps">
              <span aria-hidden="true" className="absolute bottom-7 left-[1.375rem] top-7 w-0.5 -translate-x-1/2 bg-line">
                <motion.span
                  className="block h-full w-full origin-top bg-gradient-to-b from-brand to-accent"
                  initial={false}
                  animate={{ scaleY: progress }}
                  transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
                />
              </span>
              {steps.map((s, index) => {
                const done = started && (index < step || (index === step && finished))
                const active = started && index === step && !finished
                const Icon = s.icon
                return (
                  <li key={s.title}>
                    <button
                      type="button"
                      onClick={() => jumpTo(index)}
                      aria-current={started && index === step ? 'step' : undefined}
                      className={`relative flex w-full items-start gap-4 rounded-2xl px-0 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:pr-3 ${
                        started && index === step ? 'bg-white shadow-card' : 'hover:bg-white/60'
                      }`}
                    >
                      <span
                        className={`relative z-10 ml-0.5 grid h-10 w-10 flex-none place-items-center rounded-full border transition-colors duration-500 ${
                          done
                            ? 'border-transparent bg-gradient-to-br from-brand to-accent text-white'
                            : active
                              ? 'border-brand bg-white text-brand'
                              : 'border-line bg-white text-body'
                        }`}
                      >
                        {done ? <Check size={17} strokeWidth={2.75} aria-hidden="true" /> : <Icon size={18} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 pt-0.5">
                        <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-body">Step {index + 1}</span>
                        <span className={`block text-base font-semibold ${started && index === step ? 'text-ink' : 'text-ink/85'}`}>{s.title}</span>
                        <span className="mt-0.5 block text-sm leading-snug text-body">{s.body}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>

            <div className="mt-7 flex flex-wrap gap-3">
              <button type="button" onClick={replay} className="btn btn-secondary">
                <RotateCcw size={16} className="text-brand" aria-hidden="true" />
                {finished || !started ? 'Replay demo' : 'Restart demo'}
              </button>
              <Link href="/demo" className="btn btn-primary">
                Get a Demo
                <ArrowRight size={17} className="btn-arrow" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* The demo stage: one fixed-height card, so changing steps never moves the page. */}
          <Reveal y={20} amount={0.3}>
            <div className="relative">
              <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(closest-side,rgb(36_99_235/0.12),rgb(121_85_232/0.08)_60%,transparent)]" />
              <div className="overflow-hidden rounded-[22px] border border-line bg-gradient-to-b from-white to-mist shadow-frame">
                <div className="flex items-center justify-between gap-3 border-b border-line bg-white/80 px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex gap-1.5" aria-hidden="true">
                      <i className="h-2.5 w-2.5 rounded-full bg-[#f1b8c2]" />
                      <i className="h-2.5 w-2.5 rounded-full bg-[#f5d9a3]" />
                      <i className="h-2.5 w-2.5 rounded-full bg-[#b9e3cd]" />
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      Step {step + 1} of 4 · {steps[step].title}
                    </span>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-[#fdf2dd] px-2.5 py-1 text-xs font-semibold text-[#8a4d05]">Sample demo</span>
                </div>
                <div className="relative h-[24rem] px-5 py-6 sm:h-[25rem] sm:px-8">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={step}
                      className="absolute inset-0 px-5 py-6 sm:px-8"
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -24 }}
                      transition={{ duration: reduce ? 0 : 0.45, ease: easeSoft }}
                    >
                      {step === 0 && <LeadStep beat={shownBeat} />}
                      {step === 1 && <CallStep beat={shownBeat} running={playing && step === 1} />}
                      {step === 2 && <QualifyStep beat={shownBeat} />}
                      {step === 3 && <DoneStep beat={shownBeat} />}
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div className="h-1 bg-line/60" aria-hidden="true">
                  <motion.div
                    className="h-full origin-left bg-gradient-to-r from-brand to-accent"
                    initial={false}
                    animate={{ scaleX: progress }}
                    transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>
              <p className="sr-only" aria-live="polite">
                {started ? `Step ${step + 1} of 4: ${steps[step].title}.` : ''}
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
