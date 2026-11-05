'use client'

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { loginUrl, navLinks } from '@/lib/landing-content'
import { getLenis } from '@/lib/lenis'
import Logo from './Logo'
import SmartLink from './SmartLink'

export default function Navbar() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setOpen(false), [pathname, searchParams])

  useEffect(() => {
    if (!open) return undefined
    const lenis = getLenis()
    lenis?.stop()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      lenis?.start()
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <header
      className={`nav-glass sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300 ${
        open
          ? 'border-line bg-white' // No backdrop blur here: it would trap the fixed menu inside the header.
          : scrolled
            ? 'border-line bg-white/90 shadow-[0_8px_24px_-18px_rgb(30_58_138/0.35)] backdrop-blur-md'
            : 'border-transparent bg-white/0'
      }`}
    >
      <nav aria-label="Main" className="wrap flex h-[4.25rem] items-center justify-between gap-4">
        <Logo />

        <ul className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <li key={link.label}>
              <SmartLink
                to={link.to}
                className="rounded-lg px-3.5 py-2 text-[0.9375rem] font-medium text-ink/80 transition-colors hover:bg-haze hover:text-ink"
              >
                {link.label}
              </SmartLink>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <SmartLink to={loginUrl} className="btn btn-secondary btn-sm hidden! lg:inline-flex!">
            Login
          </SmartLink>
          <Link href="/demo" className="btn btn-primary btn-sm">
            Get a Demo
          </Link>
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid h-10 w-10 place-items-center rounded-[10px] border border-[#d3dceb] bg-white text-ink lg:hidden"
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 bottom-0 top-[4.25rem] overflow-y-auto overscroll-contain border-t border-line bg-white lg:hidden"
            data-lenis-prevent
          >
            <ul className="wrap flex flex-col gap-1 py-4">
              {navLinks.map((link) => (
                <li key={link.label}>
                  <SmartLink
                    to={link.to}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-3.5 text-lg font-medium text-ink hover:bg-haze"
                  >
                    {link.label}
                  </SmartLink>
                </li>
              ))}
              <li className="mt-4 grid gap-3 border-t border-line pt-6">
                <SmartLink to={loginUrl} onClick={() => setOpen(false)} className="btn btn-secondary">
                  Login
                </SmartLink>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
