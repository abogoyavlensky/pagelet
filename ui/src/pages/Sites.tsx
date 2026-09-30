import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, useApi } from '../api'
import SiteForm from '../components/SiteForm'
import Snippet from '../components/Snippet'
import { useSignedOutOn } from '../session'

export default function Sites() {
  const sites = useApi(() => api.sites(), [])
  useSignedOutOn(sites.error)
  const [adding, setAdding] = useState(false)
  const [online, setOnline] = useState<Record<string, number>>({})

  // Who is on each site right now, asked once per list load.
  useEffect(() => {
    if (!sites.data) return
    let live = true
    Promise.all(
      sites.data.map((s) => api.realtime(s.id).then((r) => [s.id, r.online] as const, () => [s.id, 0] as const)),
    ).then((pairs) => { if (live) setOnline(Object.fromEntries(pairs)) })
    return () => { live = false }
  }, [sites.data])

  const list = sites.data ?? []

  return (
    <div>
      <div className="rise flex items-end justify-between border-b border-ink pb-4">
        <h1 className="font-display text-5xl font-medium tracking-tight">Sites</h1>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-accent">
            Add site
          </button>
        )}
      </div>

      {adding && (
        <div className="rise border-b border-hairline py-6">
          <SiteForm
            submitLabel="Add"
            onCancel={() => setAdding(false)}
            onSubmit={async (name, domain) => {
              await api.createSite(name, domain)
              setAdding(false)
              sites.reload()
            }}
          />
        </div>
      )}

      {sites.error && !(sites.error as { status?: number }).status && (
        <p className="py-6 text-sm text-red-800">Could not load the sites.</p>
      )}

      {sites.data && list.length === 0 && !adding && (
        <section className="rise max-w-2xl py-12" style={{ animationDelay: '60ms' }}>
          <h2 className="font-display text-2xl">No sites yet</h2>
          <p className="mt-3 leading-relaxed text-muted">
            Add a site by its domain, then put this tag in the <code className="font-mono text-ink">&lt;head&gt;</code> of
            every page. It is under 2 KB, sets no cookies, and counts single-page app navigation too.
          </p>
          <div className="mt-6"><Snippet /></div>
        </section>
      )}

      <ul>
        {list.map((site, i) => (
          <li key={site.id} className="rise border-b border-hairline" style={{ animationDelay: `${60 * (i + 1)}ms` }}>
            <Link to={`/sites/${site.id}`}
              className="group -mx-3 flex items-baseline justify-between gap-6 px-3 py-5 transition-colors hover:bg-accent-soft/40">
              <span className="flex min-w-0 items-baseline gap-4">
                <span className="font-display text-2xl tracking-tight group-hover:text-accent">{site.name}</span>
                <span className="truncate font-mono text-sm text-muted">{site.domain}</span>
              </span>
              <span className="flex shrink-0 items-center gap-4 text-sm">
                {online[site.id] > 0 && (
                  <span className="flex items-center gap-2 text-accent">
                    <span className="relative inline-block size-2 rounded-full bg-accent" />
                    <span className="num">{online[site.id]} online</span>
                  </span>
                )}
                <span aria-hidden className="text-muted transition-transform group-hover:translate-x-1">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
