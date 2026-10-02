import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError, useApi, type Site, type Stats } from '../api'
import SiteMark from '../components/SiteMark'
import TopBar from '../components/TopBar'
import { change, count } from '../format'
import { useRefresh } from '../refresh'
import { useSignedOutOn } from '../session'

/** A small area line of the last 7 days' visitors. */
function Sparkline({ points }: { points: number[] }) {
  const w = 120, h = 40
  const max = Math.max(1, ...points)
  const step = points.length > 1 ? w / (points.length - 1) : w
  const xy = points.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} className="h-10 w-28 overflow-visible">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--color-visitors-soft)" />
      <path d={line} fill="none" stroke="var(--color-visitors)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** One site's last 7 days; asks again whenever `tick` moves, keeping its numbers meanwhile. */
function SiteCard({ site, tick }: { site: Site; tick: number }) {
  const [stats, setStats] = useState<Stats>()
  const [failed, setFailed] = useState<unknown>()
  const [online, setOnline] = useState(0)
  const [tries, setTries] = useState(0)
  useSignedOutOn(failed)
  useEffect(() => {
    let live = true
    api.stats(site.id, { period: '7d' }).then((s) => { if (live) setStats(s) }, (e) => { if (live) setFailed(e) })
    api.realtime(site.id).then((r) => { if (live) setOnline(r.online) }, () => {})
    return () => { live = false }
  }, [site.id, tries, tick])

  const t = stats?.totals
  const c = t && change(t.visitors, stats.previous.visitors)
  return (
    <Link to={`/sites/${site.id}`}
      className="group rounded-card border border-hairline bg-surface p-5 transition-colors hover:border-faint">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SiteMark domain={site.domain} size="lg" />
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold text-ink">{site.domain}</span>
              {site.public && (
                <span className="shrink-0 rounded-full bg-track px-1.5 py-0.5 text-[11px] font-medium text-muted">Public</span>
              )}
            </p>
            <p className="text-xs text-muted">Last 7 days</p>
          </div>
        </div>
        {online > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-up-soft px-2 py-0.5 text-xs font-medium text-up">
            <span className="size-1.5 rounded-full bg-pageviews" />
            {count(online)} online
          </span>
        )}
      </div>
      {failed && !stats ? (
        <p className="mt-6 rounded-xl bg-paper px-3 py-3 text-sm text-danger">
          Could not load this site's numbers.{' '}
          <button type="button" onClick={(e) => { e.preventDefault(); setFailed(undefined); setTries((n) => n + 1) }}
            className="font-medium underline underline-offset-2">
            Retry
          </button>
        </p>
      ) : stats && !stats.has_events ? (
        <p className="mt-6 rounded-xl bg-paper px-3 py-3 text-sm text-muted">Waiting for the first visit</p>
      ) : (
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[28px] leading-none font-semibold tracking-tight text-ink">{t ? count(t.visitors) : '–'}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              visitors
              {c && (
                <span className={`rounded-full px-1.5 py-0.5 font-semibold ${c.up ? 'bg-up-soft text-up' : 'bg-down-soft text-down'}`}>
                  {c.up ? '↑' : '↓'} {count(c.pct)}%
                </span>
              )}
            </p>
          </div>
          {stats && <Sparkline points={stats.timeseries.map((p) => p.visitors)} />}
        </div>
      )}
    </Link>
  )
}

/** "/": every website at a glance, the way analytics apps open. */
export default function Sites() {
  const sites = useApi(() => api.sites(), [])
  // Every card asks again when this moves: each minute, on return to the
  // tab, and on Refresh. The list itself refreshes too, so a site added
  // elsewhere shows up.
  const [tick, setTick] = useState(0)
  useRefresh(() => { sites.refresh(); setTick((t) => t + 1) })
  useSignedOutOn(sites.error)
  return (
    <>
      <TopBar onRefresh={() => { sites.reload(); setTick((t) => t + 1) }} refreshing={sites.loading} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Websites</h1>
          <p className="mt-1 text-sm text-muted">Visitors over the last 7 days.</p>
        </div>
        <Link to="/sites/new"
          className="flex h-9 items-center gap-1.5 rounded-[10px] bg-ink px-3.5 text-sm font-medium text-paper transition-opacity hover:opacity-90">
          <span aria-hidden className="text-base leading-none">+</span> Add website
        </Link>
      </div>
      {sites.error && !(sites.error instanceof ApiError && sites.error.status === 401) && (
        <p role="alert" className="mt-6 text-sm text-danger">
          Could not load the websites.{' '}
          <button onClick={sites.reload} className="underline underline-offset-2">Retry</button>
        </p>
      )}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {sites.data?.map((s) => <SiteCard key={s.id} site={s} tick={tick} />)}
        {sites.data && (
          <Link to="/sites/new"
            className="grid min-h-24 place-items-center rounded-card border-2 border-dashed sm:min-h-40 border-hairline text-sm font-medium text-muted transition-colors hover:border-faint hover:text-ink">
            + Add website
          </Link>
        )}
      </div>
    </>
  )
}
