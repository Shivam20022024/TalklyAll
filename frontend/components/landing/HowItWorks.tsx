'use client'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useLayoutEffect, useRef } from 'react'
import { howItWorks } from '@/lib/landing-content'
import SectionHeading from './SectionHeading'

gsap.registerPlugin(ScrollTrigger)

// The connecting line follows scroll position and lights each step as it arrives.
export default function HowItWorks() {
  const root = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const mm = gsap.matchMedia(root)

    mm.add(
      {
        desktop: '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
        mobile: '(max-width: 1023px) and (prefers-reduced-motion: no-preference)',
      },
      (context: any) => {
        const { desktop } = context.conditions
        const steps = gsap.utils.toArray('[data-step]')
        const timeline = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: '[data-steps]',
            start: desktop ? 'top 78%' : 'top 70%',
            end: desktop ? 'bottom 62%' : 'bottom 65%',
            scrub: 0.5,
          },
        })

        timeline.fromTo(
          desktop ? '[data-line-x]' : '[data-line-y]',
          desktop ? { scaleX: 0 } : { scaleY: 0 },
          { ...(desktop ? { scaleX: 1 } : { scaleY: 1 }), duration: steps.length - 1 },
          0,
        )
        steps.forEach((step: any, index: number) => {
          timeline.fromTo(step.querySelector('[data-dot]'), { opacity: 0 }, { opacity: 1, duration: 0.25 }, index)
          if (desktop) {
            timeline.fromTo(
              step.querySelector('[data-copy]'),
              { opacity: 0.28, y: 14 },
              { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' },
              Math.max(index - 0.2, 0),
            )
          }
        })
      },
    )

    return () => mm.revert()
  }, [])

  return (
    <section id="how-it-works" ref={root} className="section bg-mist">
      <div className="wrap">
        <SectionHeading title="How It Works">From a lead list to a clear next step, in four stages.</SectionHeading>

        <div data-steps className="relative">
          <div aria-hidden="true" className="absolute inset-x-[12.5%] top-[1.625rem] hidden h-0.5 bg-line lg:block">
            <div data-line-x className="h-full origin-left bg-gradient-to-r from-brand to-accent" />
          </div>
          <div aria-hidden="true" className="absolute bottom-16 left-[1.625rem] top-2 w-0.5 -translate-x-1/2 bg-line lg:hidden">
            <div data-line-y className="h-full w-full origin-top bg-gradient-to-b from-brand to-accent" />
          </div>

          <ol className="relative grid gap-9 lg:grid-cols-4 lg:gap-6">
          {howItWorks.map((step, index) => (
            <li key={step.title} data-step className="relative flex gap-5 lg:block lg:text-center">
              <span className="relative block h-[3.25rem] w-[3.25rem] flex-none lg:mx-auto">
                <span className="absolute inset-0 grid place-items-center rounded-full border border-line bg-white font-display text-sm font-semibold text-ink">
                  0{index + 1}
                </span>
                <span
                  data-dot
                  aria-hidden="true"
                  className="absolute inset-0 grid place-items-center rounded-full bg-gradient-to-br from-brand to-accent font-display text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgb(36_99_235/0.8)]"
                >
                  0{index + 1}
                </span>
              </span>
              <div data-copy className="min-w-0 pt-1 lg:mt-5 lg:pt-0">
                <h3 className="text-lg font-semibold tracking-[-0.015em]">{step.title}</h3>
                <p className="mx-auto mt-1.5 max-w-[17rem] text-[0.9375rem] leading-relaxed max-lg:mx-0 max-lg:max-w-none text-pretty">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
