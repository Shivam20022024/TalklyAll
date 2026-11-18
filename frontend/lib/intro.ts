'use client'

import { useSyncExternalStore } from 'react'

// The intro plays once per full page load: on a direct visit and on every browser
// refresh, but not again when the visitor moves between pages client-side (this
// module, and so this flag, survives client-side navigation; a reload resets it).
let playedThisLoad = false

function decide(): boolean {
  if (typeof window === 'undefined') return false
  return !playedThisLoad
}

// Starts "revealed" so server-rendered markup and the client's first paint
// always agree - TalklyPreloader is the only thing that ever calls
// hideForIntro(), and it does so in the same effect that shows the curtain,
// so content is never hidden with nothing covering it.
let revealed = true
const listeners = new Set<() => void>()

export const introShouldPlay = decide

export function markIntroSeen() {
  playedThisLoad = true
}

export function hideForIntro() {
  if (!revealed) return
  revealed = false
  listeners.forEach((listener) => listener())
}

export function revealPage() {
  if (revealed) return
  revealed = true
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// False while the intro covers the page. Entrance animations wait for this.
// getServerSnapshot always reports "revealed" so hydration never mismatches.
export const useIntroRevealed = () => useSyncExternalStore(subscribe, () => revealed, () => true)
