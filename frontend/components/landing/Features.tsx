'use client'

import { motion } from 'framer-motion'
import { AudioLines, CalendarCheck, IndianRupee, MessageCircle, Sparkles } from 'lucide-react'
import { easeSoft } from './Reveal'
import SectionHeading from './SectionHeading'

// The four outcomes the hero call demonstrates. Each line describes something the
// product already does (voice calls, booking, collections follow-ups, WhatsApp messages).
const features = [
  {
    title: 'AI Voice Calling',
    body: 'Natural conversations with your customers that qualify leads and follow up, in Hindi, Hinglish or English.',
    icon: AudioLines,
    tile: 'bg-[#e8effe] text-brand',
  },
  {
    title: 'Appointment Booking',
    body: 'Book appointments, consultations and site visits while the customer is still on the call.',
    icon: CalendarCheck,
    tile: 'bg-[#f0ebfd] text-accent',
  },
  {
    title: 'Payment Collections',
    body: 'Payment reminders and collection follow-ups, with the customer’s commitment captured on every call.',
    icon: IndianRupee,
    tile: 'bg-[#fdf2dd] text-[#a35f07]',
  },
  {
    title: 'WhatsApp Follow-ups',
    body: 'Confirmations, reminders and details sent on WhatsApp after the call ends.',
    icon: MessageCircle,
    tile: 'bg-[#e4f6ee] text-[#16855a]',
  },
]

export default function Features() {
  return (
    <section id="features" className="section">
      <div className="wrap">
        <SectionHeading
          title="Why Businesses Choose TalklyAI"
          eyebrow={
            <>
              <Sparkles size={14} aria-hidden="true" />
              Features
            </>
          }
        >
          Every call becomes a conversation you can read, score, and act on.
        </SectionHeading>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.li
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: index * 0.09, ease: easeSoft }}
              >
                <article className="group card flex h-full flex-col p-6 transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-[#cdd8f6] hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:p-7">
                  <span
                    className={`grid h-12 w-12 place-items-center rounded-[14px] transition-transform duration-300 ease-out group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 ${feature.tile}`}
                  >
                    <Icon size={23} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-[-0.015em]">{feature.title}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-pretty">{feature.body}</p>
                </article>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
