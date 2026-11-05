'use client'

import { motion } from 'framer-motion'
import React from 'react'

export const easeSoft = [0.16, 1, 0.3, 1] as const

export default function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
  as = 'div',
  amount = 0.25,
}: {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
  as?: 'div' | 'span' | 'section'
  amount?: number
}) {
  const Component = motion[as] as any
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.7, delay, ease: easeSoft }}
    >
      {children}
    </Component>
  )
}
