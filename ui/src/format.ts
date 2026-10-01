// Number, date, country and wording helpers for the dashboard. Every date
// the server sends is UTC and naive ("2026-09-23", "2026-09-30T13:00"); they
// are shown as written, never shifted into the browser's zone. Countries
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

/** "Wed, Sep 23" for a day, "Sep 30, 13:00 UTC" for an hour. */
export function longDate(t: string): string {
  const { y, m, d, hour } = parts(t)
  if (hour) return `${MONTHS[m - 1]} ${d}, ${hour} UTC`
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MONTHS[m - 1]} ${d}`
}

/** Today in UTC, YYYY-MM-DD, shifted by `days`. */
export function utcDay(days = 0): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
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

/** "1,842 people", "1 person", "Nobody": the headline's subject. */
export function people(n: number): string {
  if (n === 0) return 'Nobody'
  return n === 1 ? '1 person' : `${count(n)} people`
}

/** The period as the end of a sentence: "visited in the last 7 days". */
export function periodPhrase(p: Period): string {
  switch (p.period) {
    case 'today': return 'today'
    case '7d': return 'in the last 7 days'
    case '30d': return 'in the last 30 days'
    case 'custom':
      return p.from === p.to ? `on ${tick(p.from)}` : `from ${tick(p.from)} to ${tick(p.to)}`
  }
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

/** What `p` is compared with: the span of the same length just before it. */
function before(p: Period): string {
  switch (p.period) {
    case 'today': return 'by this time yesterday'
    case '7d': return 'the 7 days before'
    case '30d': return 'the 30 days before'
    case 'custom': {
      const n = days(p.from, p.to)
      return n === 1 ? 'the day before' : `the ${n} days before`
    }
  }
}

/**
 * "14% more than the 30 days before." for `now` against `then`, or
 * undefined when there is nothing before to compare with.
 */
export function comparison(now: number, then: number, p: Period): string | undefined {
  if (then === 0) return undefined
  const pct = Math.round((Math.abs(now - then) / then) * 100)
  if (pct === 0) return `About the same as ${before(p)}.`
  return `${pct}% ${now > then ? 'more' : 'fewer'} than ${before(p)}.`
}

/** `part` of `whole` as a whole percentage; "<1%" for a sliver. */
export function share(part: number, whole: number): string {
  if (whole === 0 || part === 0) return '0%'
  const pct = (part / whole) * 100
  return pct < 0.5 ? '<1%' : `${Math.round(pct)}%`
}
