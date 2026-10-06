import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type Announcements, type DragEndEvent, type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError, useApi, type Site, type Stats } from '../api'
import { GripIcon } from '../components/Icons'
import SiteMark from '../components/SiteMark'
import TopBar from '../components/TopBar'
import { change, count } from '../format'
import { useRefresh } from '../refresh'
import { useSignedOutOn } from '../session'

/** A small area line of the last 7 days' visitors. */
function Sparkline({ points }: { points: number[] }) {
  const w = 120, h = 40
  const max = Math.max(1, ...points)
  const step = points.length > 1 ? w / (points.length - 1) : w
  const xy = points.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} className="h-10 w-28 overflow-visible">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--color-visitors-soft)" />
      <path d={line} fill="none" stroke="var(--color-visitors)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * One site's last 7 days; asks again whenever `tick` moves, keeping its
 * numbers meanwhile. The whole card opens the site; with `movable` a grip
 * handle in its corner drags it into another place (not while `locked`).
 * A button cannot sit in a link, so the handle is the link's sibling, laid
 * over the card.
 */
function SiteCard({ site, tick, movable, locked }: { site: Site; tick: number; movable: boolean; locked: boolean }) {
  const [stats, setStats] = useState<Stats>()
  const [failed, setFailed] = useState<unknown>()
  const [online, setOnline] = useState(0)
  const [tries, setTries] = useState(0)
  useSignedOutOn(failed)
  useEffect(() => {
    let live = true
    api.stats(site.id, { period: '7d' }).then((s) => { if (live) setStats(s) }, (e) => { if (live) setFailed(e) })
    api.realtime(site.id).then((r) => { if (live) setOnline(r.online) }, () => {})
    return () => { live = false }
  }, [site.id, tries, tick])

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: site.id, disabled: locked })

  const t = stats?.totals
  const c = t && change(t.visitors, stats.previous.visitors)
  return (
    <div ref={setNodeRef} data-testid="site-card" style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative rounded-card ${isDragging ? 'z-10 shadow-float' : ''}`}>
      <Link to={`/sites/${site.id}`}
        className="group block h-full rounded-card border border-hairline bg-surface p-5 transition-colors hover:border-faint">
        <div className={`flex items-start justify-between gap-3 ${movable ? 'pr-8' : ''}`}>
          <div className="flex min-w-0 items-center gap-3">
            <SiteMark domain={site.domain} size="lg" />
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-2">
                <span className="truncate font-semibold text-ink">{site.domain}</span>
                {site.public && (
                  <span className="shrink-0 rounded-full bg-track px-1.5 py-0.5 text-[11px] font-medium text-muted">Public</span>
                )}
              </p>
              <p className="text-xs text-muted">Last 7 days</p>
            </div>
          </div>
          {online > 0 && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-up-soft px-2 py-0.5 text-xs font-medium text-up">
              <span className="size-1.5 rounded-full bg-pageviews" />
              {count(online)} online
            </span>
          )}
        </div>
        {failed && !stats ? (
          <p className="mt-6 rounded-xl bg-paper px-3 py-3 text-sm text-danger">
            Could not load this site's numbers.{' '}
            <button type="button" onClick={(e) => { e.preventDefault(); setFailed(undefined); setTries((n) => n + 1) }}
              className="font-medium underline underline-offset-2">
              Retry
            </button>
          </p>
        ) : stats && !stats.has_events ? (
          <p className="mt-6 rounded-xl bg-paper px-3 py-3 text-sm text-muted">Waiting for the first visit</p>
        ) : (
          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[28px] leading-none font-semibold tracking-tight text-ink">{t ? count(t.visitors) : '–'}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                visitors
                {c && (
                  <span className={`rounded-full px-1.5 py-0.5 font-semibold ${c.up ? 'bg-up-soft text-up' : 'bg-down-soft text-down'}`}>
                    {c.up ? '↑' : '↓'} {count(c.pct)}%
                  </span>
                )}
              </p>
            </div>
            {stats && <Sparkline points={stats.timeseries.map((p) => p.visitors)} />}
          </div>
        )}
      </Link>
      {movable && (
        <button ref={setActivatorNodeRef} {...attributes} {...listeners} type="button" disabled={locked}
          aria-label={`Reorder ${site.domain}`} title="Drag to reorder" data-testid="site-handle"
          className="absolute top-3 right-3 grid size-8 touch-none cursor-grab place-items-center rounded-lg text-faint transition-colors hover:bg-track hover:text-muted focus-visible:text-muted active:cursor-grabbing disabled:cursor-default disabled:hover:bg-transparent">
          <GripIcon />
        </button>
      )}
    </div>
  )
}

/**
 * "/": every website at a glance, the way analytics apps open, in the
 * owner's order. A card dragged by its handle saves the new order on drop;
 * a failed save puts the cards back.
 */
export default function Sites() {
  const sites = useApi(() => api.sites(), [])
  // Every card asks again when this moves: each minute, on return to the
  // tab, and on Refresh. The list itself refreshes too, so a site added
  // elsewhere shows up.
  const [tick, setTick] = useState(0)
  // From picking a card up until its new order is saved, the list holds
  // still: no refresh lands under the drag or on top of an unsaved order,
  // and a second drag waits for the first save.
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState<unknown>()
  const busy = dragging || saving
  useRefresh(() => { sites.refresh(); setTick((t) => t + 1) }, !busy)
  useSignedOutOn(sites.error)
  useSignedOutOn(saveFailed)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const list = sites.data ?? []
  const domain = (id: UniqueIdentifier) => list.find((s) => s.id === id)?.domain ?? 'the website'
  // dnd-kit's own words name the item by its id.
  const where = (active: UniqueIdentifier, over: UniqueIdentifier | undefined) =>
    over === undefined ? 'over no website' : over === active ? 'in its place' : `over ${domain(over)}`
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${domain(active.id)}.`,
    onDragOver: ({ active, over }) => `${domain(active.id)} is ${where(active.id, over?.id)}.`,
    onDragEnd: ({ active, over }) => `${domain(active.id)} was dropped ${where(active.id, over?.id)}.`,
    onDragCancel: ({ active }) => `Moving ${domain(active.id)} was cancelled.`,
  }

  const dragStart = () => {
    setDragging(true)
    setSaveFailed(undefined)
    // Drops a list request already out, so it cannot land mid-drag.
    if (sites.data) sites.mutate(sites.data)
  }
  const dragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(false)
    const before = sites.data
    if (!before || !over || active.id === over.id) return
    const next = arrayMove(before, before.findIndex((s) => s.id === active.id), before.findIndex((s) => s.id === over.id))
    sites.mutate(next)
    setSaving(true)
    api.reorderSites(next.map((s) => s.id))
      .then((saved) => sites.mutate(saved), (e) => { sites.mutate(before); setSaveFailed(e) })
      .finally(() => setSaving(false))
  }

  return (
    <>
      <TopBar onRefresh={() => { if (busy) return; sites.reload(); setTick((t) => t + 1) }}
        refreshing={sites.loading || saving} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Websites</h1>
          <p className="mt-1 text-sm text-muted">Visitors over the last 7 days.</p>
        </div>
        <Link to="/sites/new"
          className="flex h-9 items-center gap-1.5 rounded-[10px] bg-ink px-3.5 text-sm font-medium text-paper transition-opacity hover:opacity-90">
          <span aria-hidden className="text-base leading-none">+</span> Add website
        </Link>
      </div>
      {sites.error && !(sites.error instanceof ApiError && sites.error.status === 401) && (
        <p role="alert" className="mt-6 text-sm text-danger">
          Could not load the websites.{' '}
          <button onClick={sites.reload} className="underline underline-offset-2">Retry</button>
        </p>
      )}
      {saveFailed !== undefined && !(saveFailed instanceof ApiError && saveFailed.status === 401) && (
        <p role="alert" className="mt-6 text-sm text-danger">Could not save the order.</p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} accessibility={{ announcements }}
        onDragStart={dragStart} onDragEnd={dragEnd} onDragCancel={() => setDragging(false)}>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          <SortableContext items={list.map((s) => s.id)} strategy={rectSortingStrategy}>
            {list.map((s) => <SiteCard key={s.id} site={s} tick={tick} movable={list.length > 1} locked={saving} />)}
          </SortableContext>
          {sites.data && (
            <Link to="/sites/new"
              className="grid min-h-24 place-items-center rounded-card border-2 border-dashed sm:min-h-40 border-hairline text-sm font-medium text-muted transition-colors hover:border-faint hover:text-ink">
              + Add website
            </Link>
          )}
        </div>
      </DndContext>
    </>
  )
}
