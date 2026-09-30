import { useState, type FormEvent } from 'react'

/** Name and domain for a new site or an existing one. */
export default function SiteForm({
  initial = { name: '', domain: '' },
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; domain: string }
  submitLabel: string
  onSubmit: (name: string, domain: string) => Promise<unknown>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [domain, setDomain] = useState(initial.domain)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await onSubmit(name.trim(), domain.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the site.')
    } finally {
      setBusy(false)
    }
  }

  const field = 'mt-1 block w-full border-b border-hairline bg-transparent py-1.5 outline-none focus-visible:outline-none transition-colors focus:border-accent'
  const label = 'block text-xs font-medium tracking-[0.12em] text-muted uppercase'

  return (
    <form onSubmit={submit} className="grid gap-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label htmlFor="site-name" className={label}>Name</label>
        <input id="site-name" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="My blog" autoFocus className={field} />
      </div>
      <div>
        <label htmlFor="site-domain" className={label}>Domain</label>
        <input id="site-domain" value={domain} onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com" autoCapitalize="none" spellCheck={false}
          className={`${field} font-mono text-[0.95em]`} />
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={busy}
          className="bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-accent disabled:opacity-40">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel}
          className="px-2 py-2 text-sm text-muted transition-colors hover:text-ink">
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-800 sm:col-span-3">{error}</p>}
    </form>
  )
}
