// The dashboard's wording, pinned. Run with `npm test` (node --test, which
// runs TypeScript directly on Node 24).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comparison, people, periodLabel, periodPhrase, share } from '../src/format.ts'

const today = { period: 'today' } as const
const week = { period: '7d' } as const
const month = { period: '30d' } as const
const oneDay = { period: 'custom', from: '2026-09-09', to: '2026-09-09' } as const
const range = { period: 'custom', from: '2026-09-01', to: '2026-09-30' } as const

test('people', () => {
  assert.equal(people(1842), '1,842 people')
  assert.equal(people(2), '2 people')
  assert.equal(people(1), '1 person')
  assert.equal(people(0), 'Nobody')
})

test('periodPhrase', () => {
  assert.equal(periodPhrase(today), 'today')
  assert.equal(periodPhrase(week), 'in the last 7 days')
  assert.equal(periodPhrase(month), 'in the last 30 days')
  assert.equal(periodPhrase(oneDay), 'on Sep 9')
  assert.equal(periodPhrase(range), 'from Sep 1 to Sep 30')
})

test('periodLabel', () => {
  assert.equal(periodLabel(today), 'Today')
  assert.equal(periodLabel(week), 'Last 7 days')
  assert.equal(periodLabel(month), 'Last 30 days')
  assert.equal(periodLabel(oneDay), 'Sep 9')
  assert.equal(periodLabel(range), 'Sep 1 – Sep 30')
})

test('comparison', () => {
  assert.equal(comparison(1842, 1616, month), '14% more than the 30 days before.')
  assert.equal(comparison(80, 100, week), '20% fewer than the 7 days before.')
  assert.equal(comparison(1001, 1000, week), 'About the same as the 7 days before.')
  assert.equal(comparison(12, 0, week), undefined)
  assert.equal(comparison(30, 20, today), '50% more than by this time yesterday.')
  assert.equal(comparison(10, 20, oneDay), '50% fewer than the day before.')
  assert.equal(comparison(30, 10, range), '200% more than the 30 days before.')
  assert.equal(comparison(5, 10, { period: 'custom', from: '2026-09-01', to: '2026-09-02' }),
    '50% fewer than the 2 days before.')
})

test('share', () => {
  assert.equal(share(31, 100), '31%')
  assert.equal(share(1, 3), '33%')
  assert.equal(share(1, 1000), '<1%')
  assert.equal(share(0, 100), '0%')
  assert.equal(share(0, 0), '0%')
  assert.equal(share(1, 1), '100%')
})
