// The dashboard's labels and badges, pinned. Run with `npm test` (node
// --test, which runs TypeScript directly on Node 24).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { change, duration, isCurrent, localDay, longDate, pageUrl, periodLabel, share, versus } from '../src/format.ts'

// Dates below are made in Amsterdam, whatever the machine's zone, so the DST
// days are the same everywhere. Node re-reads TZ when it changes.
process.env.TZ = 'Europe/Amsterdam'

const today = { period: 'today' } as const
const week = { period: '7d' } as const
const month = { period: '30d' } as const
const oneDay = { period: 'custom', from: '2026-09-09', to: '2026-09-09' } as const
const range = { period: 'custom', from: '2026-09-01', to: '2026-09-30' } as const

test('periodLabel', () => {
  assert.equal(periodLabel(today), 'Today')
  assert.equal(periodLabel(week), 'Last 7 days')
  assert.equal(periodLabel(month), 'Last 30 days')
  assert.equal(periodLabel(oneDay), 'Sep 9')
  assert.equal(periodLabel(range), 'Sep 1 – Sep 30')
})

test('change', () => {
  assert.deepEqual(change(1842, 1616), { up: true, pct: 14 })
  assert.deepEqual(change(80, 100), { up: false, pct: 20 })
  assert.deepEqual(change(1001, 1000), { up: true, pct: 0 })
  assert.deepEqual(change(1.7, 2.2), { up: false, pct: 23 })
  assert.equal(change(12, 0), undefined)
})

test('versus', () => {
  assert.equal(versus(today), 'vs yesterday so far')
  assert.equal(versus(week), 'vs previous 7 days')
  assert.equal(versus(month), 'vs previous 30 days')
  assert.equal(versus(oneDay), 'vs the day before')
  assert.equal(versus(range), 'vs previous 30 days')
  assert.equal(versus({ period: 'custom', from: '2026-09-01', to: '2026-09-02' }), 'vs previous 2 days')
})

test('share', () => {
  assert.equal(share(31, 100), '31%')
  assert.equal(share(1, 3), '33%')
  assert.equal(share(1, 1000), '<1%')
  assert.equal(share(0, 100), '0%')
  assert.equal(share(0, 0), '0%')
  assert.equal(share(1, 1), '100%')
})

test('duration', () => {
  assert.equal(duration(0), '0s')
  assert.equal(duration(45), '45s')
  assert.equal(duration(84), '1m 24s')
  assert.equal(duration(120), '2m 0s')
  assert.equal(duration(3900), '1h 5m')
})

test('isCurrent', () => {
  const day = '2026-09-30'
  assert.equal(isCurrent(today, day), true)
  assert.equal(isCurrent(week, day), true)
  assert.equal(isCurrent(month, day), true)
  assert.equal(isCurrent({ period: 'custom', from: '2026-09-01', to: '2026-09-29' }, day), false)
  assert.equal(isCurrent({ period: 'custom', from: '2026-09-01', to: '2026-09-30' }, day), true)
  assert.equal(isCurrent({ period: 'custom', from: '2026-09-01', to: '2026-10-05' }, day), true)
})

test('pageUrl', () => {
  assert.equal(pageUrl('example.com', '/pricing'), 'https://example.com/pricing')
  assert.equal(pageUrl('example.com', '/'), 'https://example.com/')
  assert.equal(pageUrl('example.com', '/#/about'), 'https://example.com/#/about')
})

test('localDay', () => {
  assert.equal(localDay(0, new Date(2026, 8, 30, 23, 30)), '2026-09-30')
  assert.equal(localDay(-6, new Date(2026, 8, 30)), '2026-09-24')
  // The day after the 23-hour spring-forward day: 24 hours back is the 28th.
  assert.equal(localDay(-1, new Date(2026, 2, 30, 0, 30)), '2026-03-29')
  // Into the 25-hour fall-back day.
  assert.equal(localDay(1, new Date(2026, 9, 24, 23, 30)), '2026-10-25')
  assert.match(localDay(), /^\d{4}-\d{2}-\d{2}$/)
})

test('longDate', () => {
  assert.equal(longDate('2026-09-30T13:00'), 'Sep 30, 13:00')
  assert.equal(longDate('2026-09-23'), 'Wed, Sep 23')
})
