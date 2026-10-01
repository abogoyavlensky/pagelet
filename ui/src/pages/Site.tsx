import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, useApi, type Period, type Stats } from '../api'
import RankedList from '../components/RankedList'
import StatRow, { type Metric } from '../components/StatRow'
import Timeseries from '../components/Timeseries'
import TopBar from '../components/TopBar'
import { country } from '../format'
import { LAST_SITE, useSignedOutOn } from '../session'

// The period lives in the URL (?period=7d, ?period=custom&from=..&to=..)
// so a reload or a shared link shows the same range.
function readPeriod(q: URLSearchParams): Period {
  const p = q.get('period')
  if (p === 'custom') return { period: 'custom', from: q.get('from') ?? '', to: q.get('to') ?? '' }
  if (p === 'today' || p === '30d') return { period: p }
  return { period: '7d' }
}

function periodKey(p: Period) {
  return p.period === 'custom' ? `custom:${p.from}:${p.to}` : p.period
}

export default function Site() {
  const { id = '' } = useParams()
  const [query, setQuery] = useSearchParams()
  const period = readPeriod(query)
  const [metric, setMetric] = useState<Metric>('visitors')

  const sites = useApi(() => api.sites(), [])
  const stats = useApi(() => api.stats(id, period), [id, periodKey(period)])
  useSignedOutOn(sites.error ?? stats.error)
  const site = sites.data?.find((s) => s.id === id)

  useEffect(() => { if (site) localStorage.setItem(LAST_SITE, site.id) }, [site])

  const choose = (p: Period) => {
    const q = new URLSearchParams({ period: p.period })
    if (p.period === 'custom') {
      q.set('from', p.from)
      q.set('to', p.to)
    }
    setQuery(q)
  }

  if (sites.data && !site) {
    return (
      <div className="py-16">
        <p className="font-display text-2xl">No such site.</p>
        <Link to="/" className="mt-4 inline-block text-ink underline underline-offset-4">Open the dashboard</Link>
      </div>
    )
  }

  return (
    <div>
      <TopBar sites={sites.data} site={site} period={period} onPeriod={choose} live onSaved={sites.reload} />

      {/* A failed load keeps the last report on screen, marked as such, so
          old numbers never pass for the period that was asked for. */}
      {stats.error && (
        <p role="alert" className="pb-6 text-sm text-danger">
          Could not load this period: {stats.error.message}.
          {stats.data && ' Showing the previous one.'}{' '}
          <button onClick={stats.reload} className="underline underline-offset-2">Retry</button>
        </p>
      )}

      {stats.data && (
        <Report stats={stats.data} metric={metric} onMetric={setMetric}
          dim={stats.loading || !!stats.error} />
      )}
    </div>
  )
}

function Report({ stats, metric, onMetric, dim }: {
  stats: Stats
  metric: Metric
  onMetric: (m: Metric) => void
  dim: boolean
}) {
  const rows = (list: Stats['pages']) => list.map((r) => ({ name: r.name, a: r.visitors, b: r.pageviews }))
  const vp: [string, string] = ['Visitors', 'Views']
  return (
    <div className={`transition-opacity ${dim ? 'opacity-50' : ''}`}>
      <div>
        <StatRow totals={stats.totals} metric={metric} onMetric={onMetric} />
      </div>
      <div className="pt-8">
        <Timeseries data={stats.timeseries} metric={metric} />
      </div>
      <div className="grid gap-x-14 gap-y-12 pt-14 min-[720px]:grid-cols-2">
        <RankedList title="Pages" columns={vp} items={rows(stats.pages)} />
        <RankedList title="Referrers" columns={vp} items={rows(stats.referrers)} />
        <RankedList title="Countries" columns={vp}
          items={rows(stats.countries).map((r) => ({ ...r, name: country(r.name) }))} />
        <RankedList title="Browsers" columns={vp} items={rows(stats.browsers)} />
        <RankedList title="OS" columns={vp} items={rows(stats.os)} />
        <RankedList title="Devices" columns={vp} items={rows(stats.devices)} />
        <RankedList title="Events" columns={['Count', 'Visitors']}
          items={stats.events.map((e) => ({ name: e.name, a: e.count, b: e.visitors }))} />
      </div>
    </div>
  )
}
