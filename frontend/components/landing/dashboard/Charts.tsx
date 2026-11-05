'use client'

import { useReducedMotion } from 'framer-motion'
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dashboardSample as data } from '@/lib/landing-content'

const numberFormat = new Intl.NumberFormat('en-IN')
const seriesColor: Record<string, string> = { placed: '#94A3B8', connected: '#2463EB' }
const seriesName: Record<string, string> = { placed: 'Calls placed', connected: 'Connected' }

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-card">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="flex items-center gap-2 text-body">
          <span className="h-0.5 w-3 rounded" style={{ background: seriesColor[entry.dataKey] }} />
          {seriesName[entry.dataKey]}
          <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">{numberFormat.format(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

export function CampaignChart() {
  const reduce = useReducedMotion()
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: 208 }}>
      <LineChart data={data.week} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="#EDF1F8" />
        <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: '#E3E9F4' }} tick={{ fontSize: 11, fill: '#667085' }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={46}
          tick={{ fontSize: 11, fill: '#667085' }}
          tickFormatter={(value) => numberFormat.format(value)}
        />
        <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#C9D4E6' }} />
        {['placed', 'connected'].map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={seriesColor[key]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={!reduce}
            animationDuration={1100}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function SentimentTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-card">
      {name}: {value}%
    </div>
  )
}

export function SentimentChart() {
  const reduce = useReducedMotion()
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 128, height: 128 }}>
      <PieChart>
        <Pie
          data={data.sentiment}
          dataKey="value"
          nameKey="name"
          innerRadius="68%"
          outerRadius="100%"
          paddingAngle={2}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          isAnimationActive={!reduce}
          animationDuration={900}
        >
          {data.sentiment.map((slice) => (
            <Cell key={slice.name} fill={slice.color} />
          ))}
        </Pie>
        <Tooltip content={<SentimentTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  )
}
