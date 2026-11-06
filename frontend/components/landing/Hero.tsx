'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Play, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { lazy, Suspense, useState } from 'react'
import { introVideo } from '@/lib/landing-content'
import { useIntroRevealed } from '@/lib/intro'
import PhoneMockup from './PhoneMockup'
import { NovalantisEndorsement } from './PoweredByNovalantis'
import { easeSoft } from './Reveal'

const VideoModal = lazy(() => import('./VideoModal'))

const headline = [
  ['Turn', 'Every', 'Lead'],
  ['Into', 'a', 'Conversation'],
]
const wordCount = headline.flat().length

const fadeUp = (delay: number, revealed: boolean) => ({
  initial: { opacity: 0, y: 18 },
  animate: revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 },
  transition: { duration: 0.7, delay, ease: easeSoft },
})

export default function Hero() {
  const revealed = useIntroRevealed()
  const [videoOpen, setVideoOpen] = useState(false)
  const [videoRequested, setVideoRequested] = useState(false)
  let wordIndex = -1

  return (
    <section className="relative -mt-[4.25rem] overflow-hidden pt-[4.25rem]" aria-labelledby="hero-title">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-mist via-white to-white">
        <div className="blob blob-a -right-[12%] -top-[18%] h-[44rem] w-[44rem] bg-[radial-gradient(closest-side,rgb(36_99_235/0.16),transparent)]" />
        <div className="blob blob-b right-[22%] top-[28%] h-[30rem] w-[30rem] bg-[radial-gradient(closest-side,rgb(121_85_232/0.13),transparent)]" />
      </div>

      <div className="wrap grid items-center gap-12 pb-16 pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-8 lg:pb-20 lg:pt-14">
        <div>
          <motion.p
            {...fadeUp(0, revealed)}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[0.8125rem] font-medium text-ink/80"
          >
            <Sparkles size={14} className="text-brand" aria-hidden="true" />
            AI Voice Agent for Businesses
          </motion.p>

          <h1
            id="hero-title"
            aria-label={headline.flat().join(' ')}
            className="mt-5 text-[clamp(2.375rem,4.3vw,3.375rem)] font-semibold leading-[1.12] tracking-[-0.035em]"
          >
            {headline.map((line) => (
              <span key={line.join()} className="lg:block" aria-hidden="true">
                {line.map((word) => {
                  wordIndex += 1
                  return (
                    <span key={word} className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-top">
                      <motion.span
                        className="inline-block"
                        initial={{ y: '112%' }}
                        animate={{ y: revealed ? 0 : '112%' }}
                        transition={{ duration: 0.85, delay: 0.1 + wordIndex * 0.07, ease: easeSoft }}
                      >
                        {word}
                      </motion.span>
                      {' '}
                    </span>
                  )
                })}
              </span>
            ))}
          </h1>

          <motion.p {...fadeUp(0.15 + wordCount * 0.07, revealed)} className="mt-5 max-w-[33rem] text-[1.0625rem] leading-relaxed lg:text-lg">
            An AI voice calling platform that talks to your customers, understands their intent, and takes action — in
            Hindi, Hinglish, or English.
          </motion.p>

          <motion.div {...fadeUp(0.25 + wordCount * 0.07, revealed)} className="mt-8 flex flex-wrap gap-3">
            <Link href="/demo" className="btn btn-primary min-w-[9.5rem]">
              Get a Demo
              <ArrowRight size={17} className="btn-arrow" aria-hidden="true" />
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setVideoRequested(true)
                setVideoOpen(true)
              }}
            >
              <Play size={15} className="text-brand" fill="currentColor" aria-hidden="true" />
              {introVideo.label}
            </button>
          </motion.div>

          <motion.div
            className="mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: revealed ? 1 : 0 }}
            transition={{ duration: 0.9, delay: 0.5 + wordCount * 0.07, ease: 'easeOut' }}
          >
            <NovalantisEndorsement />
          </motion.div>
        </div>

        <PhoneMockup />
      </div>

      {videoRequested && (
        <Suspense fallback={null}>
          <VideoModal open={videoOpen} onClose={() => setVideoOpen(false)} />
        </Suspense>
      )}
    </section>
  )
}
