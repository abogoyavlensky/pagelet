// The dashboard's view of the server: one typed helper per endpoint and a
// small hook for loading data. Types mirror the JSON that
// src/pagelet/stats.lg and routes.lg produce; change both together.
import { useCallback, useEffect, useState } from 'react'

export type Site = {
  id: string
  name: string
  domain: string
  created_at: string
}

export type Bucket = 'hour' | 'day'

export type Row = { name: string; visitors: number; pageviews: number }
export type EventRow = { name: string; count: number; visitors: number }

export type Stats = {
  period: { from: string; to: string; bucket: Bucket }
  totals: { visitors: number; pageviews: number; views_per_visitor: number }
  timeseries: { t: string; visitors: number; pageviews: number }[]
  pages: Row[]
  referrers: Row[]
  browsers: Row[]
  os: Row[]
  devices: Row[]
  events: EventRow[]
}

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
  createSite: (name: string, domain: string) =>
    request<Site>('POST', '/api/sites', { name, domain }),
  updateSite: (id: string, name: string, domain: string) =>
    request<Site>('PUT', `/api/sites/${id}`, { name, domain }),
  deleteSite: (id: string) => request<{ ok: true }>('DELETE', `/api/sites/${id}`),
  stats: (id: string, p: Period) =>
    request<Stats>('GET', `/api/sites/${id}/stats?${periodQuery(p)}`),
  realtime: (id: string) => request<{ online: number }>('GET', `/api/sites/${id}/realtime`),
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
