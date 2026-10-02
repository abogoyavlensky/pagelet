import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api, ApiError, type Site } from '../api'
import { useSession } from '../session'
import Dialog from './Dialog'
import { CogIcon, SignOutIcon } from './Icons'
import Snippet from './Snippet'

// Settings and sign-out are one pair of plain icon buttons; on a wide
// screen Settings also says its name.
const iconButton = 'flex h-9 min-w-9 shrink-0 items-center justify-center gap-2 rounded-[10px] px-2 text-sm font-medium text-muted transition-colors hover:bg-track hover:text-ink'

/** "Settings": the tracking code, the domain, and deleting the site, in one dialog. */
export function SettingsButton({ site, onSaved }: { site: Site; onSaved?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${iconButton} md:px-3`} aria-label="Site settings">
        <CogIcon />
        <span aria-hidden className="hidden md:inline">Settings</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`${site.domain} settings`}>
        <Settings site={site} onSaved={() => { setOpen(false); onSaved?.() }} />
      </Dialog>
    </>
  )
}

/** Signed out only once the server says so (a 401 means it already was). */
export function SignOutButton() {
  const { setState } = useSession()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  // A failed request leaves the session cookie valid, so pretending
  // otherwise would sign back in on reload.
  const signOut = async () => {
    try {
      await api.logout()
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setFailed(true)
        return
      }
    }
    setState('out')
    navigate('/login')
  }
  return (
    <span className="flex items-center gap-2">
      {failed && <span role="alert" className="text-sm text-danger">Could not sign out.</span>}
      <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className={iconButton}>
        <SignOutIcon />
      </button>
    </span>
  )
}

const input = 'min-w-0 flex-1 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:outline-none transition-colors'

function Settings({ site, onSaved }: { site: Site; onSaved: () => void }) {
  const navigate = useNavigate()
  const [domain, setDomain] = useState(site.domain)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [removeError, setRemoveError] = useState<string>()

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await api.updateSite(site.id, domain.trim())
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the site.')
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    try {
      await api.deleteSite(site.id)
      navigate('/')
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Could not delete the site.')
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0">
      <section>
        <h3 className="text-sm font-semibold">Tracking code</h3>
        <p className="mt-1 mb-3 text-sm text-muted">
          Add this to the <code className="font-mono text-[0.9em] text-ink">&lt;head&gt;</code> of every page.
        </p>
        <Snippet />
      </section>
      <form onSubmit={save} className="border-t border-hairline pt-6">
        <label htmlFor="settings-domain" className="text-sm font-semibold">Domain</label>
        <div className="mt-2 flex gap-2">
          <input id="settings-domain" value={domain} onChange={(e) => setDomain(e.target.value)}
            autoCapitalize="none" spellCheck={false} className={`${input} focus:border-accent`} />
          <button type="submit" disabled={busy || domain.trim() === site.domain}
            className="rounded-lg bg-ink px-4 text-sm font-medium text-paper transition-opacity disabled:opacity-40">
            Save
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </form>
      <section className="border-t border-hairline pt-6">
        <h3 className="text-sm font-semibold text-danger">Delete this site</h3>
        <p className="mt-1 text-sm text-muted">
          Removes the site and every event recorded for it. Type <span className="font-medium text-ink">{site.domain}</span> to confirm.
        </p>
        <div className="mt-3 flex gap-2">
          <input aria-label="Type the domain to confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            autoCapitalize="none" spellCheck={false} className={`${input} focus:border-danger`} />
          <button type="button" onClick={remove} disabled={confirm.trim().toLowerCase() !== site.domain}
            className="rounded-lg bg-danger px-4 text-sm font-medium text-paper transition-opacity disabled:opacity-30">
            Delete site
          </button>
        </div>
        {removeError && <p role="alert" className="mt-3 text-sm text-danger">{removeError}</p>}
      </section>
    </div>
  )
}
