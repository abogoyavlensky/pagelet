import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import type { Period, Site } from '../api'
import { SettingsButton, SignOutButton } from './ActionsMenu'
import PeriodControl from './PeriodControl'
import SiteSwitcher from './SiteSwitcher'
import Wordmark from './Wordmark'

/**
 * One bar across the top, the way analytics apps do it: the logo (to all
 * websites), the current site as a button that switches sites, then the
 * period, settings and sign-out. On a phone the site button takes the free
 * width and the period gets its own full-width row under it.
 *
 * The bar sticks to the top. It sits in the page's centred column, so its
 * background is a layer stretched to the screen's full width under it
 * (body clips the overflow); its bottom border shows once the page scrolls.
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
  const [scrolled, setScrolled] = useState(() => window.scrollY > 4)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header className={`sticky top-0 z-30 mb-4 sm:mb-6 before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:border-b before:bg-paper before:transition-colors ${
      scrolled ? 'before:border-hairline' : 'before:border-transparent'}`}>
      <div className="flex h-16 items-center gap-2 sm:gap-3">
        <Link to="/" aria-label="pagelet, all websites" className="shrink-0 rounded-lg">
          <Wordmark className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>
        {sites && site && (
          <>
            <span aria-hidden className="hidden text-faint sm:inline">/</span>
            <SiteSwitcher sites={sites} current={site} className="flex min-w-0 flex-1 sm:flex-none" />
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
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
