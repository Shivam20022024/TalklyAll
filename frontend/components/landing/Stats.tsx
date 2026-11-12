'use client'

import { useInView, useReducedMotion } from 'framer-motion'
import { Building2, PhoneCall, PhoneForwarded, Workflow } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { stats } from '@/lib/landing-content'
import { useIntroRevealed } from '@/lib/intro'
import Reveal from './Reveal'

const icons: Record<string, any> = { calls: PhoneCall, businesses: Building2, connections: PhoneForwarded, automation: Workflow }
const numberFormat = new Intl.NumberFormat('en-IN')
const COUNT_MS = 1400

const finalText = (stat: (typeof stats)[number]) => (stat.value === null ? stat.mask : `${numberFormat.format(stat.value)}${stat.suffix}`)

// Writes straight to the DOM, so the count runs without re-rendering React.
function StatValue({ stat }: { stat: (typeof stats)[number] }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()
  const revealed = useIntroRevealed()

  useEffect(() => {
    if (!inView || !revealed || reduce || !ref.current) return undefined
    const el = ref.current
    const start = performance.now()
    let frame: number

    const step = (now: number) => {
      const progress = Math.min((now - start) / COUNT_MS, 1)
      if (progress === 1) {
        el.textContent = finalText(stat)
        return
      }
      if (stat.value === null) {
        // No verified figure yet: roll digits, then settle on the zero mask.
        el.textContent = stat.mask.replace(/0/g, () => String(Math.floor(Math.random() * 10)))
      } else {
        const eased = 1 - (1 - progress) ** 3
        el.textContent = `${numberFormat.format(Math.round(stat.value * eased))}${stat.suffix}`
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [inView, revealed, reduce, stat])

  const isPlaceholder = stat.value === null
  return (
    <>
      <span
        ref={ref}
        aria-hidden="true"
        className={`block font-display text-[1.625rem] font-semibold tabular-nums tracking-[-0.02em] lg:text-[1.75rem] ${
          isPlaceholder ? 'text-muted' : 'text-ink'
        }`}
      >
        {finalText(stat)}
      </span>
      <span className="sr-only">{isPlaceholder ? 'Placeholder, verified figure pending' : finalText(stat)}</span>
    </>
  )
}

export default function Stats() {
  const hasPlaceholders = stats.some((stat) => stat.value === null)
  return (
    <section aria-label="Voice AI in numbers" className="wrap relative pb-4">
      <Reveal>
        <dl className="card grid grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => {
            const Icon = icons[stat.id]
            return (
              <div
                key={stat.id}
                className={`flex items-center gap-3 px-4 py-5 sm:gap-4 sm:px-6 lg:py-6 ${index % 2 ? 'border-l border-line' : ''} ${
                  index > 1 ? 'border-t border-line lg:border-t-0' : ''
                } ${index === 2 ? 'lg:border-l' : ''}`}
              >
                <span className="tile-icon max-sm:hidden">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col-reverse">
                  <dt className="mt-0.5 text-sm leading-snug">{stat.label}</dt>
                  <dd>
                    <StatValue stat={stat} />
                  </dd>
                </div>
              </div>
            )
          })}
        </dl>
        {hasPlaceholders && (
          <p className="mt-3 text-center text-[0.8125rem] text-muted">
            Placeholder figures, shown until verified numbers are added.
          </p>
        )}
      </Reveal>
    </section>
  )
}
