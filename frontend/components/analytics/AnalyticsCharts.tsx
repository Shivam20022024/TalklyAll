'use client'

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Same palette as the calling-performance chart: blue and purple series, with a
// neutral third value. Every series is also labelled in text, never colour-only.
const BLUE = '#2463eb'
const PURPLE = '#6f4bde' // matches --color-ds-accent
const SLATE = '#94a3b8'
const GRID = '#e2e8f0'
const TICK = '#64748b'

function Tip({ active, payload, label, unit }: any) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border border-ds-line bg-ds-bg px-3 py-2 text-xs shadow-ds-pop">
      <p className="mb-1 font-medium text-ds-ink">{label ?? p.name}</p>
      <p className="flex items-center justify-between gap-6 text-ds-ink-2">
        <span>{unit}</span>
        <span className="font-medium tabular-nums text-ds-ink">{p.value}</span>
      </p>
    </div>
  )
}

/** Hot / warm / cold analysed calls as columns. Values are the API counts. */
export function TemperatureChart({ hot, warm, cold, height = 220 }: { hot: number; warm: number; cold: number; height?: number }) {
  const data = [
    { name: 'Hot', value: hot, fill: BLUE },
    { name: 'Warm', value: warm, fill: PURPLE },
    { name: 'Cold', value: cold, fill: SLATE },
  ]
  const summary = data.map((d) => `${d.name}: ${d.value}`).join('; ')
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={`Lead temperature of analysed calls. ${summary}`}>
      {/* The chart itself is described by the label above; hide its SVG internals from assistive tech. */}
      <div aria-hidden="true" className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} accessibilityLayer={false}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: TICK, fontSize: 12 }} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fill: TICK, fontSize: 11 }} width={44} />
          <Tooltip content={<Tip unit="Analysed calls" />} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Inbound vs outbound call volume as a donut with the total in the centre. */
export function DirectionChart({ inbound, outbound, height = 180 }: { inbound: number; outbound: number; height?: number }) {
  const total = inbound + outbound
  const data = [
    { name: 'Outbound', value: outbound, fill: BLUE },
    { name: 'Inbound', value: inbound, fill: PURPLE },
  ]
  return (
    <div className="relative w-full" style={{ height }} role="img" aria-label={`Call direction. Outbound: ${outbound}; inbound: ${inbound}`}>
      <div aria-hidden="true" className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart accessibilityLayer={false}>
          <Pie rootTabIndex={-1} data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={total > 0 && inbound > 0 && outbound > 0 ? 2 : 0} stroke="none" isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Pie>
          <Tooltip content={<Tip unit="Calls" />} />
        </PieChart>
      </ResponsiveContainer>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums text-ds-ink">{total}</span>
        <span className="text-xs text-ds-ink-3">total calls</span>
      </div>
    </div>
  )
}
