'use client'

import { Suspense, type ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import '@fontsource-variable/sora'
import '@fontsource-variable/inter'
import '@fontsource/noto-sans-devanagari/devanagari-400.css'
import '@fontsource/noto-sans-devanagari/devanagari-500.css'
import 'lenis/dist/lenis.css'
import Footer from '@/components/landing/Footer'
import Navbar from '@/components/landing/Navbar'
import ScrollManager from '@/components/landing/ScrollManager'
import { useSmoothScroll } from '@/hooks/useSmoothScroll'

export default function MarketingLayout({ children }: { children: ReactNode }) {
  useSmoothScroll()
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing-scope">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-ink focus:shadow-lg"
        >
          Skip to content
        </a>
        <Suspense fallback={null}>
          <ScrollManager />
          <Navbar />
        </Suspense>
        <main id="main">{children}</main>
        <Footer />
      </div>
    </MotionConfig>
  )
}
