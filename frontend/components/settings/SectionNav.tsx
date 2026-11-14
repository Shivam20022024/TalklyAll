'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface SectionLink {
  id: string
  label: string
  description?: string
  icon?: ReactNode
}

/**
 * Secondary navigation for the settings groups. Each item is a plain in-page anchor
 * (so it works without JavaScript and keeps the existing section ids); the highlight
 * follows the section currently in view. A horizontal strip below xl, a sticky card on xl.
 */
export function SectionNav({ links }: { links: SectionLink[] }) {
  const [active, setActive] = useState(links[0]?.id ?? '')
  // After a click the page scrolls (smoothly) past other sections; keep the clicked item highlighted meanwhile.
  const lockedUntil = useRef(0)

  useEffect(() => {
    const targets = links.map((l) => document.getElementById(l.id)).filter(Boolean) as HTMLElement[]
    if (targets.length === 0 || typeof IntersectionObserver === 'undefined') return
    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
          else visible.delete(e.target.id)
        })
        if (Date.now() < lockedUntil.current) return
        if (visible.size > 0) {
          const first = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0]
          setActive(first)
        }
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 }
    )
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [links])

  return (
    <nav aria-label="Settings sections" className="min-w-0 xl:sticky xl:top-20 xl:self-start">
      <ul className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:gap-1 xl:overflow-visible xl:rounded-2xl xl:border xl:border-ds-line xl:bg-ds-bg xl:p-2 xl:pb-2 xl:shadow-sm">
        {links.map((link) => {
          const isActive = active === link.id
          return (
            <li key={link.id} className="shrink-0 xl:shrink">
              <a
                href={`#${link.id}`}
                onClick={() => {
                  lockedUntil.current = Date.now() + 1200
                  setActive(link.id)
                }}
                aria-current={isActive ? 'true' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-primary max-xl:border max-xl:h-11 max-xl:whitespace-nowrap xl:py-3 ${
                  isActive ? 'bg-blue-50 text-ds-primary max-xl:border-ds-primary/40' : 'text-ds-ink hover:bg-ds-surface max-xl:border-ds-line max-xl:bg-ds-bg'
                }`}
              >
                {link.icon && <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${isActive ? 'text-ds-primary' : 'text-ds-ink-2'}`} aria-hidden="true">{link.icon}</span>}
                <span className="min-w-0">
                  <span className={`block text-[15px] font-semibold leading-tight ${isActive ? 'text-ds-primary' : 'text-ds-ink'}`}>{link.label}</span>
                  {link.description && <span className="mt-0.5 hidden text-[14px] leading-snug text-ds-ink-2 xl:block">{link.description}</span>}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
