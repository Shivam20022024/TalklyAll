'use client'

import { motion } from 'framer-motion'
import { Building2, Handshake, HeartPulse, GraduationCap, Landmark, ReceiptIndianRupee } from 'lucide-react'
import { easeSoft } from './Reveal'
import SectionHeading from './SectionHeading'

const industries = [
  { name: 'Real Estate', body: 'Qualify buyers and schedule site visits.', icon: Building2, color: '#2463EB', tint: '#e8effe' },
  { name: 'Healthcare', body: 'Confirm appointments and follow up with patients.', icon: HeartPulse, color: '#C93A5B', tint: '#fcebef' },
  { name: 'EdTech', body: 'Counsel students and drive enrollments.', icon: GraduationCap, color: '#7955E8', tint: '#f0ebfd' },
  { name: 'BFSI / Lending', body: 'Qualify loan inquiries.', icon: Landmark, color: '#0F7F78', tint: '#e2f5f3' },
  { name: 'Collections', body: 'EMI reminders, payment commitments and repayment tracking.', icon: ReceiptIndianRupee, color: '#B4610B', tint: '#fcf1e0' },
  { name: 'B2B Sales', body: 'Outbound calls and lead nurturing.', icon: Handshake, color: '#3C57C4', tint: '#e9ecfb' },
]

export default function Industries() {
  return (
    <section id="industries" className="section bg-mist">
      <div className="wrap">
        <SectionHeading title="AI Voice Calling Built for Every Industry" />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {industries.map((industry, index) => {
            const Icon = industry.icon
            return (
              <motion.li
                key={industry.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.65, delay: index * 0.07, ease: easeSoft }}
              >
                <article
                  className="card lift group relative flex h-full gap-4 overflow-hidden p-5 lg:p-6"
                  style={{ '--accent-color': industry.color } as React.CSSProperties}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-(--accent-color) transition-transform duration-500 ease-out-soft group-hover:scale-x-100"
                  />
                  <span
                    className="grid h-12 w-12 flex-none place-items-center rounded-[14px] transition-transform duration-500 ease-out-soft group-hover:-translate-y-0.5 group-hover:scale-110 group-hover:-rotate-6"
                    style={{ backgroundColor: industry.tint, color: industry.color }}
                  >
                    <Icon size={23} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-[1.0625rem] font-semibold tracking-[-0.015em]">{industry.name}</h3>
                    <p className="mt-1 text-[0.9375rem] leading-relaxed text-pretty">{industry.body}</p>
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
