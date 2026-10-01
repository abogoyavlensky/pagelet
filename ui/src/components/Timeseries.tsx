import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Stats } from '../api'
import { count, longDate, tick } from '../format'
import type { Metric } from './Headline'

// One quiet line: 2px in the accent, no fill and no grid, a hairline
// baseline, three muted y ticks, and a hover readout of both numbers. One
// series, so no legend: the underlined number above names it. Colours are
// the theme's CSS variables, so the dark theme needs nothing here. Switching
// metric fades the line in; there is no draw-in.
const ACCENT = 'var(--color-accent)'
const HAIRLINE = 'var(--color-hairline)'
const MUTED = 'var(--color-muted)'
const PAPER = 'var(--color-paper)'

const LABELS: Record<Metric, string> = { visitors: 'visitors', pageviews: 'pageviews' }

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
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2 text-sm shadow-float">
      <p className="text-xs text-muted">{longDate(p.t)}</p>
      <p className="mt-1 flex items-center gap-2">
        <span className="inline-block h-0.5 w-3 rounded-full bg-accent" />
        <strong className="num font-medium text-ink">{count(p[metric])}</strong>
        <span className="text-muted">{LABELS[metric]}</span>
      </p>
      <p className="flex items-center gap-2 pl-5">
        <span className="num text-ink">{count(p[other])}</span>
        <span className="text-muted">{LABELS[other]}</span>
      </p>
    </div>
  )
}

export default function Timeseries({ data, metric }: { data: Stats['timeseries']; metric: Metric }) {
  const every = data.length > 16 ? Math.ceil(data.length / 8) - 1 : data.length > 8 ? 1 : 0
  return (
    <figure>
      <figcaption className="sr-only">{metric === 'visitors' ? 'Visitors' : 'Pageviews'} over the period</figcaption>
      <div key={metric} className="fade h-60" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <XAxis dataKey="t" tickFormatter={tick} interval={every} tickLine={false}
              axisLine={{ stroke: HAIRLINE }} tick={{ fill: MUTED, fontSize: 12 }} dy={8} />
            <YAxis allowDecimals={false} tickCount={3} tickLine={false} axisLine={false} width={40}
              tick={{ fill: MUTED, fontSize: 12 }} tickFormatter={(v: number) => count(v)} />
            <Tooltip cursor={{ stroke: HAIRLINE, strokeWidth: 1 }} isAnimationActive={false}
              wrapperStyle={{ outline: 'none' }}
              content={(props) => <Readout {...(props as object)} metric={metric} />} />
            <Line type="monotone" dataKey={metric} stroke={ACCENT} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" dot={false}
              activeDot={{ r: 4.5, fill: ACCENT, stroke: PAPER, strokeWidth: 2 }}
              isAnimationActive={false} />
          </LineChart>
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
