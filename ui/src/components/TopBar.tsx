import { Link } from 'react-router'
import type { Period, Site } from '../api'
import ActionsMenu from './ActionsMenu'
import OnlineNow from './OnlineNow'
import PeriodMenu from './PeriodMenu'
import SiteSwitcher from './SiteSwitcher'
import Wordmark from './Wordmark'

/**
 * The wordmark, then one row of small controls: the site switcher on the
 * left; the period, who is online and the actions on the right. Without a
 * site (adding the first one) only the wordmark and sign-out remain; a site
 * still waiting for its first visit has no period or online count.
 */
export default function TopBar({ sites, site, period, onPeriod, live, onSaved }: {
  sites?: Site[]
  site?: Site
  period?: Period
  onPeriod?: (p: Period) => void
  live?: boolean
  onSaved?: () => void
}) {
  const key = period && (period.period === 'custom' ? `custom:${period.from}:${period.to}` : period.period)
  return (
    <header className="pt-8 pb-10 sm:pb-12">
      <Link to="/" aria-label="pagelet, home" className="inline-block">
        <Wordmark />
      </Link>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">{sites && site && <SiteSwitcher sites={sites} current={site} />}</div>
        <div className="flex items-center gap-4 sm:gap-6">
          {live && period && onPeriod && <PeriodMenu key={key} value={period} onChange={onPeriod} />}
          {live && site && <OnlineNow siteId={site.id} />}
          <ActionsMenu site={site} onSaved={onSaved} />
        </div>
      </div>
    </header>
  )
}
