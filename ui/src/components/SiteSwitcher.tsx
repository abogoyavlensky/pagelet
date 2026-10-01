import { useState } from 'react'
import { useLocation } from 'react-router'
import { api, type Site } from '../api'
import { count } from '../format'
import Popover, { Chevron, MenuDivider, MenuItem } from './Popover'

/**
 * The current site's domain, opening every site's domain with who is on
 * each right now (asked once per opening), then "Add website". Switching
 * keeps the period.
 */
export default function SiteSwitcher({ sites, current }: { sites: Site[]; current: Site }) {
  const { search } = useLocation()
  const [online, setOnline] = useState<Record<string, number>>({})
  const ask = () => {
    Promise.all(
      sites.map((s) => api.realtime(s.id).then((r) => [s.id, r.online] as const, () => [s.id, 0] as const)),
    ).then((pairs) => setOnline(Object.fromEntries(pairs)))
  }
  return (
    <Popover label={`Switch website, ${current.domain}`} onOpen={ask}
      className="-ml-1 px-1 text-lg font-medium text-ink"
      trigger={<><span className="max-w-[60vw] truncate">{current.domain}</span><Chevron /></>}>
      {sites.map((s) => (
        <MenuItem key={s.id} to={`/sites/${s.id}${search}`} checked={s.id === current.id}>
          <span className="flex items-baseline justify-between gap-6">
            <span className="truncate">{s.domain}</span>
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
      <MenuItem to="/sites/new">Add website</MenuItem>
    </Popover>
  )
}
