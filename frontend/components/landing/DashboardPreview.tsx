'use client'

import { motion, useInView, useMotionValue, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import {
  BarChart3,
  CircleCheck,
  Clock3,
  Headset,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  PhoneCall,
  ReceiptIndianRupee,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { dashboardSample as data } from '@/lib/landing-content'
import { LogoMark } from './Logo'
import { easeSoft } from './Reveal'
import SectionHeading from './SectionHeading'

const CampaignChart = lazy(() => import('./dashboard/Charts').then((m) => ({ default: m.CampaignChart })))
const SentimentChart = lazy(() => import('./dashboard/Charts').then((m) => ({ default: m.SentimentChart })))

const numberFormat = new Intl.NumberFormat('en-IN')
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const sidebar = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Campaigns', icon: Megaphone },
  { label: 'Leads', icon: UsersRound },
  { label: 'Calls', icon: PhoneCall },
  { label: 'Analytics', icon: BarChart3 },
  { label: 'Collections', icon: ReceiptIndianRupee },
]

const kpis = [
  { label: 'Total calls', value: numberFormat.format(data.totalCalls), icon: PhoneCall },
  { label: 'Connected calls', value: numberFormat.format(data.connectedCalls), icon: Headset },
  { label: 'Qualified leads', value: numberFormat.format(data.qualifiedLeads), icon: Sparkles },
  { label: 'Promised to pay', value: rupees.format(data.promisedToPay), icon: ListChecks },
]

const promiseStatus: Record<string, { label: string; icon: any; className: string }> = {
  paid: { label: 'Paid', icon: CircleCheck, className: 'text-[#147a52]' },
  scheduled: { label: 'Scheduled', icon: Clock3, className: 'text-brand-dark' },
  escalated: { label: 'With agent', icon: Headset, className: 'text-[#6a46d6]' },
}

function Panel({ title, children, className = '', action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-white p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="font-sans text-sm font-semibold tracking-normal text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function ChartFallback() {
  return <div className="skeleton h-full w-full" />
}

function LeadScores() {
  const total = data.leadScores.reduce((sum, tier) => sum + tier.value, 0)
  return (
    <>
      <div className="flex h-2.5 gap-0.5" aria-hidden="true">
        {data.leadScores.map((tier) => (
          <span
            key={tier.name}
            className="rounded-[3px]"
            style={{ width: `${(tier.value / total) * 100}%`, background: tier.color }}
          />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {data.leadScores.map((tier) => (
          <div key={tier.name}>
            <dt className="flex items-center gap-1.5 text-xs text-body">
              <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ background: tier.color }} />
              {tier.name}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{numberFormat.format(tier.value)}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function Dashboard({ chartsReady }: { chartsReady: boolean }) {
  return (
    <div className="grid lg:grid-cols-[12.5rem_minmax(0,1fr)]">
      <aside aria-hidden="true" className="hidden border-r border-line bg-[#fbfcff] p-4 lg:block">
        <div className="mb-5 flex items-center gap-2 px-2">
          <LogoMark className="h-5 w-5" />
          <span translate="no" className="font-display text-[0.9375rem] font-semibold text-ink">Voice AI</span>
        </div>
        <ul className="space-y-1 text-[0.8125rem] font-medium">
          {sidebar.map(({ label, icon: Icon, active }) => (
            <li
              key={label}
              className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 ${active ? 'bg-haze text-brand-dark' : 'text-body'}`}
            >
              <Icon size={16} />
              {label}
            </li>
          ))}
        </ul>
      </aside>

      <div className="min-w-0 bg-mist p-3 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-display text-base font-semibold text-ink">Campaign overview</p>
            <p className="text-[0.8125rem] text-muted">{data.campaign}, last 7 days</p>
          </div>
          <p className="rounded-full border border-[#d9cffa] bg-[#f3f0fe] px-2.5 py-1 text-xs font-semibold text-[#5a3cc0]">
            Sample data
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white p-3.5">
              <span className="tile-icon h-9! w-9! rounded-[10px]! max-sm:hidden">
                <Icon size={17} aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col-reverse">
                <dt className="truncate text-xs text-muted">{label}</dt>
                <dd className="font-display text-lg font-semibold tabular-nums text-ink">{value}</dd>
              </div>
            </div>
          ))}
        </dl>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          <Panel
            title="Campaign performance"
            action={
              <ul className="flex gap-3 text-xs text-body">
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0.5 w-3.5 rounded bg-[#94A3B8]" />
                  Calls placed
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0.5 w-3.5 rounded bg-brand" />
                  Connected
                </li>
              </ul>
            }
          >
            <div className="h-52 min-w-0 xl:h-[15.5rem]" role="img" aria-label={`Line chart of calls placed and connected over 7 days. Sample data: ${numberFormat.format(data.totalCalls)} placed, ${numberFormat.format(data.connectedCalls)} connected.`}>
              {chartsReady ? (
                <Suspense fallback={<ChartFallback />}>
                  <CampaignChart />
                </Suspense>
              ) : (
                <ChartFallback />
              )}
            </div>
          </Panel>

          <Panel title="Sentiment analysis">
            <div className="flex items-center gap-5">
              <div className="relative h-32 w-32 flex-none" role="img" aria-label="Donut chart of call sentiment. Sample data: 58% positive, 27% neutral, 15% negative.">
                {chartsReady ? (
                  <Suspense fallback={<ChartFallback />}>
                    <SentimentChart />
                  </Suspense>
                ) : (
                  <ChartFallback />
                )}
              </div>
              <dl className="min-w-0 flex-1 space-y-2.5">
                {data.sentiment.map((slice) => (
                  <div key={slice.name} className="flex items-center justify-between gap-2 text-[0.8125rem]">
                    <dt className="flex items-center gap-2 text-body">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: slice.color }} />
                      {slice.name}
                    </dt>
                    <dd className="font-semibold tabular-nums text-ink">{slice.value}%</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="mb-3 font-sans text-sm font-semibold tracking-normal text-ink">Lead scoring</h3>
              <LeadScores />
            </div>
          </Panel>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          <Panel title="Recent call activity">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] text-left text-[0.8125rem]">
                <thead>
                  <tr className="text-xs text-muted">
                    <th scope="col" className="pb-2 font-medium">Customer</th>
                    <th scope="col" className="pb-2 font-medium max-sm:hidden">Language</th>
                    <th scope="col" className="pb-2 font-medium">Outcome</th>
                    <th scope="col" className="pb-2 text-right font-medium">Lead score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentCalls.map((call) => (
                    <tr key={call.name} className="border-t border-line">
                      <td className="py-2.5 pr-2 font-medium text-ink">{call.name}</td>
                      <td className="py-2.5 pr-2 max-sm:hidden">{call.language}</td>
                      <td className="py-2.5 pr-2">{call.outcome}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-ink">{call.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Promise-to-pay tracking">
            <ul className="space-y-3">
              {data.promises.map((promise) => {
                const status = promiseStatus[promise.status]
                const StatusIcon = status.icon
                return (
                  <li key={promise.name} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{promise.name}</p>
                      <p className="text-xs tabular-nums text-muted">
                        {rupees.format(promise.amount)}, {promise.due}
                      </p>
                    </div>
                    <span className={`flex flex-none items-center gap-1.5 text-xs font-semibold ${status.className}`}>
                      <StatusIcon size={14} aria-hidden="true" />
                      {status.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPreview() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const near = useInView(ref, { once: true, margin: '300px' })
  const [canParallax, setCanParallax] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px) and (pointer: fine)')
    const update = () => setCanParallax(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const parallax = useTransform(scrollYProgress, [0, 1], [36, -36])
  const backdrop = useTransform(scrollYProgress, [0, 1], [-30, 30])
  const still = useMotionValue(0)
  const moving = canParallax && !reduce

  return (
    <section id="dashboard" className="section overflow-hidden">
      <div className="wrap">
        <SectionHeading title="Complete Visibility Into Every Conversation">
          Follow campaigns, sentiment, lead quality, and payment promises from one screen.
        </SectionHeading>

        <div ref={ref} className="relative">
          <motion.div
            aria-hidden="true"
            style={{ y: moving ? backdrop : still }}
            className="absolute -inset-x-6 -bottom-8 top-16 -z-10 rounded-[2rem] bg-gradient-to-br from-[#e6eeff] to-[#efe9ff] lg:-inset-x-10"
          />
          <motion.div style={{ y: moving ? parallax : still }}>
            <motion.div
              initial={{ opacity: 0, y: 44, scale: 0.975 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.12 }}
              transition={{ duration: 1, ease: easeSoft }}
              className="overflow-hidden rounded-[20px] border border-line bg-white shadow-frame"
            >
              <Dashboard chartsReady={near} />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
