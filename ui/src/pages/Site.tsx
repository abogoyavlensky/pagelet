import { useCallback, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { api, ApiError, useApi, type Period, type Site as SiteRow, type Stats } from '../api'
import Breakdown, { Events, Pages } from '../components/Breakdown'
import { Segmented } from '../components/Card'
import LiveCard from '../components/LiveCard'
import StatCards, { type Metric } from '../components/StatCards'
import Timeseries from '../components/Timeseries'
import TopBar from '../components/TopBar'
import Waiting from '../components/Waiting'
import { country, isCurrent } from '../format'
import { useRefresh } from '../refresh'
import { useSession, useSignedOutOn } from '../session'

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

/**
 * The sites the page knows: signed in, every site (for the switcher);
 * signed out, just this one, which the server gives only when it is
 * public. Its 401 comes back as 'denied' rather than as an error: useApi
 * keeps an error until the next answer, so when a session expires on a
 * public site the signed-in list's 401 is still there while this load
 * runs, and only this load's own answer may send the visitor to /login.
 */
function loadSites(viewer: boolean, id: string): Promise<SiteRow[] | 'denied'> {
  if (!viewer) return api.sites()
  return api.site(id).then(
    (s) => [s],
    (e) => {
      if (e instanceof ApiError && e.status === 401) return 'denied' as const
      throw e
    },
  )
}

export default function Site() {
  const { id = '' } = useParams()
  const [query, setQuery] = useSearchParams()
  const period = readPeriod(query)
  const key = periodKey(period)
  const [metric, setMetric] = useState<Metric>('visitors')
  // Bumped by the Refresh button, so the Right now card asks again too.
  const [nudge, setNudge] = useState(0)
  // Signed out, this is a public site's read-only view.
  const viewer = useSession().state === 'out'

  const sites = useApi(() => loadSites(viewer, id), [viewer, id])
  // The report reloads when the session changes too, so one refused when a
  // session ran out is asked for again as a visitor.
  const load = useCallback(
    () => api.stats(id, period).then((stats): Report => ({ stats, period })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, key, viewer],
  )
  const report = useApi(load, [load])
  // The answer that showed the first visit, until a fresh report has events.
  const [first, setFirst] = useState<Report>()
  useSignedOutOn(sites.error ?? report.error)
  const known = sites.data === 'denied' ? undefined : sites.data
  const site = known?.find((s) => s.id === id)
  const shown = first && report.data && !report.data.stats.has_events ? first : report.data
  const waiting = shown !== undefined && !shown.stats.has_events
  // A report reaching today asks again every minute, quietly. The owner's
  // first-visit screen polls by itself; a visitor's "No visits" view does not.
  useRefresh(report.refresh, shown !== undefined && isCurrent(period) && (!waiting || viewer))

  if (viewer && sites.data === 'denied') return <Navigate to="/login" replace />

  const refreshNow = () => { report.reload(); setNudge((n) => n + 1) }

  const choose = (p: Period) => {
    const q = new URLSearchParams({ period: p.period })
    if (p.period === 'custom') {
      q.set('from', p.from)
      q.set('to', p.to)
    }
    setQuery(q)
  }

  if (known && !site) {
    return (
      <div className="py-16">
        <p className="font-display text-2xl">No such site.</p>
        <Link to="/" className="mt-4 inline-block text-ink underline underline-offset-4">Open the dashboard</Link>
      </div>
    )
  }

  return (
    <div>
      <TopBar sites={known} site={site} period={period} onPeriod={choose} live={!waiting}
        onSaved={sites.reload} viewer={viewer}
        onRefresh={!waiting || viewer ? refreshNow : undefined} refreshing={report.loading} />

      {/* A failed load keeps the last report on screen, dimmed and marked as
          such, still worded for the period it was loaded for. */}
      {report.error && (
        <p role="alert" className="pb-8 text-sm text-danger">
          Could not load this period: {report.error.message}.
          {shown && ' Showing the previous one.'}{' '}
          <button onClick={report.reload} className="underline underline-offset-2">Retry</button>
        </p>
      )}

      {waiting && (viewer ? (
        <p data-testid="no-visits" className="max-w-2xl rounded-card border border-hairline bg-surface p-5 text-muted sm:p-8">
          No visits recorded yet.
        </p>
      ) : <Waiting site={site} load={load} onOpen={setFirst} />)}
      {shown && !waiting && (
        <Body report={shown} metric={metric} onMetric={setMetric} dim={report.loading || !!report.error}
          siteId={id} domain={site?.domain} nudge={nudge} />
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

function Body({ report, metric, onMetric, dim, siteId, domain, nudge }: {
  report: Report
  metric: Metric
  onMetric: (m: Metric) => void
  dim: boolean
  siteId: string
  /** Unset while the site list still loads; pages are plain text until then. */
  domain?: string
  nudge: number
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
        <LiveCard siteId={siteId} domain={domain} nudge={nudge} />
      </div>
      <div className={`${gap} md:grid-cols-2`}>
        <Pages rows={stats.pages} domain={domain} />
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
