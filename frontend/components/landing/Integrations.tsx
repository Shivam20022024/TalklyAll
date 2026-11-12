'use client'

import { motion } from 'framer-motion'
import { CircleCheck, Contact, FileSpreadsheet, MessageCircle, PhoneCall, Webhook } from 'lucide-react'
import { integrations } from '@/lib/landing-content'
import { easeSoft } from './Reveal'
import SectionHeading from './SectionHeading'

const icons: Record<string, any> = { whatsapp: MessageCircle, crm: Contact, telephony: PhoneCall, leads: FileSpreadsheet, api: Webhook }

function SupportedTile({ item }: { item: (typeof integrations)[number] }) {
  const Icon = icons[item.id]
  return (
    <div className="flex h-full flex-col rounded-[20px] border border-[#bfe6d2] bg-[#f1fbf6] p-6 shadow-card lg:p-7">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-white text-[#16855a]">
          <Icon size={24} aria-hidden="true" />
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#147a52]">
          <CircleCheck size={14} aria-hidden="true" />
          Supported
        </span>
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-[-0.015em]">{item.name}</h3>
      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-pretty">{item.body}</p>
      <div className="mt-auto pt-5">
        <p className="w-fit rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[0.8125rem] leading-snug text-ink shadow-card">
          Your site visit is confirmed for Sunday, 11 am.
        </p>
      </div>
    </div>
  )
}

function PlaceholderTile({ item }: { item: (typeof integrations)[number] }) {
  const Icon = icons[item.id]
  return (
    <div className="flex h-full flex-col rounded-[20px] border border-dashed border-[#c1cde2] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-haze text-muted">
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="rounded-full bg-haze px-2.5 py-1 text-xs font-semibold text-body">Placeholder</span>
      </div>
      <h3 className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.015em]">{item.name}</h3>
      <p className="mt-1 text-sm leading-relaxed text-pretty">{item.body}</p>
    </div>
  )
}

export default function Integrations() {
  const supported = integrations.filter((item) => item.status === 'supported')
  const placeholders = integrations.filter((item) => item.status !== 'supported')

  return (
    <section id="integrations" className="section scroll-mt-12 pt-0! lg:pt-0!">
      <div className="wrap">
        <SectionHeading title="Connect Voice AI to Your Stack">
          WhatsApp is ready today. Other connections are listed as placeholders until a provider is confirmed.
        </SectionHeading>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="grid gap-4">
            {supported.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.65, ease: easeSoft }}
              >
                <SupportedTile item={item} />
              </motion.div>
            ))}
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {placeholders.map((item, index) => (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.65, delay: 0.06 * (index + 1), ease: easeSoft }}
              >
                <PlaceholderTile item={item} />
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
