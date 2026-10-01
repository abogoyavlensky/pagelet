import { useEffect, useState } from 'react'
import { api, type Realtime } from '../api'
import { count, people } from '../format'
import Popover from './Popover'

const EVERY_MS = 15_000

/**
 * Visitors in the last five minutes, polled every 15 s while the tab is
 * visible. With someone there it opens to the pages they are on; with
 * nobody it stays quiet text.
 */
export default function OnlineNow({ siteId }: { siteId: string }) {
  const [now, setNow] = useState<Realtime>()

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setInterval> | undefined
    const poll = () => api.realtime(siteId).then((r) => { if (live) setNow(r) }, () => {})
    const start = () => { if (!timer) { poll(); timer = setInterval(poll, EVERY_MS) } }
    const stop = () => { clearInterval(timer); timer = undefined }
    const onVisibility = () => (document.hidden ? stop() : start())
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { live = false; stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [siteId])

  const n = now?.online ?? 0
  if (n === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite" data-testid="online-now">
        <span className="inline-block size-2 rounded-full bg-faint" />
        <span><span className="num">{now === undefined ? '–' : 0}</span> online</span>
      </p>
    )
  }
  return (
    <Popover label={`${count(n)} online`} role="dialog" align="right" testId="online-now"
      className="gap-2 px-1 text-sm text-ink"
      trigger={<>
        <span className="pulse relative inline-block size-2 rounded-full bg-accent" />
        <span><span className="num">{count(n)}</span> online</span>
      </>}>
      <div className="px-3 py-2">
        <p className="text-ink">{people(n)} {n === 1 ? 'is' : 'are'} here now</p>
        {now && now.pages.length > 0 && (
          <ul className="mt-2 grid gap-1">
            {now.pages.map((p) => (
              <li key={p.name} className="flex items-baseline justify-between gap-6 text-muted">
                <span className="truncate" title={p.name}>{p.name}</span>
                <span className="num text-ink">{count(p.visitors)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Popover>
  )
}
