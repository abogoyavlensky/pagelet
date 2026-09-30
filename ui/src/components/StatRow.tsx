import type { Stats } from '../api'
import { count } from '../format'

export type Metric = 'visitors' | 'pageviews'

/**
 * The period's headline numbers. Visitors and Pageviews are also the chart's
 * switch: the one pressed is the series the timeseries plots.
 */
export default function StatRow({ totals, metric, onMetric }: {
  totals: Stats['totals']
  metric: Metric
  onMetric: (m: Metric) => void
}) {
  const stat = (label: string, value: string, m?: Metric) => {
    const body = (
      <>
        <span className="block text-xs font-medium tracking-[0.12em] text-muted uppercase">{label}</span>
        <span className="display-num mt-1 block text-5xl leading-none text-ink sm:text-6xl">{value}</span>
      </>
    )
    if (!m) return <div className="py-5 pr-6">{body}</div>
    const active = metric === m
    return (
      <button aria-pressed={active} onClick={() => onMetric(m)}
        className={`relative py-5 pr-6 text-left transition-colors ${active ? '' : 'opacity-60 hover:opacity-100'}`}>
        {body}
        <span className={`absolute bottom-0 left-0 h-0.5 w-10 transition-colors ${active ? 'bg-accent' : 'bg-transparent'}`} />
      </button>
    )
  }
  return (
    <div className="grid grid-cols-3 border-b border-hairline" data-testid="totals">
      {stat('Visitors', count(totals.visitors), 'visitors')}
      {stat('Pageviews', count(totals.pageviews), 'pageviews')}
      {stat('Views per visitor', totals.views_per_visitor.toFixed(1))}
    </div>
  )
}
