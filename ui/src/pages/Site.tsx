import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, useApi, type Period, type Stats } from '../api'
import Breakdown, { Events } from '../components/Breakdown'
import Headline, { type Metric } from '../components/Headline'
import Timeseries from '../components/Timeseries'
import TopBar from '../components/TopBar'
import Waiting from '../components/Waiting'
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

/** A report and the period it was asked for, so its wording never claims another. */
type Report = { stats: Stats; period: Period }

export default function Site() {
  const { id = '' } = useParams()
  const [query, setQuery] = useSearchParams()
  const period = readPeriod(query)
  const key = periodKey(period)
  const [metric, setMetric] = useState<Metric>('visitors')

  const sites = useApi(() => api.sites(), [])
  const load = useCallback(
    () => api.stats(id, period).then((stats): Report => ({ stats, period })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, key],
  )
  const report = useApi(load, [load])
  // The answer that showed the first visit, until a fresh report has events.
  const [first, setFirst] = useState<Report>()
  useSignedOutOn(sites.error ?? report.error)
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

  const shown = first && report.data && !report.data.stats.has_events ? first : report.data
  const waiting = shown !== undefined && !shown.stats.has_events

  return (
    <div>
      <TopBar sites={sites.data} site={site} period={period} onPeriod={choose} live={!waiting}
        onSaved={sites.reload} />

      {/* A failed load keeps the last report on screen, dimmed and marked as
          such, still worded for the period it was loaded for. */}
      {report.error && (
        <p role="alert" className="pb-8 text-sm text-danger">
          Could not load this period: {report.error.message}.
          {shown && ' Showing the previous one.'}{' '}
          <button onClick={report.reload} className="underline underline-offset-2">Retry</button>
        </p>
      )}

      {waiting && <Waiting site={site} load={load} onOpen={setFirst} />}
      {shown && !waiting && (
        <Body report={shown} metric={metric} onMetric={setMetric} dim={report.loading || !!report.error} />
      )}
    </div>
  )
}

const DEVICE_VIEWS = [
  { key: 'devices', label: 'Devices' },
  { key: 'browsers', label: 'Browsers' },
  { key: 'os', label: 'Systems' },
] as const

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Body({ report, metric, onMetric, dim }: {
  report: Report
  metric: Metric
  onMetric: (m: Metric) => void
  dim: boolean
}) {
  const { stats, period } = report
  const [devices, setDevices] = useState<(typeof DEVICE_VIEWS)[number]['key']>('devices')
  const fade = `transition-opacity ${dim ? 'opacity-50' : ''}`

  if (stats.totals.visitors === 0) {
    return <div className={fade}><Headline stats={stats} period={period} metric={metric} onMetric={onMetric} /></div>
  }

  const totals = { visitors: stats.totals.visitors, pageviews: stats.totals.pageviews }
  const deviceTitle = (
    <span className="flex gap-3">
      {DEVICE_VIEWS.map((v) => (
        <button key={v.key} type="button" aria-pressed={devices === v.key} onClick={() => setDevices(v.key)}
          className={`rounded-sm transition-colors ${devices === v.key ? 'text-ink' : 'font-normal text-muted hover:text-ink'}`}>
          {v.label}
        </button>
      ))}
    </span>
  )

  return (
    <div className={fade}>
      <Headline stats={stats} period={period} metric={metric} onMetric={onMetric} />
      <div className="mt-12">
        <Timeseries data={stats.timeseries} metric={metric} />
      </div>
      <div className="mt-14 grid gap-x-16 gap-y-10 min-[720px]:grid-cols-2">
        <Breakdown title="Pages" testId="pages" rows={stats.pages} />
        <Breakdown title="Sources" testId="sources" rows={stats.referrers} />
        <Breakdown title="Countries" testId="countries" rows={stats.countries} totals={totals} label={country} />
        <Breakdown key={devices} title={deviceTitle} testId="devices" rows={stats[devices]} totals={totals}
          label={devices === 'devices' ? capitalised : undefined} />
        {stats.events.length > 0 && <Events rows={stats.events} />}
      </div>
    </div>
  )
}
