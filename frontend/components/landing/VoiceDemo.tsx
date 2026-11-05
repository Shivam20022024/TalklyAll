'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CircleCheck, Info, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { demoConversations } from '@/lib/landing-content'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import Waveform from './Waveform'

const languages = Object.keys(demoConversations) as (keyof typeof demoConversations)[]

const formatTime = (seconds: number) => {
  const whole = Math.floor(seconds)
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

function buildTimeline(conversation: (typeof demoConversations)[keyof typeof demoConversations]) {
  let cursor = 0
  const lines = conversation.lines.map((line) => {
    const entry = { ...line, start: cursor }
    cursor += line.d
    return entry
  })
  return { lines, total: cursor }
}

export default function VoiceDemo() {
  const [language, setLanguage] = useState<keyof typeof demoConversations>('hinglish')
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  const conversation = demoConversations[language]
  const { lines, total } = useMemo(() => buildTimeline(conversation), [conversation])
  const finished = elapsed >= total
  const activeIndex = lines.reduce((latest, line, index) => (line.start <= elapsed ? index : latest), 0)
  const activeSpeaker = lines[activeIndex].speaker
  const visibleLines = lines.slice(0, activeIndex + 1)

  useEffect(() => {
    if (!playing) return undefined
    let last = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      const delta = (now - last) / 1000
      last = now
      setElapsed((value) => {
        const next = value + delta
        if (next >= total) {
          setPlaying(false)
          return total
        }
        return next
      })
    }, 100)
    return () => clearInterval(timer)
  }, [playing, total])

  // Scrolls only the transcript box, never the page.
  useEffect(() => {
    const box = transcriptRef.current
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [activeIndex, finished, language, reduce])

  const chooseLanguage = (next: keyof typeof demoConversations) => {
    setLanguage(next)
    setElapsed(0)
    setPlaying(false)
  }

  const togglePlay = () => {
    if (finished) setElapsed(0)
    setPlaying((value) => !value || finished)
  }

  const speakerLabel = activeSpeaker === 'ai' ? 'TalklyAI speaking' : 'Customer speaking'
  const status = playing ? speakerLabel : finished ? 'Conversation finished' : elapsed > 0 ? 'Paused' : 'Ready to play'

  return (
    <section id="voice-demo" className="section">
      <div className="wrap">
        <SectionHeading title="Experience the Future of AI Calling">
          Pick a language and press play to follow a sample conversation as it unfolds.
        </SectionHeading>

        <Reveal amount={0.15}>
          <div className="card grid grid-cols-[minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="flex min-w-0 flex-col border-b border-line bg-gradient-to-br from-mist to-[#f5f2ff] p-5 sm:p-7 lg:border-b-0 lg:border-r">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">Language</legend>
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-white p-1">
                  {languages.map((key) => (
                    <label
                      key={key}
                      className={`relative cursor-pointer rounded-[9px] px-2 py-2 text-center text-sm font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-brand ${
                        language === key ? 'bg-brand text-white' : 'text-body hover:bg-haze'
                      }`}
                    >
                      <input
                        type="radio"
                        name="demo-language"
                        value={key}
                        checked={language === key}
                        onChange={() => chooseLanguage(key)}
                        className="sr-only"
                      />
                      {demoConversations[key].label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <p className="mt-5 text-sm font-medium text-ink">{conversation.scenario}</p>
              <p className="mt-0.5 text-[0.8125rem] text-muted" role="status">{status}</p>

              <div
                className={`my-4 h-24 overflow-hidden transition-colors duration-300 lg:my-6 lg:h-28 ${
                  !playing ? 'text-[#b6c5e4]' : activeSpeaker === 'ai' ? 'text-brand' : 'text-accent'
                }`}
              >
                <Waveform bars={64} playing={playing} barWidth={3} gap={4} />
              </div>

              <div className="mt-auto flex items-center gap-4">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? 'Pause sample conversation' : finished ? 'Replay sample conversation' : 'Play sample conversation'}
                  className="grid h-[3.25rem] w-[3.25rem] flex-none place-items-center rounded-full bg-brand text-white shadow-[0_10px_22px_-10px_rgb(36_99_235/0.8)] transition-[background-color,transform] duration-200 hover:bg-brand-dark active:scale-95"
                >
                  {playing ? (
                    <Pause size={21} fill="currentColor" aria-hidden="true" />
                  ) : finished ? (
                    <RotateCcw size={20} aria-hidden="true" />
                  ) : (
                    <Play size={21} fill="currentColor" className="translate-x-px" aria-hidden="true" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="h-1 overflow-hidden rounded-full bg-[#d9e2f3]" aria-hidden="true">
                    <div
                      className="h-full origin-left rounded-full bg-gradient-to-r from-brand to-accent"
                      style={{ transform: `scaleX(${Math.min(elapsed / total, 1)})` }}
                    />
                  </div>
                  <p className="mt-2 flex justify-between text-[0.8125rem] tabular-nums text-body">
                    <span>
                      <span className="sr-only">Call duration: </span>
                      {formatTime(elapsed)}
                    </span>
                    <span>{formatTime(total)}</span>
                  </p>
                </div>
              </div>

              <p className="mt-5 flex gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-[0.8125rem] leading-snug">
                <Info size={15} className="mt-px flex-none text-brand" aria-hidden="true" />
                Scripted sample with no audio. No live call is taking place.
              </p>
            </div>

            <div
              ref={transcriptRef}
              data-lenis-prevent
              tabIndex={0}
              role="log"
              aria-label={`Transcript: ${conversation.scenario}`}
              aria-live="polite"
              className="h-[25rem] overflow-y-auto overscroll-contain p-5 sm:h-[27rem] sm:p-7 lg:h-[31rem]"
            >
              <ul className="space-y-3">
                <AnimatePresence initial={false}>
                  {visibleLines.map((line, index) => (
                    <motion.li
                      key={`${language}-${index}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35 }}
                      className={`flex ${line.speaker === 'ai' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        lang={conversation.lang}
                        className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed ${
                          line.speaker === 'ai'
                            ? 'rounded-bl-sm border border-line bg-white text-ink shadow-card'
                            : 'rounded-br-sm bg-[#efeafd] text-ink'
                        }`}
                      >
                        <span lang="en" className="mb-0.5 block text-xs font-semibold text-muted">
                          {line.speaker === 'ai' ? 'TalklyAI' : 'Customer'}
                        </span>
                        {line.text}
                      </div>
                    </motion.li>
                  ))}
                  {elapsed === 0 && !playing && (
                    <li key="prompt" className="pt-4 text-center text-sm text-muted">
                      Press play to follow the rest of the call.
                    </li>
                  )}
                  {finished && (
                    <motion.li key={`${language}-outcome`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                      <div className="mt-2 rounded-2xl border border-[#cfe0fd] bg-mist p-4">
                        <p className="text-sm font-semibold text-ink">After the call</p>
                        <ul className="mt-2 space-y-1.5 text-sm text-ink">
                          {conversation.outcome.map((item) => (
                            <li key={item} className="flex gap-2">
                              <CircleCheck size={16} className="mt-0.5 flex-none text-brand" aria-hidden="true" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.li>
                  )}
                </AnimatePresence>
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
