// Number, date and country formatting for the dashboard. Every date the
// server sends is UTC and naive ("2026-09-23", "2026-09-30T13:00"); they are
// shown as written, never shifted into the browser's zone. Countries arrive
// as ISO codes ("NL") and are named here, so the UI carries no country table.
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
