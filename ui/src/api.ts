// The dashboard's view of the server: one typed helper per endpoint and a
// small hook for loading data. Types mirror the JSON that
// src/pagelet/stats.lg and routes.lg produce; change both together.
import { useCallback, useEffect, useState } from 'react'

export type Site = {
  id: string
  name: string
  domain: string
  created_at: string
  /** Anyone with the link may read its dashboard, signed in or not. */
  public: boolean
}

export type Bucket = 'hour' | 'day'

export type Row = { name: string; visitors: number; pageviews: number }
export type EventRow = { name: string; count: number; visitors: number }
/** A top page; time is its visible seconds per measured visitor, null when none was measured. */
export type PageRow = Row & { time: number | null }

export type Stats = {
  period: { from: string; to: string; bucket: Bucket }
  /** Whether the site has any event at all, in any period. */
  has_events: boolean
  /**
   * bounce_rate is a whole percentage, 0-100; visit_duration the average
   * visible seconds per measured visit, null when none was measured.
   */
  totals: {
    visitors: number
    pageviews: number
    views_per_visitor: number
    bounce_rate: number
    visit_duration: number | null
  }
  /** The span just before the period, cut at the same point while it runs. */
  previous: { visitors: number; pageviews: number; visit_duration: number | null }
  timeseries: { t: string; visitors: number; pageviews: number }[]
  pages: PageRow[]
  referrers: Row[]
  countries: Row[]
  browsers: Row[]
  os: Row[]
  devices: Row[]
  events: EventRow[]
}

/** Who is on the site now: the last five minutes. */
export type Realtime = { online: number; pages: { name: string; visitors: number }[] }

export type Period =
  | { period: 'today' | '7d' | '30d' }
  | { period: 'custom'; from: string; to: string }

/** A non-2xx answer; `status` 401 means signed out. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = res.headers.get('Content-Type')?.startsWith('application/json')
    ? await res.json()
    : null
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText)
  return data as T
}

function periodQuery(p: Period): string {
  const q = new URLSearchParams({ period: p.period })
  if (p.period === 'custom') {
    q.set('from', p.from)
    q.set('to', p.to)
  }
  return q.toString()
}

export const api = {
  login: (password: string) => request<{ ok: true }>('POST', '/api/login', { password }),
  logout: () => request<{ ok: true }>('POST', '/api/logout'),
  me: () => request<{ ok: true }>('GET', '/api/me'),
  sites: () => request<Site[]>('GET', '/api/sites'),
  /** One site; without a session only a public one (else 401). */
  site: (id: string) => request<Site>('GET', `/api/sites/${id}`),
  // The dashboard knows sites by domain; the server names them after it.
  createSite: (domain: string) => request<Site>('POST', '/api/sites', { domain }),
  // `public` left out keeps the site as it is (JSON.stringify drops undefined).
  updateSite: (id: string, domain: string, isPublic?: boolean) =>
    request<Site>('PUT', `/api/sites/${id}`, { domain, public: isPublic }),
  deleteSite: (id: string) => request<{ ok: true }>('DELETE', `/api/sites/${id}`),
  stats: (id: string, p: Period) =>
    request<Stats>('GET', `/api/sites/${id}/stats?${periodQuery(p)}`),
  realtime: (id: string) => request<Realtime>('GET', `/api/sites/${id}/realtime`),
}

export type Loaded<T> = {
  data: T | undefined
  error: ApiError | Error | undefined
  loading: boolean
  reload: () => void
}

/**
 * Run `load` on mount and whenever `deps` change. A stale answer (one that
 * arrives after deps moved on) is ignored. Data from the last success stays
 * while a reload is in flight, so a period switch does not blank the page.
 */
export function useApi<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)

  useEffect(() => {
    let live = true
    setLoading(true)
    run().then(
      (d) => { if (live) { setData(d); setError(undefined); setLoading(false) } },
      (e) => { if (live) { setError(e); setLoading(false) } },
    )
    return () => { live = false }
  }, [run, tick])

  return { data, error, loading, reload: () => setTick((t) => t + 1) }
}
