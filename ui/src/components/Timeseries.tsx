import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Stats } from '../api'
import { count, longDate, tick } from '../format'
import { Segmented } from './Card'
import Card from './Card'
import type { Metric } from './StatCards'

// The traffic card: one series in its metric's colour with a soft wash
// under it, hairline gridlines, and a readout of both numbers on hover.
// The switch between visitors and pageviews sits in the card's header.
const COLOR: Record<Metric, string> = { visitors: 'var(--color-visitors)', pageviews: 'var(--color-pageviews)' }
const HAIRLINE = 'var(--color-hairline)'
const MUTED = 'var(--color-muted)'

type Point = Stats['timeseries'][number]

function Readout({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm shadow-float">
      <p className="text-xs font-medium text-muted">{longDate(p.t)}</p>
      <p className="mt-1.5 flex items-center gap-2">
        <span className="size-2 rounded-full bg-visitors" />
        <span className="num font-semibold text-ink">{count(p.visitors)}</span>
        <span className="text-muted">visitors</span>
      </p>
      <p className="mt-0.5 flex items-center gap-2">
        <span className="size-2 rounded-full bg-pageviews" />
        <span className="num font-semibold text-ink">{count(p.pageviews)}</span>
        <span className="text-muted">pageviews</span>
      </p>
    </div>
  )
}

export default function Timeseries({ data, metric, onMetric, className = '' }: {
  data: Stats['timeseries']
  metric: Metric
  onMetric: (m: Metric) => void
  className?: string
}) {
  const color = COLOR[metric]
  return (
    <Card className={className} title="Traffic"
      action={<Segmented label="Chart shows" size="sm" value={metric} onChange={onMetric}
        options={[{ value: 'visitors', label: 'Visitors' }, { value: 'pageviews', label: 'Pageviews' }]} />}>
      <figure>
        <figcaption className="sr-only">{metric === 'visitors' ? 'Visitors' : 'Pageviews'} over the period</figcaption>
        <div key={metric} className="fade -ml-2 h-56 sm:h-64" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`wash-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={HAIRLINE} />
              <XAxis dataKey="t" tickFormatter={tick} interval="preserveStartEnd" minTickGap={32} tickLine={false}
                axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} dy={8} />
              <YAxis allowDecimals={false} tickCount={5} tickLine={false} axisLine={false} width={40}
                tick={{ fill: MUTED, fontSize: 12 }} tickFormatter={(v: number) => count(v)} />
              <Tooltip cursor={{ stroke: MUTED, strokeWidth: 1, strokeOpacity: 0.4 }} isAnimationActive={false}
                wrapperStyle={{ outline: 'none' }} content={(props) => <Readout {...(props as object)} />} />
              <Area type="monotone" dataKey={metric} stroke={color} strokeWidth={2.5} fill={`url(#wash-${metric})`}
                strokeLinejoin="round" strokeLinecap="round"
                activeDot={{ r: 5, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <thead><tr><th>Time</th><th>Visitors</th><th>Pageviews</th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.t}><td>{longDate(p.t)}</td><td>{p.visitors}</td><td>{p.pageviews}</td></tr>
            ))}
          </tbody>
        </table>
      </figure>
    </Card>
  )
}
