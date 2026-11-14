'use client'

import { useId } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface ChartData {
  date: string
  calls_made: number
  connected_calls: number
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Works out how much time one plotted point covers purely from the labels the
 * API returned (e.g. "Oct 14" -> "Oct 16" = 2 days, "02 PM" -> "04 PM" = 2
 * hours), so the caption can never disagree with the data. Returns null when
 * the labels are not in a recognised shape; nothing is shown in that case.
 */
function describeInterval(data: ChartData[]): string | null {
  if (data.length < 2) return null

  // Only describe the spacing when every consecutive gap is identical.
  const uniform = (gaps: number[], unit: 'hour' | 'day') => {
    const first = gaps[0]
    if (!(first > 0) || gaps.some((g) => g !== first)) return null
    return first === 1 ? `one ${unit}` : `${first} ${unit}s`
  }

  const hourOf = (label: string) => {
    const m = /^(\d{1,2})\s*(AM|PM)$/i.exec(label.trim())
    if (!m) return null
    return (Number(m[1]) % 12) + (m[2].toUpperCase() === 'PM' ? 12 : 0)
  }
  const hours = data.map((d) => hourOf(d.date))
  if (hours.every((h): h is number => h !== null)) {
    const gaps = hours.slice(1).map((h, i) => (((h - (hours[i] as number)) % 24) + 24) % 24)
    return uniform(gaps, 'hour')
  }

  const dayOf = (label: string) => {
    const m = /^([A-Za-z]{3})\s+(\d{1,2})$/.exec(label.trim())
    if (!m) return null
    const month = MONTHS.indexOf(m[1].toLowerCase())
    return month < 0 ? null : { month, day: Number(m[2]) }
  }
  const days = data.map((d) => dayOf(d.date))
  if (days.every((d): d is { month: number; day: number } => d !== null)) {
    const year = new Date().getUTCFullYear()
    const gaps = days.slice(1).map((d, i) => {
      const prev = days[i] as { month: number; day: number }
      const ta = Date.UTC(year, prev.month, prev.day)
      let tb = Date.UTC(year, d.month, d.day)
      if (tb < ta) tb = Date.UTC(year + 1, d.month, d.day)
      return Math.round((tb - ta) / 86400000)
    })
    return uniform(gaps, 'day')
  }
  return null
}

const BLUE = '#2463eb'
const PURPLE = '#6f4bde' // matches --color-ds-accent
const GRID = '#e2e8f0'
const TICK = '#64748b'

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null
  const made = payload.find((p: any) => p.dataKey === 'calls_made')?.value ?? 0
  const connected = payload.find((p: any) => p.dataKey === 'connected_calls')?.value ?? 0
  return (
    <div className="rounded-lg border border-ds-line bg-ds-bg px-3 py-2 text-sm shadow-ds-pop">
      <p className="mb-1.5 font-medium text-ds-ink">{label}</p>
      <p className="flex items-center justify-between gap-6 text-ds-ink-2">
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full" style={{ background: BLUE }} />
          Attempted
        </span>
        <span className="font-medium tabular-nums text-ds-ink">{made}</span>
      </p>
      <p className="mt-1 flex items-center justify-between gap-6 text-ds-ink-2">
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full" style={{ background: PURPLE }} />
          Connected
        </span>
        <span className="font-medium tabular-nums text-ds-ink">{connected}</span>
      </p>
    </div>
  )
}

export function MiniChart({ data, height = 260 }: { data?: ChartData[]; height?: number }) {
  const uid = useId().replace(/:/g, '')

  if (!data || data.length === 0) {
    return (
      <div
        className="mt-4 flex items-center justify-center rounded-lg border border-dashed border-ds-line text-sm text-ds-ink-3"
        style={{ height }}
      >
        No data available
      </div>
    )
  }

  const maxCalls = Math.max(...data.map((d) => d.calls_made), 1)
  const summary = data.map((d) => `${d.date}: ${d.calls_made} attempted, ${d.connected_calls} connected`).join('; ')
  const interval = describeInterval(data)

  return (
    <div className="mt-4">
    <div className="w-full" style={{ height }} role="img" aria-label={`Calling performance chart. ${summary}`}>
      <div aria-hidden="true" className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} accessibilityLayer={false}>
          <defs>
            <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BLUE} stopOpacity={0.18} />
              <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${uid}-b`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PURPLE} stopOpacity={0.18} />
              <stop offset="100%" stopColor={PURPLE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: TICK, fontSize: 14 }}
            tickMargin={8}
            minTickGap={32}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            domain={[0, maxCalls]}
            tick={{ fill: TICK, fontSize: 14 }}
            width={48}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="calls_made"
            stroke={BLUE}
            strokeWidth={2}
            fill={`url(#${uid}-a)`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="connected_calls"
            stroke={PURPLE}
            strokeWidth={2}
            fill={`url(#${uid}-b)`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
    {interval && (
      <p className="mt-2 text-[13px] text-ds-ink-3">
        Each point covers {interval}. Dates and times are shown in UTC.
      </p>
    )}
    </div>
  )
}
