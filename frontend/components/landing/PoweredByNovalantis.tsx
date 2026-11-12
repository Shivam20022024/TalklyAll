'use client'

import { motion, useInView, type Variants } from 'framer-motion'
import { AudioLines } from 'lucide-react'
import { useRef } from 'react'
import { company } from '@/lib/landing-content'
import { easeSoft } from './Reveal'

const sequence: Variants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.05, staggerChildren: 0.28 } },
}
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: easeSoft } },
}
const logoIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.9, ease: easeSoft } },
}
const lift: Variants = {
  rest: { y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  active: { y: -2, transition: { duration: 0.4, ease: 'easeOut' } },
}
const glow: Variants = {
  rest: { opacity: 0.14, transition: { duration: 0.5, ease: 'easeOut' } },
  active: { opacity: 0.26, transition: { duration: 0.5, ease: 'easeOut' } },
}

// Parent-company signature at the very bottom of the footer.
// The background drift and sweep run in CSS and only while the strip is on screen.
export default function PoweredByNovalantis() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '80px' })

  return (
    <motion.div
      ref={ref}
      className="powered-strip"
      data-active={inView}
      variants={sequence}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.35 }}
    >
      <div aria-hidden="true" className="powered-strip-bg powered-strip-bg-a" />
      <div aria-hidden="true" className="powered-strip-bg powered-strip-bg-b" />

      <div className="wrap powered-strip-inner">
        <motion.p className="powered-strip-label" variants={fadeUp}>Powered by</motion.p>

        {/* The reveal lives on this wrapper */}
        <motion.div variants={logoIn}>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-ink font-display">Voice AI</span>
          </div>
        </motion.div>

        <motion.p className="powered-strip-tagline" variants={fadeUp}>
          Autonomous conversational intelligence for enterprise operations.
        </motion.p>
      </div>
    </motion.div>
  )
}

// Compact one-line version for places where the product should stay the focus.
export function NovalantisEndorsement() {
  return (
    <div
      aria-label="Enterprise Voice AI Platform"
      className="novalantis-endorsement"
    >
      <AudioLines size={15} className="flex-none text-brand" aria-hidden="true" />
      <span>Enterprise</span>
      <strong translate="no">Voice AI Platform</strong>
    </div>
  )
}
