import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api, ApiError, type Site } from '../api'
import { useSession } from '../session'
import Dialog from './Dialog'
import Popover, { MenuDivider, MenuItem } from './Popover'
import Snippet from './Snippet'

/**
 * The secondary actions, out of the way behind "···": the tracking code and
 * the site's settings (when there is a site), and signing out.
 */
export default function ActionsMenu({ site, onSaved }: { site?: Site; onSaved?: () => void }) {
  const { setState } = useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState<'none' | 'code' | 'settings'>('none')
  const [failed, setFailed] = useState(false)

  // Signed out only once the server says so: a failed request leaves the
  // session cookie valid, so pretending otherwise would sign back in on
  // reload. A 401 means the session was already gone.
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
    <div className="flex items-center gap-3">
      {failed && <span role="alert" className="text-sm text-danger">Could not sign out. Try again.</span>}
      <Popover label="Site actions" align="right" className="px-1.5 text-lg leading-none tracking-widest text-muted"
        trigger={<span aria-hidden>···</span>}>
        {site && (
          <>
            <MenuItem onClick={() => setOpen('code')}>Tracking code</MenuItem>
            <MenuItem onClick={() => setOpen('settings')}>Site settings</MenuItem>
            <MenuDivider />
          </>
        )}
        <MenuItem onClick={signOut}>Sign out</MenuItem>
      </Popover>
      {site && (
        <>
          <Dialog open={open === 'code'} onClose={() => setOpen('none')} title="Tracking code">
            <p className="mb-3 text-sm text-muted">
              Add this to the <code className="font-mono text-ink">&lt;head&gt;</code> of every page on{' '}
              <span className="text-ink">{site.domain}</span>.
            </p>
            <Snippet />
          </Dialog>
          <Dialog open={open === 'settings'} onClose={() => setOpen('none')} title="Site settings">
            <Settings site={site} onSaved={() => { setOpen('none'); onSaved?.() }} />
          </Dialog>
        </>
      )}
    </div>
  )
}

const input = 'rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:outline-none transition-colors'

/** Move the site to another domain, or delete it (typing the domain to confirm). */
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
    <div className="grid gap-8">
      <form onSubmit={save} className="grid gap-2">
        <label htmlFor="settings-domain" className="text-sm text-muted">Domain</label>
        <div className="flex gap-2">
          <input id="settings-domain" value={domain} onChange={(e) => setDomain(e.target.value)}
            autoCapitalize="none" spellCheck={false} className={`${input} min-w-0 flex-1 focus:border-accent`} />
          <button type="submit" disabled={busy || domain.trim() === site.domain}
            className="rounded-lg bg-ink px-4 text-sm font-medium text-paper transition-opacity disabled:opacity-40">
            Save
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
      <div className="border-t border-hairline pt-6">
        <h3 className="text-sm font-medium">Delete this site</h3>
        <p className="mt-1 text-sm text-muted">
          Removes the site and every event recorded for it. Type{' '}
          <span className="text-ink">{site.domain}</span> to confirm.
        </p>
        <div className="mt-3 flex gap-2">
          <input aria-label="Type the domain to confirm" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} autoCapitalize="none" spellCheck={false}
            className={`${input} min-w-0 flex-1 focus:border-danger`} />
          <button type="button" onClick={remove} disabled={confirm.trim().toLowerCase() !== site.domain}
            className="rounded-lg bg-danger px-4 text-sm font-medium text-paper transition-opacity disabled:opacity-30">
            Delete site
          </button>
        </div>
        {removeError && <p role="alert" className="mt-3 text-sm text-danger">{removeError}</p>}
      </div>
    </div>
  )
}
