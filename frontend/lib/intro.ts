'use client'

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'talkly-intro-seen'

// Add ?intro=replay to any URL to see it again.
function decide(): boolean {
  if (typeof window === 'undefined') return false
  if (new URLSearchParams(window.location.search).get('intro') === 'replay') return true
  try {
    return !window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return true // Storage can be blocked. Playing the intro is the safe fallback.
  }
}

// Starts "revealed" so server-rendered markup and the client's first paint
// always agree - TalklyPreloader is the only thing that ever calls
// hideForIntro(), and it does so in the same effect that shows the curtain,
// so content is never hidden with nothing covering it.
let revealed = true
const listeners = new Set<() => void>()

export const introShouldPlay = decide

export function markIntroSeen() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Without storage the intro simply plays again on the next full page load.
  }
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
