'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

const LEGAL_LINKS = [
  { name: 'Pricing', href: '/pricing' },
  { name: 'Terms', href: '/terms' },
  { name: 'Privacy', href: '/privacy' },
  { name: 'Refund Policy', href: '/refund-policy' },
  { name: 'Contact', href: '/contact' },
]

export default function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string
  lastUpdated: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 backdrop-blur-md sticky top-0 z-50 bg-background/80">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black">
              T
            </div>
            Talkly<span className="text-primary font-normal">AI</span>
          </Link>
          <Link href="/login" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
            Sign In
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
        <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground [&_h2]:text-lg [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:mb-3 [&_p]:text-muted-foreground [&_p]:mb-3 [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:mb-3 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </div>
      </main>

      <footer className="border-t border-border/40 py-8 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground transition-colors">
              {link.name}
            </Link>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          © {new Date().getFullYear()} TalklyAI · A product by <span className="font-semibold">Novalantis</span>
        </p>
      </footer>
    </div>
  )
}
