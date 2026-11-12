'use client'

import Link from 'next/link'
import { useId } from 'react'

const bars = [
  { x: 0, y: 8.5, h: 7 },
  { x: 5, y: 4.5, h: 15 },
  { x: 10, y: 1, h: 22 },
  { x: 15, y: 5.5, h: 13 },
  { x: 20, y: 9, h: 6 },
]

export function LogoMark({ className = 'h-6 w-6' }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 23 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop stopColor="#2463EB" />
          <stop offset="1" stopColor="#7955E8" />
        </linearGradient>
      </defs>
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={bar.y} width="3" height={bar.h} rx="1.5" fill={`url(#${id})`} />
      ))}
    </svg>
  )
}

export default function Logo() {
  return (
    <Link href="/" aria-label="Voice AI home" className="inline-flex items-center gap-2 rounded-md">
      <LogoMark />
      <span translate="no" className="font-display text-[1.1875rem] font-semibold tracking-[-0.03em] text-ink">
        Voice AI
      </span>
    </Link>
  )
}
