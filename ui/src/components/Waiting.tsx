import { useEffect, useState } from 'react'
import type { Site } from '../api'
import { useSignedOutOn } from '../session'
import Snippet from './Snippet'

const EVERY_MS = 5_000

/**
 * A site with no events yet: the tracking code, then a quiet wait. `load`
 * asks for the report again every 5 s while the tab is visible, and at once
 * when it becomes visible again; `has_events` turns true once the site has
 * any event, however long ago. Then the wait turns into "You're live", and
 * only the button opens the dashboard, from that same answer.
 */
export default function Waiting<T extends { stats: { has_events: boolean } }>({ site, load, onOpen }: {
  site?: Site
  load: () => Promise<T>
  onOpen: (report: T) => void
}) {
  const [live, setLive] = useState<T>()
  // A 401 here means the session ended while waiting: sign out like any
  // other request would, instead of waiting forever.
  const [failed, setFailed] = useState<unknown>()
  useSignedOutOn(failed)

  useEffect(() => {
    if (live) return
    let on = true
    let timer: ReturnType<typeof setInterval> | undefined
    const poll = () => load().then((r) => { if (on && r.stats.has_events) setLive(r) }, (e) => { if (on) setFailed(e) })
    const start = () => { if (!timer) { poll(); timer = setInterval(poll, EVERY_MS) } }
    const stop = () => { clearInterval(timer); timer = undefined }
    const onVisibility = () => (document.hidden ? stop() : start())
    if (!document.hidden) timer = setInterval(poll, EVERY_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { on = false; stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [live, load])

  return (
    <section data-testid="waiting" className="max-w-2xl">
      <h1 className="font-display text-4xl leading-[1.15] tracking-tight text-ink sm:text-5xl">
        {site ? `${site.domain} is ready` : ' '}
      </h1>
      <p className="mt-8 text-muted">
        Add this to the <code className="font-mono text-[0.9em] text-ink">&lt;head&gt;</code> of every page:
      </p>
      <div className="mt-3"><Snippet /></div>
      <div role="status" className="mt-12">
        {live ? (
          <div className="live">
            <p className="flex items-center gap-2.5 font-medium text-ink">
              <svg aria-hidden viewBox="0 0 16 16" className="size-4 text-accent">
                <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              You're live
            </p>
            <p className="mt-1 pl-6.5 text-muted">Your first visit has been received.</p>
            <button type="button" onClick={() => onOpen(live)}
              className="mt-6 ml-6.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper">
              View dashboard
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2.5 text-muted">
            <span className="pulse relative inline-block size-2 rounded-full bg-accent" />
            Waiting for the first visit…
          </p>
        )}
      </div>
    </section>
  )
}
