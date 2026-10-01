import { Link } from 'react-router'
import type { Period, Site } from '../api'
import { SettingsButton, SignOutButton } from './ActionsMenu'
import PeriodControl from './PeriodControl'
import SiteSwitcher from './SiteSwitcher'
import Wordmark from './Wordmark'

/**
 * One bar across the top, the way analytics apps do it: the logo (to all
 * websites), the current site as a button that switches sites, then the
 * period, settings and sign-out. On a phone the period gets its own
 * full-width row under it.
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
  const showPeriod = live && period && onPeriod
  return (
    <header className="mb-4 sm:mb-6">
      <div className="flex h-16 items-center gap-2 sm:gap-3">
        <Link to="/" aria-label="pagelet, all websites" className="shrink-0 rounded-lg">
          <Wordmark className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>
        {sites && site && (
          <>
            <span aria-hidden className="text-faint">/</span>
            <SiteSwitcher sites={sites} current={site} />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {showPeriod && <PeriodControl key={key} value={period} onChange={onPeriod} className="hidden md:flex" />}
          {site && <SettingsButton site={site} onSaved={onSaved} />}
          <SignOutButton />
        </div>
      </div>
      {showPeriod && (
        <div className="pb-3 md:hidden">
          <PeriodControl key={key} value={period} onChange={onPeriod} className="w-full" />
        </div>
      )}
    </header>
  )
}
