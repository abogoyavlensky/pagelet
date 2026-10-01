import { useCallback, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, useApi, type Period, type Stats } from '../api'
import Breakdown, { Events } from '../components/Breakdown'
import { Segmented } from '../components/Card'
import LiveCard from '../components/LiveCard'
import StatCards, { type Metric } from '../components/StatCards'
import Timeseries from '../components/Timeseries'
import TopBar from '../components/TopBar'
import Waiting from '../components/Waiting'
import { country } from '../format'
import { useSignedOutOn } from '../session'

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
        <Body report={shown} metric={metric} onMetric={setMetric} dim={report.loading || !!report.error} siteId={id} />
      )}
    </div>
  )
}

const DEVICE_VIEWS = [
  { value: 'devices', label: 'Devices' },
  { value: 'browsers', label: 'Browsers' },
  { value: 'os', label: 'Systems' },
] as const

type DeviceView = (typeof DEVICE_VIEWS)[number]['value']

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Body({ report, metric, onMetric, dim, siteId }: {
  report: Report
  metric: Metric
  onMetric: (m: Metric) => void
  dim: boolean
  siteId: string
}) {
  const { stats, period } = report
  const [devices, setDevices] = useState<DeviceView>('devices')
  // grid-cols-1 is minmax(0, 1fr): a long row never widens the column past the screen.
  const gap = 'grid grid-cols-1 gap-3 sm:gap-4 [&>*]:min-w-0'
  return (
    <div className={`${gap} transition-opacity ${dim ? 'opacity-60' : ''}`}>
      <StatCards stats={stats} period={period} />
      <div className={`${gap} lg:grid-cols-3`}>
        <Timeseries data={stats.timeseries} metric={metric} onMetric={onMetric} className="lg:col-span-2" />
        <LiveCard siteId={siteId} />
      </div>
      <div className={`${gap} md:grid-cols-2`}>
        <Breakdown title="Pages" testId="pages" rows={stats.pages} />
        <Breakdown title="Sources" testId="sources" rows={stats.referrers} />
      </div>
      <div className={`${gap} md:grid-cols-2 md:items-start`}>
        <Breakdown title="Countries" testId="countries" rows={stats.countries} share={stats.totals.visitors} label={country} />
        <div className={gap}>
          <Breakdown key={devices} testId="devices" rows={stats[devices]} share={stats.totals.visitors}
            label={devices === 'devices' ? capitalised : undefined}
            title={<Segmented label="Show" size="sm" value={devices} options={[...DEVICE_VIEWS]} onChange={setDevices} />} />
          <Events rows={stats.events} />
        </div>
      </div>
    </div>
  )
}
