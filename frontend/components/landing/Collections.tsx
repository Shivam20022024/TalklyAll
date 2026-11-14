'use client'

import { motion } from 'framer-motion'
import { BellRing, ChartNoAxesCombined, Handshake, HeartHandshake, Scale, UserCheck } from 'lucide-react'
import Reveal, { easeSoft } from './Reveal'

const capabilities = [
  { title: 'Identity verification', body: 'Confirms the right person is on the call before sharing account details.', icon: UserCheck },
  { title: 'Overdue payment reminders', body: 'Clear, calm reminders of what is due and when.', icon: BellRing },
  { title: 'Promise-to-pay capture', body: 'Records the amount and date a customer commits to.', icon: Handshake },
  { title: 'Repayment reconciliation', body: 'Matches payments received against promises made.', icon: Scale },
  { title: 'Hardship escalation', body: 'Hands the case to a human agent when a customer reports difficulty.', icon: HeartHandshake, highlight: true },
  { title: 'Recovery analytics', body: 'Tracks promises, payments, and escalations by campaign.', icon: ChartNoAxesCombined },
]

export default function Collections() {
  return (
    <section id="collections" className="section bg-gradient-to-b from-mist to-white">
      <div className="wrap grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-sm font-semibold text-brand-dark">Collections</p>
          <h2 className="h-section mt-3">Recover Payments With Respect for Every Customer</h2>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-pretty">
            TalklyAI supports responsible, compliance-aware conversations without pressure tactics. Customers hear clear
            information and get a route to a person when they need one.
          </p>
        </Reveal>

        <ul className="grid gap-4 sm:grid-cols-2">
          {capabilities.map((item, index) => {
            const Icon = item.icon
            return (
              <motion.li
                key={item.title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.65, delay: (index % 2) * 0.08, ease: easeSoft }}
                className={`rounded-[20px] border p-5 ${
                  item.highlight ? 'border-[#d9cffa] bg-[#f6f3ff]' : 'border-line bg-white shadow-card'
                }`}
              >
                <span className={`tile-icon ${item.highlight ? 'bg-none! bg-white! text-accent!' : ''}`}>
                  <Icon size={21} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-[1.0625rem] font-semibold tracking-[-0.015em]">{item.title}</h3>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-pretty">{item.body}</p>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
