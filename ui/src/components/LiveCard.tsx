import { useEffect, useState } from 'react'
import { api, type Realtime } from '../api'
import { count } from '../format'
import Card from './Card'

const EVERY_MS = 15_000

/**
 * Who is on the site in the last five minutes, and where; polled every 15 s
 * while the tab is visible. A changed `nudge` (the Refresh button) asks at
 * once and starts the 15 s over; the last answer stays on screen meanwhile.
 */
export default function LiveCard({ siteId, nudge = 0, className = '' }: { siteId: string; nudge?: number; className?: string }) {
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
  }, [siteId, nudge])

  const n = now?.online ?? 0
  return (
    <Card className={className} testId="online-now"
      title={
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <span className={`relative inline-block size-2 rounded-full ${n > 0 ? 'pulse bg-pageviews' : 'bg-faint'}`} />
          Right now
        </h2>
      }
      action={<span className="text-xs text-muted">Last 5 minutes</span>}>
      <p aria-live="polite">
        <span className="num text-[34px] leading-none font-semibold tracking-tight text-ink">{now ? count(n) : '–'}</span>
        <span className="ml-2 text-sm text-muted">{n === 1 ? 'person online' : 'people online'}</span>
      </p>
      {now && now.pages.length > 0 ? (
        <ul className="mt-4 grid grid-cols-1 gap-1">
          {now.pages.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-4 rounded-lg bg-paper px-2.5 py-1.5 text-sm">
              <span className="truncate text-ink" title={p.name}>{p.name}</span>
              <span className="num font-medium text-ink">{count(p.visitors)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">{now ? 'Nobody on the site right now.' : ' '}</p>
      )}
    </Card>
  )
}
