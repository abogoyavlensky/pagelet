import type { Period, Stats } from '../api'
import { comparison, count, people, periodPhrase } from '../format'

export type Metric = 'visitors' | 'pageviews'

/**
 * The page's one large thing: a sentence about visitors, how that compares
 * with the span before, then three small numbers. "N people" and
 * "N pageviews" are also the chart's switch; the pressed one is underlined
 * in the line's colour. With nobody in the period the sentence stands alone.
 */
export default function Headline({ stats, period, metric, onMetric }: {
  stats: Stats
  period: Period
  metric: Metric
  onMetric: (m: Metric) => void
}) {
  const { totals, previous } = stats
  const switchClass = (m: Metric) =>
    `rounded-sm underline-offset-[0.2em] transition-[text-decoration-color] ${
      metric === m
        ? 'underline decoration-accent decoration-2'
        : 'underline decoration-transparent decoration-2 hover:decoration-hairline'
    }`

  if (totals.visitors === 0) {
    return (
      <h1 data-testid="headline" className="font-display text-4xl leading-[1.15] tracking-tight text-ink sm:text-5xl">
        Nobody visited {periodPhrase(period)}.
      </h1>
    )
  }

  const change = comparison(totals.visitors, previous.visitors, period)
  return (
    <section>
      <h1 data-testid="headline" className="max-w-[30ch] font-display text-4xl leading-[1.15] tracking-tight text-balance text-ink sm:text-5xl">
        <button type="button" data-testid="metric-visitors" aria-pressed={metric === 'visitors'}
          onClick={() => onMetric('visitors')} className={switchClass('visitors')}>
          {people(totals.visitors)}
        </button>{' '}
        visited {periodPhrase(period)}.
      </h1>
      {change && <p className="mt-3 text-muted">{change}</p>}
      <div className="mt-8 flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <button type="button" data-testid="metric-pageviews" aria-pressed={metric === 'pageviews'}
          onClick={() => onMetric('pageviews')} className="text-left">
          <span className={`num text-lg text-ink ${switchClass('pageviews')}`}>{count(totals.pageviews)}</span>{' '}
          <span className="text-muted">pageviews</span>
        </button>
        <p data-testid="stat-views-per-visit">
          <span className="num text-lg text-ink">{totals.views_per_visitor.toFixed(1)}</span>{' '}
          <span className="text-muted">views per visit</span>
        </p>
        <p data-testid="stat-bounce">
          <span className="num text-lg text-ink">{totals.bounce_rate}%</span>{' '}
          <span className="text-muted">bounced</span>
        </p>
      </div>
    </section>
  )
}
