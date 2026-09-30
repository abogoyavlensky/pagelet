import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, useApi, type Period, type Site as SiteT, type Stats } from '../api'
import OnlineNow from '../components/OnlineNow'
import PeriodPicker from '../components/PeriodPicker'
import RankedList from '../components/RankedList'
import SiteForm from '../components/SiteForm'
import Snippet from '../components/Snippet'
import StatRow, { type Metric } from '../components/StatRow'
import Timeseries from '../components/Timeseries'
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

// The load animation: header, period, stats, chart, then the panels, 60 ms apart.
const delay = (step: number) => ({ animationDelay: `${step * 60}ms` })

export default function Site() {
  const { id = '' } = useParams()
  const [query, setQuery] = useSearchParams()
  const period = readPeriod(query)
  const [metric, setMetric] = useState<Metric>('visitors')
  const [panel, setPanel] = useState<'none' | 'snippet' | 'settings'>('none')

  const sites = useApi(() => api.sites(), [])
  const stats = useApi(() => api.stats(id, period), [id, periodKey(period)])
  useSignedOutOn(sites.error ?? stats.error)
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
        <Link to="/sites" className="mt-4 inline-block text-accent">All sites</Link>
      </div>
    )
  }

  const toggle = (p: typeof panel) => setPanel(panel === p ? 'none' : p)
  const link = (active: boolean) =>
    `text-sm transition-colors ${active ? 'text-accent' : 'text-muted hover:text-ink'}`

  return (
    <div>
      <header className="rise border-b border-ink pb-5" style={delay(0)}>
        <Link to="/sites" className="text-sm text-muted transition-colors hover:text-ink">← All sites</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="font-display text-5xl font-medium tracking-tight">{site?.name ?? ' '}</h1>
            <p className="mt-2 font-mono text-sm text-muted">{site?.domain}</p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <OnlineNow siteId={id} />
            <div className="flex gap-5">
              <button onClick={() => toggle('snippet')} aria-expanded={panel === 'snippet'}
                className={link(panel === 'snippet')}>
                Snippet
              </button>
              <button onClick={() => toggle('settings')} aria-expanded={panel === 'settings'}
                className={link(panel === 'settings')}>
                Settings
              </button>
            </div>
          </div>
        </div>
      </header>

      {panel === 'snippet' && (
        <div className="rise border-b border-hairline py-6">
          <p className="mb-3 text-sm text-muted">
            Put this in the <code className="font-mono text-ink">&lt;head&gt;</code> of every page on{' '}
            <span className="font-mono text-ink">{site?.domain}</span>.
          </p>
          <Snippet />
        </div>
      )}
      {panel === 'settings' && site && (
        <Settings site={site} onDone={() => { setPanel('none'); sites.reload() }} />
      )}

      <div className="rise flex flex-wrap items-center justify-between gap-4 pt-6" style={delay(1)}>
        {/* Keyed on the period, so Back and Forward (which change the URL,
            not the picker) remount it with the URL's range. */}
        <PeriodPicker key={periodKey(period)} value={period} onChange={choose} />
        <p className="text-xs text-muted">All times UTC</p>
      </div>

      {/* A failed load keeps the last report on screen, marked as such, so
          old numbers never pass for the period that was asked for. */}
      {stats.error && (
        <p role="alert" className="pt-6 text-sm text-red-800">
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
      <div className="rise" style={delay(2)}>
        <StatRow totals={stats.totals} metric={metric} onMetric={onMetric} />
      </div>
      <div className="rise pt-8" style={delay(3)}>
        <Timeseries data={stats.timeseries} metric={metric} />
      </div>
      <div className="grid gap-x-14 gap-y-12 pt-14 min-[720px]:grid-cols-2">
        <RankedList title="Pages" columns={vp} items={rows(stats.pages)} style={delay(4)} />
        <RankedList title="Referrers" columns={vp} items={rows(stats.referrers)} style={delay(5)} />
        <RankedList title="Countries" columns={vp} style={delay(6)}
          items={rows(stats.countries).map((r) => ({ ...r, name: country(r.name) }))} />
        <RankedList title="Browsers" columns={vp} items={rows(stats.browsers)} style={delay(7)} />
        <RankedList title="OS" columns={vp} items={rows(stats.os)} style={delay(8)} />
        <RankedList title="Devices" columns={vp} items={rows(stats.devices)} style={delay(9)} />
        <RankedList title="Events" columns={['Count', 'Visitors']} style={delay(10)}
          items={stats.events.map((e) => ({ name: e.name, a: e.count, b: e.visitors }))} />
      </div>
    </div>
  )
}

/** Rename, move to another domain, or delete (typing the domain to confirm). */
function Settings({ site, onDone }: { site: SiteT; onDone: () => void }) {
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string>()
  const remove = async () => {
    try {
      await api.deleteSite(site.id)
      navigate('/sites')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the site.')
    }
  }
  return (
    <div className="rise grid gap-10 border-b border-hairline py-8">
      <SiteForm initial={site} submitLabel="Save" onCancel={onDone}
        onSubmit={async (name, domain) => { await api.updateSite(site.id, name, domain); onDone() }} />
      <div className="border-t border-hairline pt-6">
        <h2 className="font-display text-lg">Delete this site</h2>
        <p className="mt-1 text-sm text-muted">
          Removes the site and every event recorded for it. Type{' '}
          <span className="font-mono text-ink">{site.domain}</span> to confirm.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input aria-label="Type the domain to confirm" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} autoCapitalize="none" spellCheck={false}
            className="w-64 border-b border-hairline bg-transparent py-1.5 font-mono text-sm outline-none focus-visible:outline-none focus:border-red-800" />
          <button onClick={remove} disabled={confirm.trim().toLowerCase() !== site.domain}
            className="bg-red-800 px-4 py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-30">
            Delete site
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
      </div>
    </div>
  )
}
