'use client'

import { motion } from 'framer-motion'
import { AudioLines, ChartNoAxesColumnIncreasing, Check, MessageCircle, ShieldCheck } from 'lucide-react'
import { useSpotlight } from '@/hooks/useSpotlight'
import { easeSoft } from './Reveal'
import SectionHeading from './SectionHeading'
import Waveform from './Waveform'

function ConversationVisual() {
  return (
    <div className="flex h-full items-center gap-3 rounded-2xl bg-mist px-4">
      <span className="text-xs font-semibold text-muted">Listening</span>
      <div className="h-9 min-w-0 flex-1 overflow-hidden text-brand">
        <Waveform bars={38} barWidth={2.5} gap={3} />
      </div>
    </div>
  )
}

function IntelligenceVisual() {
  const tags = [
    ['Sentiment', 'Positive'],
    ['Intent', 'Site visit'],
    ['Lead', 'Hot'],
  ]
  return (
    <div className="grid h-full grid-cols-3 gap-2 rounded-2xl bg-mist p-2">
      {tags.map(([label, value]) => (
        <div key={label} className="flex flex-col justify-center rounded-xl bg-white px-2.5 sm:px-3">
          <span className="text-[0.6875rem] text-muted">{label}</span>
          <span className="truncate text-[0.8125rem] font-semibold text-ink">{value}</span>
        </div>
      ))}
    </div>
  )
}

function FollowUpVisual() {
  return (
    <div className="flex h-full items-center rounded-2xl bg-[#effaf4] px-4">
      <p className="rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[0.8125rem] leading-snug text-ink shadow-card">
        Your site visit is confirmed for Sunday, 11 am.
      </p>
    </div>
  )
}

function GuardrailVisual() {
  return (
    <ul className="grid h-full content-center gap-1 rounded-2xl bg-[#f3f0fe] px-4 text-[0.8125rem] font-medium text-ink">
      {['Identity checked first', 'Sensitive cases go to a person'].map((item) => (
        <li key={item} className="flex items-center gap-2">
          <Check size={14} strokeWidth={2.5} className="flex-none text-accent" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  )
}

const features = [
  {
    title: 'Real-time AI Conversations',
    body: 'Natural, adaptive conversations that understand what customers say and respond to it.',
    icon: AudioLines,
    Visual: ConversationVisual,
  },
  {
    title: 'Post-call Intelligence',
    body: 'Automatic transcription, sentiment and intent analysis, and lead scoring on every call.',
    icon: ChartNoAxesColumnIncreasing,
    Visual: IntelligenceVisual,
  },
  {
    title: 'Automated Follow-ups',
    body: 'WhatsApp messages, reminders, and next steps go out without anyone chasing them.',
    icon: MessageCircle,
    Visual: FollowUpVisual,
  },
  {
    title: 'Compliance & Guardrails',
    body: 'Identity verification, responsible collections workflows, and human escalation for sensitive cases.',
    icon: ShieldCheck,
    Visual: GuardrailVisual,
  },
]

export default function Features() {
  const onPointerMove = useSpotlight()
  return (
    <section id="features" className="section">
      <div className="wrap">
        <SectionHeading title="Why Businesses Choose TalklyAI">
          Every call becomes a conversation you can read, score, and act on.
        </SectionHeading>
        <ul className="grid gap-5 md:grid-cols-2">
          {features.map((feature, index) => {
            const { Visual, icon: Icon } = feature
            return (
              <motion.li
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.7, delay: index * 0.08, ease: easeSoft }}
              >
                <article onPointerMove={onPointerMove} className="card spotlight lift flex h-full flex-col p-6 lg:p-7">
                  <div className="flex gap-4">
                    <span className="tile-icon">
                      <Icon size={21} aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold tracking-[-0.015em]">{feature.title}</h3>
                      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-pretty">{feature.body}</p>
                    </div>
                  </div>
                  <div className="mt-5 h-[4.75rem]">
                    <Visual />
                  </div>
                </article>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
