import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, useApi } from '../api'
import TopBar from '../components/TopBar'
import { useSignedOutOn } from '../session'

/** One field: the domain. The dashboard then waits for its first visit. */
export default function AddSite() {
  const navigate = useNavigate()
  const sites = useApi(() => api.sites(), [])
  useSignedOutOn(sites.error)
  const [domain, setDomain] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const site = await api.createSite(domain.trim())
      navigate(`/sites/${site.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the website.')
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar />
      <form onSubmit={submit} className="max-w-md">
        <h1 className="font-display text-4xl tracking-tight">Add a website</h1>
        <label htmlFor="site-domain" className="mt-10 block text-sm text-muted">Domain</label>
        <input id="site-domain" value={domain} onChange={(e) => { setDomain(e.target.value); setError(undefined) }}
          placeholder="example.com" autoFocus autoCapitalize="none" spellCheck={false}
          aria-invalid={!!error} aria-describedby={error ? 'site-error' : undefined}
          className="mt-2 block w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-ink outline-none transition-colors focus-visible:outline-none focus:border-accent" />
        <p id="site-error" role="alert" className="mt-2 min-h-5 text-sm text-danger">{error}</p>
        <div className="mt-4 flex items-center gap-5">
          <button type="submit" disabled={busy || domain.trim() === ''}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-40">
            Add website
          </button>
          {sites.data && sites.data.length > 0 && (
            <Link to="/" className="text-sm text-muted transition-colors hover:text-ink">Cancel</Link>
          )}
        </div>
      </form>
    </>
  )
}
