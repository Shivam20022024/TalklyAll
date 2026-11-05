'use client'

import { useCallback } from 'react'

// Writes the cursor position to CSS variables, so React never re-renders on move.
export function useSpotlight() {
  return useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return
    const el = event.currentTarget
    const box = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${event.clientX - box.left}px`)
    el.style.setProperty('--my', `${event.clientY - box.top}px`)
  }, [])
}
