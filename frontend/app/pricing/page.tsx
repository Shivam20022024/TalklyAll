'use client'

import Link from 'next/link'
import {
  Check,
  Zap,
  Shield,
  Sparkles,
  ArrowRight,
  Headphones,
  Globe2,
  Building
} from 'lucide-react'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Top Navbar */}
      <header className="border-b border-border/40 backdrop-blur-md sticky top-0 z-50 bg-background/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black">
              T
            </div>
            Talkly<span className="text-primary font-normal">AI</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
            <Sparkles size={13} /> Transparent, Usage-Based AI Voice Calling
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Predictable Pricing for <br /><span className="text-primary">Every Business Size</span>
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            No hidden setup fees. Start with 10 free trial minutes and scale on pure usage or bundled growth tiers.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="mt-14 grid gap-8 md:grid-cols-3 md:items-start">
          {/* Free Starter */}
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm flex flex-col justify-between transition-all hover:border-foreground/20 hover:shadow-md">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Sparkles size={18} />
              </div>
              <div className="mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Free Trial</div>
              <h3 className="mt-1.5 text-2xl font-bold tracking-tight">Starter Sandbox</h3>
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                Experience TalklyAI live with full access to prompt engineering and test calls.
              </p>
              <div className="mt-7 flex items-baseline gap-1.5 border-t border-border pt-6">
                <span className="text-4xl font-extrabold tabular-nums">₹0</span>
                <span className="text-xs font-medium text-muted-foreground">/ free trial</span>
              </div>
              <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> 10 Free AI Voice Minutes</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> All 5 Industry Templates</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> Real-time Speech Analysis</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> CSV & Excel Lead Upload</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> Webhook & Zapier Outbound Sync</li>
              </ul>
            </div>
            <Link
              href="/register"
              className="group mt-8 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2.5 text-center text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Start Free in 60s
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Pay As You Go */}
          <div className="relative rounded-2xl border-2 border-primary bg-card p-8 pt-9 shadow-xl shadow-primary/10 flex flex-col justify-between md:-translate-y-3">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
              Most Flexible
            </div>
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Zap size={18} />
              </div>
              <div className="mt-5 text-xs font-bold uppercase tracking-wider text-primary">Pay-As-You-Go</div>
              <h3 className="mt-1.5 text-2xl font-bold tracking-tight">Wallet Usage</h3>
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                Top up any amount via UPI, cards, or netbanking. Unused credits never expire.
              </p>
              <div className="mt-7 border-t border-border pt-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tabular-nums">₹12</span>
                  <span className="text-xs font-medium text-muted-foreground">/ connected min (outbound)</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">₹11/min for inbound calls</div>
              </div>
              <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> Zero monthly platform fee</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> Instant UPI / card wallet top-up</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> English + 12 Indian Languages</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> GPT-4o Transcript Analytics</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> Automated Follow-up Email drafting</li>
              </ul>
            </div>
            <Link
              href="/register"
              className="group mt-8 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-center text-xs font-semibold text-primary-foreground shadow-md transition-opacity hover:opacity-90"
            >
              Create Free Account & Top Up
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Growth Bundle */}
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm flex flex-col justify-between transition-all hover:border-foreground/20 hover:shadow-md">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Building size={18} />
              </div>
              <div className="mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Pro Growth</div>
              <h3 className="mt-1.5 text-2xl font-bold tracking-tight">High Volume Tier</h3>
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                For sales agencies, hospitals, real estate firms, and edtech academies.
              </p>
              <div className="mt-7 flex items-baseline gap-1.5 border-t border-border pt-6">
                <span className="text-4xl font-extrabold tabular-nums">₹4,999</span>
                <span className="text-xs font-medium text-muted-foreground">/ month</span>
              </div>
              <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> 500 Call Minutes Included (₹10/min overage)</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> Dedicated Inbound Phone Number</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> Custom AI Voice Cloning & Accents</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> Live Human Call Escalation & Transfer</li>
                <li className="flex items-center gap-2.5"><Check size={14} className="shrink-0 text-primary" /> Priority SLA & WhatsApp Technical Support</li>
              </ul>
            </div>
            <Link
              href="/register"
              className="group mt-8 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2.5 text-center text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Get Started with Growth
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* Feature comparison table */}
        <section className="mt-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight">Included in All Plans</h2>
            <p className="mt-1 text-sm text-muted-foreground">Enterprise-grade capabilities available to every customer.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Globe2 size={20} />
              </div>
              <h4 className="mt-4 text-sm font-semibold">13 Regional Languages</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Natural voice conversations in Hindi, English, Tamil, Telugu, and more.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <Zap size={20} />
              </div>
              <h4 className="mt-4 text-sm font-semibold">Real-time Webhook Sync</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Dispatches call summaries, scores, and transcripts straight to Zapier and CRMs.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <Headphones size={20} />
              </div>
              <h4 className="mt-4 text-sm font-semibold">Multi-Use-Case Presets</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Turnkey scripts for Healthcare, EdTech, Real Estate, and Financial Services.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                <Shield size={20} />
              </div>
              <h4 className="mt-4 text-sm font-semibold">B2B Tenant Isolation</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Strict company isolation, encrypted JWT authentication, and secure document storage.</p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <div className="p-5 rounded-xl border border-border bg-card">
              <h4 className="font-semibold text-sm">Do I need a credit card to sign up?</h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">No. When you sign up, your workspace is automatically credited with 10 free minutes so you can immediately test AI calls to your own phone.</p>
            </div>
            <div className="p-5 rounded-xl border border-border bg-card">
              <h4 className="font-semibold text-sm">What happens when my free minutes run out?</h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">You can top up your wallet anytime starting from ₹250 via UPI, NetBanking, or Credit Card through our secure Razorpay payment integration.</p>
            </div>
            <div className="p-5 rounded-xl border border-border bg-card">
              <h4 className="font-semibold text-sm">Can I use TalklyAI for multiple industries?</h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">Yes! You can configure separate campaigns for clinic appointments, course admissions, home loan verification, or property site visits with specialized qualification criteria.</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} TalklyAI by Novalantis. All rights reserved.
      </footer>
    </div>
  )
}
