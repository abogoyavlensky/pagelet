import { useState } from 'react'
import { useLocation } from 'react-router'
import { api, type Site } from '../api'
import { count } from '../format'
import Popover, { Chevron, MenuDivider, MenuItem } from './Popover'
import SiteMark from './SiteMark'

/**
 * The current site's domain, opening every site's domain with who is on
 * each right now (asked once per opening), then "Add website". Switching
 * keeps the period.
 */
export default function SiteSwitcher({ sites, current, className = '' }: { sites: Site[]; current: Site; className?: string }) {
  const { search } = useLocation()
  const [online, setOnline] = useState<Record<string, number>>({})
  const ask = () => {
    Promise.all(
      sites.map((s) => api.realtime(s.id).then((r) => [s.id, r.online] as const, () => [s.id, 0] as const)),
    ).then((pairs) => setOnline(Object.fromEntries(pairs)))
  }
  return (
    <Popover label={`Switch website, ${current.domain}`} onOpen={ask} wrapperClassName={className}
      className="h-9 w-full max-w-full gap-2 rounded-[10px] border border-hairline bg-surface px-3 text-sm font-semibold text-ink hover:border-faint sm:w-auto"
      trigger={<>
        <SiteMark domain={current.domain} />
        <span className="min-w-0 truncate">{current.domain}</span>
        <Chevron />
      </>}>
      {sites.map((s) => (
        <MenuItem key={s.id} to={`/sites/${s.id}${search}`} checked={s.id === current.id}>
          <span className="flex items-center justify-between gap-6">
            <span className="flex min-w-0 items-center gap-2"><SiteMark domain={s.domain} /><span className="truncate">{s.domain}</span></span>
            {online[s.id] > 0 && (
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                <span className="inline-block size-1.5 rounded-full bg-accent" />
                <span className="num">{count(online[s.id])} online</span>
              </span>
            )}
          </span>
        </MenuItem>
      ))}
      <MenuDivider />
      <MenuItem to="/">All websites</MenuItem>
      <MenuItem to="/sites/new">Add website</MenuItem>
    </Popover>
  )
}
