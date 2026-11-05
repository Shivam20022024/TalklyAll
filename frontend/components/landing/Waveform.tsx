'use client'

import { useInView } from 'framer-motion'
import { memo, useRef } from 'react'

// A fixed pattern keeps the shape stable between renders and looks like speech.
function barHeight(i: number, total: number) {
  const envelope = Math.sin(((i + 0.5) / total) * Math.PI) ** 0.7
  const detail = 0.5 + 0.5 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6))
  return Math.max(0.14, envelope * detail)
}

function Waveform({
  bars = 32,
  playing = true,
  still = false,
  className = '',
  barWidth = 3,
  gap = 3,
}: {
  bars?: number
  playing?: boolean
  still?: boolean
  className?: string
  barWidth?: number
  gap?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '120px' })
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`wave ${className}`}
      data-playing={playing && inView}
      data-still={still}
      style={{ '--wave-bar': `${barWidth}px`, '--wave-gap': `${gap}px` } as React.CSSProperties}
    >
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} style={{ '--h': barHeight(i, bars).toFixed(3), '--d': `${((i * 137) % 900) * -1}ms` } as React.CSSProperties} />
      ))}
    </div>
  )
}

export default memo(Waveform)
