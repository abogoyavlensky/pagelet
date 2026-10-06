// Number, date, country and badge helpers for the dashboard. Every date
// the server sends is naive and already in the viewer's time zone, the one
// the dashboard asks in ("2026-09-23", "2026-09-30T13:00"), so it is shown
// as written. Countries
// arrive as ISO codes ("NL") and are named here, so the UI carries no
// country table. No runtime imports: test/format.test.ts loads this file
// straight into Node.
import type { Period } from './api'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function count(n: number): string {
  return n.toLocaleString('en-US')
}

function parts(t: string) {
  const [y, m, d] = t.slice(0, 10).split('-').map(Number)
  return { y, m, d, hour: t.length > 10 ? t.slice(11, 16) : undefined }
}

/** "Sep 23" for a day, "13:00" for an hour. */
export function tick(t: string): string {
  const { m, d, hour } = parts(t)
  return hour ?? `${MONTHS[m - 1]} ${d}`
}

/** "Wed, Sep 23" for a day, "Sep 30, 13:00" for an hour. */
export function longDate(t: string): string {
  const { y, m, d, hour } = parts(t)
  if (hour) return `${MONTHS[m - 1]} ${d}, ${hour}`
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}`
}

/** The browser's IANA time zone, "Europe/Amsterdam"; UTC when it has none. */
export function zone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * The day of `base` in the browser's zone, YYYY-MM-DD, shifted by `days`
 * calendar days. Shifted by the calendar, not by 24-hour steps, which skip
 * or repeat a day around a clock change.
 */
export function localDay(days = 0, base = new Date()): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Whether the period reaches today (the viewer's), so its numbers can still change. */
export function isCurrent(p: Period, today = localDay()): boolean {
  return p.period !== 'custom' || p.to >= today
}

const regions = new Intl.DisplayNames(['en'], { type: 'region' })

/** "🇳🇱 Netherlands" for "NL": the flag from regional indicators, then the name. */
export function country(code: string): string {
  const cc = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return code
  const flag = String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
  let name: string | undefined
  try { name = regions.of(cc) } catch { name = undefined }
  return `${flag} ${name || cc}`
}

/** The period as a control's label: "Last 7 days", "Sep 1 – Sep 30". */
export function periodLabel(p: Period): string {
  switch (p.period) {
    case 'today': return 'Today'
    case '7d': return 'Last 7 days'
    case '30d': return 'Last 30 days'
    case 'custom':
      return p.from === p.to ? tick(p.from) : `${tick(p.from)} – ${tick(p.to)}`
  }
}

/** Inclusive days from `from` to `to`, both YYYY-MM-DD. */
function days(from: string, to: string): number {
  const at = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
  return Math.round((at(to) - at(from)) / 86_400_000) + 1
}

/** The change from `then` to `now` as a whole percentage, or undefined with nothing before. */
export function change(now: number, then: number): { up: boolean; pct: number } | undefined {
  if (!then) return undefined
  return { up: now >= then, pct: Math.round((Math.abs(now - then) / then) * 100) }
}

/** What a change badge compares with: the span of the same length just before `p`. */
export function versus(p: Period): string {
  switch (p.period) {
    case 'today': return 'vs yesterday so far'
    case '7d': return 'vs previous 7 days'
    case '30d': return 'vs previous 30 days'
    case 'custom': {
      const n = days(p.from, p.to)
      return n === 1 ? 'vs the day before' : `vs previous ${n} days`
    }
  }
}

/** `part` of `whole` as a whole percentage; "<1%" for a sliver. */
export function share(part: number, whole: number): string {
  if (whole === 0 || part === 0) return '0%'
  const pct = (part / whole) * 100
  return pct < 0.5 ? '<1%' : `${Math.round(pct)}%`
}

/** Whole seconds as "45s", "1m 24s" or "1h 5m". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

/**
 * Where a page lives on its site: "https://example.com/pricing". The site
 * stores only a hostname, so https is assumed; the path is appended as the
 * server sends it, with the hash route already in it in hash mode.
 */
export function pageUrl(domain: string, path: string): string {
  return `https://${domain}${path}`
}
