import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { Period, Site } from '../api'
import { RefreshButton, SettingsButton, SignOutButton } from './ActionsMenu'
import PeriodControl from './PeriodControl'
import SiteMark from './SiteMark'
import SiteSwitcher from './SiteSwitcher'
import Wordmark from './Wordmark'

/**
 * One bar across the top, the way analytics apps do it: the logo (to all
 * websites), the current site as a button that switches sites, then the
 * period, settings and sign-out. On a phone the site button takes the free
 * width and the period gets its own full-width row under it.
 *
 * A visitor on a public site (`viewer`) gets the same bar with nothing of
 * the owner's: the logo leads nowhere, the site is a plain label, and
 * "Sign in" stands where settings and sign-out would.
 *
 * Given `onRefresh`, a Refresh button stands after the period, for the
 * owner and a visitor alike; it turns while `refreshing`.
 *
 * The bar sticks to the top. It sits in the page's centred column, so its
 * background is a layer stretched to the screen's full width under it
 * (body clips the overflow); its bottom border shows once the page scrolls.
 */
export default function TopBar({ sites, site, period, onPeriod, live, onSaved, onRefresh, refreshing = false, viewer = false }: {
  sites?: Site[]
  site?: Site
  period?: Period
  onPeriod?: (p: Period) => void
  live?: boolean
  onSaved?: () => void
  onRefresh?: () => void
  refreshing?: boolean
  viewer?: boolean
}) {
  const key = period && (period.period === 'custom' ? `custom:${period.from}:${period.to}` : period.period)
  const showPeriod = live && period && onPeriod
  const [scrolled, setScrolled] = useState(() => window.scrollY > 4)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header className={`sticky top-0 z-30 mb-4 sm:mb-6 before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:border-b before:bg-paper before:transition-colors ${
      scrolled ? 'before:border-hairline' : 'before:border-transparent'}`}>
      <div className="flex h-16 items-center gap-2 lg:gap-3">
        {/* On a phone a site page needs the width for the site button, so
            the name shows there from sm up; with no site it always shows. */}
        {viewer ? (
          <Wordmark className="shrink-0 [&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        ) : (
          <Link to="/" aria-label="pagelet, all websites" className="shrink-0 rounded-lg">
            <Wordmark className={site ? '[&>span:last-child]:hidden sm:[&>span:last-child]:inline' : ''} />
          </Link>
        )}
        {viewer && site && (
          <>
            <span aria-hidden className="hidden text-faint sm:inline">/</span>
            <span data-testid="site-label"
              className="flex h-9 min-w-0 items-center gap-2 px-1 text-sm font-semibold text-ink">
              <SiteMark domain={site.domain} />
              <span className="min-w-0 truncate">{site.domain}</span>
            </span>
          </>
        )}
        {!viewer && sites && site && (
          <>
            <span aria-hidden className="hidden text-faint sm:inline">/</span>
            <SiteSwitcher sites={sites} current={site} className="flex min-w-0 flex-1 sm:flex-none" />
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1 lg:gap-2">
          {showPeriod && <PeriodControl key={key} value={period} onChange={onPeriod} className="hidden md:flex" />}
          {onRefresh && <RefreshButton onClick={onRefresh} busy={refreshing} />}
          {viewer ? (
            <Link to="/login"
              className="flex h-9 shrink-0 items-center rounded-[10px] px-3 text-sm font-medium text-muted transition-colors hover:bg-track hover:text-ink">
              Sign in
            </Link>
          ) : (
            <>
              {site && <SettingsButton site={site} onSaved={onSaved} />}
              <SignOutButton />
            </>
          )}
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
