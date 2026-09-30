import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Stats } from '../api'
import { count, longDate, tick } from '../format'
import type { Metric } from './StatRow'

// One series, so no legend: the pressed stat above names it. Marks follow
// the dataviz specs: a 2px line, a ~10% wash, hairline solid grid, a
// hairline crosshair, and a hover dot ringed in the surface color. Text is
// ink and muted, never the accent. No draw-in animation: the page's only
// motion is the load stagger, the online pulse and hover.
const ACCENT = '#0f766e'
const HAIRLINE = '#e4e0d6'
const MUTED = '#6f6b63'
const PAPER = '#f6f4ee'

const LABELS: Record<Metric, string> = { visitors: 'Visitors', pageviews: 'Pageviews' }

type Point = Stats['timeseries'][number]

function Readout({ active, payload, metric }: {
  active?: boolean
  payload?: { payload: Point }[]
  metric: Metric
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const other: Metric = metric === 'visitors' ? 'pageviews' : 'visitors'
  return (
    <div className="border border-hairline bg-card px-3 py-2 text-sm shadow-[0_8px_24px_-12px_#1b1a1740]">
      <p className="text-xs text-muted">{longDate(p.t)}</p>
      <p className="mt-1 flex items-center gap-2">
        <span className="inline-block h-0.5 w-3 bg-accent" />
        <strong className="num font-medium text-ink">{count(p[metric])}</strong>
        <span className="text-muted">{LABELS[metric].toLowerCase()}</span>
      </p>
      <p className="flex items-center gap-2 pl-5">
        <span className="num text-ink">{count(p[other])}</span>
        <span className="text-muted">{LABELS[other].toLowerCase()}</span>
      </p>
    </div>
  )
}

export default function Timeseries({ data, metric }: { data: Stats['timeseries']; metric: Metric }) {
  const every = data.length > 16 ? Math.ceil(data.length / 8) - 1 : data.length > 8 ? 1 : 0
  return (
    <figure>
      <figcaption className="sr-only">{LABELS[metric]} over the period</figcaption>
      <div className="h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 28, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.14} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={HAIRLINE} />
            <XAxis dataKey="t" tickFormatter={tick} interval={every} tickLine={false}
              axisLine={{ stroke: HAIRLINE }} tick={{ fill: MUTED, fontSize: 12 }} dy={6} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40}
              tick={{ fill: MUTED, fontSize: 12 }} tickFormatter={(v: number) => count(v)} />
            <Tooltip cursor={{ stroke: MUTED, strokeWidth: 1 }} isAnimationActive={false}
              content={(props) => <Readout {...(props as object)} metric={metric} />} />
            <Area type="monotone" dataKey={metric} stroke={ACCENT} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" fill="url(#wash)"
              activeDot={{ r: 4.5, fill: ACCENT, stroke: PAPER, strokeWidth: 2 }}
              isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* The same numbers as a table, for screen readers. */}
      <table className="sr-only">
        <thead><tr><th>Time (UTC)</th><th>Visitors</th><th>Pageviews</th></tr></thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.t}><td>{longDate(p.t)}</td><td>{p.visitors}</td><td>{p.pageviews}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
