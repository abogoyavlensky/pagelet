import type { Period, Stats } from '../api'
import { change, count, versus } from '../format'

export type Metric = 'visitors' | 'pageviews'

// Each metric's soft tile, dot and label tone (written out for Tailwind).
const LOOK = {
  visitors: { tile: 'bg-visitors-soft', dot: 'bg-visitors', label: 'text-visitors-deep' },
  pageviews: { tile: 'bg-pageviews-soft', dot: 'bg-pageviews', label: 'text-pageviews-deep' },
  views: { tile: 'bg-views-soft', dot: 'bg-views', label: 'text-views-deep' },
  bounce: { tile: 'bg-bounce-soft', dot: 'bg-bounce', label: 'text-bounce-deep' },
}

/** ↑ 14% in green or ↓ 8% in orange; nothing when there is nothing to compare with. */
function Change({ now, then, p }: { now: number; then: number; p: Period }) {
  const c = change(now, then)
  if (!c) return <span className="text-muted">No earlier data</span>
  const { up, pct } = c
  return (
    <>
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
        pct === 0 ? 'bg-surface/70 text-muted' : up ? 'bg-up-soft text-up' : 'bg-down-soft text-down'}`}>
        {pct === 0 ? '±0%' : `${up ? '↑' : '↓'} ${count(pct)}%`}
      </span>
      <span className="text-muted">{versus(p)}</span>
    </>
  )
}

function Tile({ look, label, value, testId, children }: {
  look: keyof typeof LOOK
  label: string
  value: string
  testId: string
  children?: React.ReactNode
}) {
  const l = LOOK[look]
  return (
    <div data-testid={testId} className={`rounded-card p-4 sm:p-5 ${l.tile}`}>
      <p className={`flex items-center gap-2 text-sm font-medium ${l.label}`}>
        <span aria-hidden className={`size-2 rounded-full ${l.dot}`} />
        {label}
      </p>
      <p className="mt-2.5 text-[28px] leading-none font-semibold tracking-tight text-ink sm:text-[34px]">{value}</p>
      <p className="mt-3 flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">{children}</p>
    </div>
  )
}

/** The four numbers of the period, each on its own soft tile, with the change against the span before. */
export default function StatCards({ stats, period }: { stats: Stats; period: Period }) {
  const { totals, previous } = stats
  const vpvBefore = previous.visitors ? previous.pageviews / previous.visitors : 0
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*]:min-w-0">
      <Tile look="visitors" label="Visitors" value={count(totals.visitors)} testId="stat-visitors">
        <Change now={totals.visitors} then={previous.visitors} p={period} />
      </Tile>
      <Tile look="pageviews" label="Pageviews" value={count(totals.pageviews)} testId="stat-pageviews">
        <Change now={totals.pageviews} then={previous.pageviews} p={period} />
      </Tile>
      <Tile look="views" label="Views per visit" value={totals.views_per_visitor.toFixed(1)} testId="stat-views-per-visit">
        <Change now={totals.views_per_visitor} then={vpvBefore} p={period} />
      </Tile>
      <Tile look="bounce" label="Bounce rate" value={`${totals.bounce_rate}%`} testId="stat-bounce">
        <span className="text-muted">Visits that saw one page</span>
      </Tile>
    </div>
  )
}
