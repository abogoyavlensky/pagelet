# Engagement Metrics Implementation Plan

**Status: completed 2026-10-02;** see the summary at the end.

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dashboard shows how long visitors stay: a Visit duration tile and the time on page for each top page, measured by the tracker in the browser.

**Tech Stack:** let-go 1.13.0 with lgx 0.4.2, DuckDB through ragtime migrations, the tracker `resources/public/p.js`, React 19 / TypeScript / Tailwind in `ui/`, Playwright in `e2e/`.

**Repo:** `~/Projects/pagelet`. Work on a branch `engagement-metrics` off `master` (at or after `3d72c17`, which has migration 006), and open a PR as the earlier work did. Run every command through mise (`mise exec -- lgx ...`).

---

## Design

### Approach

The tracker measures, per page view, how long the page was visible, and posts that to the same `/api/event` endpoint when the page view ends or the tab is hidden. The server stores these beacons in their own table, `engagements`, and two new report queries read it. Nothing that exists today changes meaning: the `events` table, the bounce rate, the custom events list, visitors and who-is-online are untouched, because engagement rows never enter `events`.

Durations come from the browser's clock. The server's `ts` is the flush clock (one reading per flush, `ingest.lg`), so it cannot order or time anything; it only places a beacon in a period.

### What is measured

- **Engaged time**: milliseconds the page was visible (`document.visibilityState == "visible"`) during one page view. A tab in the background accrues nothing.

### The tracker (`resources/public/p.js`)

State, all per page view: `at` (the `location.href` when the page view was sent), `ah` (its `location.hash`), `t` (when the current visible stretch began, 0 when none is running), `ms` (engaged time not yet sent).

- `start()`: when a page view is open (`at` is set), no stretch is running and the document is visible, `t = performance.now()`. Without the `at` check, a manual-mode page that is hidden and shown before its first page view would count that time towards it.
- `stop()`: when a stretch is running, add `performance.now() - t` to `ms` and set `t = 0`. `performance.now()`, not `Date.now()`: a system clock change cannot distort a duration.
- `flush()`: `stop()`, and when `at` is set and `ms > 0`, post `{d, u: at, e: Math.round(ms)}` (plus `h: ah` in hash mode) and set `ms = 0`. Each beacon is a **delta**: the visible time since the last one.

Wiring:

- In `send`, for a `pageview` (automatic or `pagelet("pageview")` in manual mode): `flush()` first, which closes the previous page view under its own URL; then send the page view; then `at = l.href`, `ah = l.hash`, `ms = 0`, `start()`.
- `visibilitychange`: hidden runs `flush()`, visible runs `start()`.
- `pagehide` runs `flush()`; `pageshow` runs `start()` (a page restored from the back/forward cache).
- The posting code (beacon, then `fetch` with `keepalive`) moves into one function that `send` and `flush` share.
- `off` (file: pages, localhost without `data-dev`) still sends nothing. A manual-mode page that never sends a page view never sends engagement (`at` is unset).

**The host page is never affected.** The script adds no scroll, timer or unload listeners: `pagehide` and `visibilitychange` keep the page eligible for the back/forward cache, and nothing runs while the visitor reads. The wrappers around `history.pushState` and `replaceState` run inside the host app's own call, and `window.pagelet(...)` is called from the host's own code, so a tracker failure must never throw into either. `send` and `flush` each wrap their whole body in a `try/catch` that swallows the error; every path into the tracker (the history wrappers, `popstate`, `hashchange`, the visibility and page listeners, the first `view()`, the queue, and the host's `pagelet` calls) goes through one of the two. This also hardens the code that exists today.

The script grows from 2204 bytes to roughly 2.7 KB. Comments are not cut to hide it; the README's size claims change to the measured figure.

### The wire format

An engagement beacon is a payload with a numeric `e`:

```json
{"d": "example.com", "u": "https://example.com/pricing", "e": 12400}
```

`h` as today in hash mode. No `n`, `r`, `z` or `p`. Anything with an `e` key is an engagement and never an event, whatever else it carries.

### Ingest (`src/pagelet/ingest.lg`)

`parse-event` gains a branch, taken when the payload has an `e` key, after the same body-size, JSON, and `d`/`u` checks:

- `e` must be a number of at least 1 after coercion to an integer; otherwise `{:error "invalid engagement"}`. It is clamped to 1,800,000 (30 minutes) before the integer coercion, so an absurdly large number cannot overflow it: one visible stretch longer than that is a forgotten tab, not reading.
- Unknown site and bot answers are the same `{:drop ...}` as for events.
- The result is `{:ok row}` with the row `{:site-id :ip :ua :path :engaged-ms}`; `:path` comes from `path-with-hash`, as for events. Returning `:ok` keeps `routes.lg` unchanged: it enqueues whatever `:ok` holds.

JSON numbers may arrive as floats (docs/KNOWLEDGE.md, the DuckDB table); coerce with `int` only after `number?`, and let the test prove the stored value is an integer.

The buffer stays one vector. `flush!` filters to live sites and hashes as today, then splits the rows by whether they have `:engaged-ms`: event rows go through `insert-batch!` unchanged, engagement rows through a new `insert-engagements!` with the same batch size, the same `ts`, and the same log-and-drop on a failed batch. It returns the total written. `ingest.lg` owns every write to `engagements`, as it does for `events`.

### Storage (migration `007-create-engagements`)

```sql
create table engagements (
  site_id varchar not null,
  ts timestamp not null,
  visitor varchar not null,
  path varchar not null,
  engaged_ms integer not null)
```

Appended after `006-add-sites-public` in `migrations.lg`. `db/delete-site!` deletes a site's engagements in the same transaction as its events.

### Reports (`src/pagelet/stats.lg`)

Both queries reuse the `in-period` predicate; `engagements` has the same `site_id` and `ts` columns.

- **Visit duration**: the average, over visitors with any engagement in the period, of their total engaged time, in whole seconds; nil when there is none.

  ```sql
  select cast(round(avg(ms) / 1000) as integer) as s
  from (select sum(engaged_ms) as ms from engagements where <in-period> group by visitor)
  ```

  `totals` returns it as `:visit_duration` beside the four existing keys, and `previous` carries `:visit_duration` for the span before.

- **Time on page**: per path, the total engaged time divided by the visitors with engagement on that path, in whole seconds.

  ```sql
  select path, cast(round(sum(engaged_ms) / count(distinct visitor) / 1000) as integer) as time
  from engagements where <in-period> group by path
  ```

  `pages` merges this onto its ten rows by path. Every page row carries `:time`, nil when the path has no engagement: `{:name "/" :visitors 2 :pageviews 13 :time 42}`. The other ranked lists are unchanged.

The denominators count only visitors who were measured, so a lost beacon lowers no average.

### Dashboard (`ui/`)

- `api.ts`: `totals.visit_duration` and `previous.visit_duration` are `number | null` (seconds); `PageRow = Row & { time: number | null }`; `pages: PageRow[]`.
- `format.ts`: `duration(seconds)` gives `"45s"`, `"1m 24s"`, `"1h 5m"`.
- `StatCards.tsx`: a fifth tile, **Visit duration** (`data-testid="stat-duration"`), with its own colour family (`duration`, three tokens in each theme in `index.css`). It shows `duration(totals.visit_duration)` and the usual change badge against `previous.visit_duration` (`null` counts as 0, which the badge already words as "No earlier data"); when the period has none, the value is `–` and the line under it says "Not measured in this period". The grid becomes `grid-cols-2 lg:grid-cols-5`, the fifth tile spanning both columns below `lg`.
- `Breakdown.tsx`: a `Pages` component for the pages card: the list as today with a third column, **Time** (`duration(r.time)`, `–` for null), after Visitors and Views. Same rows, order and bars; the card keeps `testId="pages"`.

### Key decisions

- **A separate table, not a reserved event name.** No existing query has to learn to skip engagement rows, the bounce definition cannot break, and a client cannot fake or collide with a reserved name. The cost is a second insert statement and one more delete.
- **Bounce rate keeps its definition.** An engagement-based bounce is a product change of its own; not here.
- **Visible time, not focused or active time.** No idle detection and no focus tracking: a visible tab left open counts, up to the 30-minute clamp per stretch. Documented as a limitation.
- **Averages, not medians**, matching what other tools call visit duration.
- **No scroll depth.** It needs a scroll listener on the host page, a second stored value and its own column, for the least actionable of the three numbers. Left out; the table can take a column later.
- **The second request stays.** The last page of a visit, and every one-page visit, has no later page view to carry its time, so without a beacon most of the data is lost. It is one small `sendBeacon` when a page view ends or the tab hides, which does not delay navigation.
- **Deltas plus per-visitor sums.** Mobile browsers often never fire `pagehide`, so the tracker sends on every hide; summing per visitor and path makes several beacons of one page view add up without a page view id.
- **A beacon after UTC midnight** hashes to the new day's visitor. It then counts as its own short visit in the averages; it never touches visitor counts, which read `events` only.

### Not in scope

Scroll depth, engagement-based bounce, engagement by source/country/device, a time series of duration, idle detection, entry and exit pages, retention or rollups for the new table.

### Testing

Server tests for the parse branch, the split flush, the delete and the two reports; a unit test for `duration`; browser tests that the real tracker produces time through a single-page navigation and a page unload, and that the dashboard shows the tile and the time column; and that a throwing tracker does not break the host's `pushState`.

---

## File Structure

| File | Change |
|---|---|
| `src/pagelet/migrations.lg` | migration `007-create-engagements` |
| `src/pagelet/db.lg` | `delete-site!` also deletes engagements |
| `src/pagelet/ingest.lg` | the engagement branch of `parse-event`; `insert-engagements!`; `flush!` splits rows |
| `src/pagelet/stats.lg` | `visit-duration`, page engagement merged into `pages`, `:visit_duration` in `totals` and `previous` |
| `resources/public/p.js` | measuring and sending engagement |
| `ui/src/api.ts`, `ui/src/format.ts`, `ui/src/index.css` | types, `duration`, colour tokens |
| `ui/src/components/StatCards.tsx`, `ui/src/components/Breakdown.tsx`, `ui/src/pages/Site.tsx` | the tile, the `Pages` card, its use |
| `test/pagelet/{db,ingest,stats,routes}_test.lg`, `ui/test/format.test.ts` | unit tests |
| `e2e/tests/tracker.spec.js`, `e2e/tests/dashboard.spec.js` | browser tests |
| `README.md`, `docs/KNOWLEDGE.md`, `AGENTS.md` | docs |

`routes.lg` does not change.

---

### Task 1: The engagements table

**Files:**
- Modify: `src/pagelet/migrations.lg`, `src/pagelet/db.lg`
- Test: `test/pagelet/db_test.lg`

- [x] **Step 1: Branch**
  `git checkout master && git pull --ff-only && git checkout -b engagement-metrics`

- [x] **Step 2: Migration**
  Append `007-create-engagements` after `006-add-sites-public`, with the `create table` from Design and `drop table engagements` as its down. Comment in the file's style: one row per engagement beacon; `engaged_ms` is a delta; written only by `ingest.lg`.

- [x] **Step 3: Delete with the site**
  `db/delete-site!` deletes from `engagements` where `site_id = ?` inside the existing transaction, before the site row. Update its docstring.

- [x] **Step 4: Tests**
  In `db_test.lg`, extend the site-delete test (or add one beside it): insert an engagement row for the site and one for another site, delete the site, and assert only the other site's row remains. If the file has a test that counts migrations or rolls all of them back, update its count.

- [x] **Step 5: Run**
  Run: `mise exec -- lgx test`
  Expected: PASS.

- [x] **Step 6: Commit**
  `git commit -m "Engagements: a table of its own (migration 007)"`

> Deviation: there was no site-delete test in `db_test.lg`; added `deleting-a-site-takes-its-engagements`. `sites-are-private-until-made-public` rolled back one migration to reach "before 006"; it now rolls back two.

### Task 2: Ingest engagement beacons

**Files:**
- Modify: `src/pagelet/ingest.lg`
- Test: `test/pagelet/ingest_test.lg`, `test/pagelet/routes_test.lg`

- [x] **Step 1: Parse tests first**
  In `ingest_test.lg`, with the existing `parse` helper:
  - `{:d "example.com" :u "https://example.com/pricing?x=1" :e 12400}` gives exactly `{:ok {:site-id "site1" :ip "1.2.3.4" :ua chrome :path "/pricing" :engaged-ms 12400}}`, with `(integer? ...)` true for the number;
  - hash mode: `:h "#/about"` ends up in `:path`;
  - `:e 5000000` is stored as 1800000; `:e 1500.7` as an integer;
  - `:e 0`, `:e -5`, `:e "12"` and `:e nil` (the key present) each give an `:error`;
  - an unknown domain gives `{:drop :unknown-site}` and a bot agent `{:drop :bot}`;
  - a payload with both `:n "signup"` and `:e 100` is an engagement row (no `:name`).
  Run `mise exec -- lgx test`; expected: these fail.

- [x] **Step 2: The parse branch**
  Implement as in Design, "Ingest". Keep the existing checks' order; decide engagement by `(contains? p :e)` after the `d`/`u` check. Extract what the two branches share (site lookup, user agent classification, bot drop) rather than copying it. Update the namespace comment and the `parse-event` docstring: a beacon with `e` becomes an engagement row.

- [x] **Step 3: The split flush**
  `insert-engagements!` writes `(site_id, ts, visitor, path, engaged_ms)` in multi-row batches like `insert-batch!`. In `flush!`, after filtering and hashing, split by `(contains? row :engaged-ms)`; write events, then engagements, each in `batch-size` batches with the existing try/log/drop; return the sum. Update the `flush!` docstring and the namespace comment ("a flush loop owns every write to `events` and `engagements`").

- [x] **Step 4: Buffer test**
  In `ingest_test.lg`: enqueue two event rows and two engagement rows (one for a deleted site); `flush!` returns 3; `events` has 2 rows and `engagements` 1, whose `visitor` equals the event row's from the same IP and agent, whose `ts` equals the events' `ts`, and which holds no IP or agent.

- [x] **Step 5: Route test**
  In `routes_test.lg`, beside the existing `/api/event` test: POST an engagement payload as `text/plain`, expect 202; POST one with `"e": 0`, expect 400.

- [x] **Step 6: Run**
  Run: `mise exec -- lgx test`
  Expected: PASS.

- [x] **Step 7: Commit**
  `git commit -m "Ingest: engagement beacons into their own table"`

> Deviation: the batch loop moved into `insert-all!`, shared by events and engagements; its log line says "rows" instead of "events". The route test's flush now writes 2 rows (the page view and the beacon), and its stats check gains `:time 1` and `:visit_duration 1`.

### Task 3: Reports

**Files:**
- Modify: `src/pagelet/stats.lg`
- Test: `test/pagelet/stats_test.lg`

- [x] **Step 1: Tests first**
  Add an `engagement` test over a fresh migrated database with a small `insert-engagement!` helper (`site`, `ts`, `visitor`, `path`, `ms`). Seed on 2026-09-10, plus page views so `pages` has rows:
  - visitor `va`: `/` 30000 ms, then `/` 30000 ms (two beacons of one page view), `/docs` 20000 ms;
  - visitor `vb`: `/` 20000 ms;
  - visitor `vc`: page views on `/pricing` only, no engagement;
  - site `s2`: one engagement, never counted;
  - 2026-09-09, visitor `vp`: `/` 10000 ms.
  Expected for the day 2026-09-10: `:visit_duration` 50 (va 80 s, vb 20 s); `/` has `:time 40`; `/docs` has `:time 20`; `/pricing` has `:time nil`; `(:previous ...)` carries `:visit_duration 10`.
  Update the existing exact-map assertions: `:totals` gains `:visit_duration nil`, `:previous` gains `:visit_duration nil`, and every expected `:pages` row gains `:time nil`.
  Run `mise exec -- lgx test`; expected: the new and updated assertions fail.

- [x] **Step 2: Implement**
  As in Design, "Reports": a `visit-duration` fn; `totals` assocs it; `previous` selects `:visit_duration` too; a private page-engagement query whose rows `pages` merges by path, `:time nil` when absent. Update the namespace comment (what visit duration and time on page mean, and that they read `engagements`) and the `totals` and `pages` docstrings.

- [x] **Step 3: Run**
  Run: `mise exec -- lgx test`
  Expected: PASS.

- [x] **Step 4: Commit**
  `git commit -m "Stats: visit duration and time on page"`

> Deviation: the plan's expected `:previous` for the 9th said a visitor; `vp` has a beacon but no page view there, so it is `{:visitors 0 :pageviews 0 :visit_duration 10}`.

### Task 4: The tracker

**Files:**
- Modify: `resources/public/p.js`, `e2e/tests/tracker.spec.js`

- [x] **Step 1: Implement**
  As in Design, "The tracker". Keep the file's style: `var`, short names, a comment per block.

- [x] **Step 2: Browser tests**
  In `tracker.spec.js`:
  - the existing test's `expect(s.pages).toEqual(...)` compares only `name`, `visitors` and `pageviews` (map the rows first); the rest stays;
  - a new test, "time on page": new site, route the fixture, `goto /`, wait 1200 ms, click `#about`, then `page.goto('about:blank')`. Poll `stats` until the `/` row has `time >= 1`; then assert `totals.visit_duration >= 1`, and poll until the `/about` row's `time` is not null (the unload beacon; its value may be 0). Delete the site;
  - a new test, "a failing tracker never breaks navigation": before loading the fixture, `page.addInitScript` replaces `navigator.sendBeacon` and `window.fetch` with functions that throw; `goto /`, click `#about`, and call `pagelet('signup')` through the `#signup` button, and expect the URL to be `/about` and no `pageerror` to have fired.

- [x] **Step 3: Run**
  Run: `mise exec -- lgx e2e`
  Expected: PASS, all three tracker tests included. If the unload beacon never arrives in headless Chromium, check which of `pagehide` and `visibilitychange` fired before changing the design, and record the finding for Task 6.

- [x] **Step 4: Measure**
  Run: `wc -c resources/public/p.js` and note the number for the README (Task 6).

- [x] **Step 5: Commit**
  `git commit -m "Tracker: engaged time"`

> Deviation: the tracker is 3695 bytes, not ~2.7 KB; comments were kept as the plan says, and the README says "under 4 KB". The time-on-page test leaves for a routed `http://elsewhere.test/` instead of `about:blank`, because Chromium aborts the `pagehide` beacon on a navigation to `about:blank` (docs/KNOWLEDGE.md). Codex found the two new tests ignored `E2E_PORT` (master's SPA test already rewrites the fixture's port); fixed in `be94bf5`. The guard test was checked against the old tracker, where it fails.

### Task 5: The dashboard

**Files:**
- Modify: `ui/src/api.ts`, `ui/src/format.ts`, `ui/src/index.css`, `ui/src/components/StatCards.tsx`, `ui/src/components/Breakdown.tsx`, `ui/src/pages/Site.tsx`
- Test: `ui/test/format.test.ts`, `e2e/tests/dashboard.spec.js`

- [x] **Step 1: `duration` with its test**
  `duration(seconds: number): string`: under 60 `"45s"`; under 3600 `"1m 24s"` (`"2m 0s"` for 120); otherwise `"1h 5m"`. Add a test in `format.test.ts` covering 0, 45, 84, 120, 3900.
  Run: `mise exec -- lgx ui-test`
  Expected: PASS.

- [x] **Step 2: Types**
  `api.ts` as in Design, "Dashboard".

- [x] **Step 3: The tile**
  `index.css`: `--color-duration`, `--color-duration-soft`, `--color-duration-deep` in both themes, a teal family distinct from the other four (start from light `#0e8a9c` / `#e2f4f7` / `#0a6573`, dark `#2aa5b8` / `#10272c` / `#93d9e4`, and check the contrast of the label on the tile in both themes). `StatCards.tsx`: the `duration` look, the fifth tile and the grid as in Design; `Tile` takes a `className`; the component comment says five.

- [x] **Step 4: The pages card**
  `Breakdown.tsx`: export `Pages({ rows }: { rows: PageRow[] })` built on `List`, title "Pages", columns Visitors, Views, Time: the first two cells as `Breakdown` renders them today, the third `duration(r.time)` or `–` for null, muted. `Site.tsx` renders `<Pages rows={stats.pages} />` in place of the pages `Breakdown`.

- [x] **Step 5: Browser test**
  In `dashboard.spec.js`, in the test that posts page views through the API: before any engagement, `stat-duration` reads `Visit duration` and `–`. Then POST `{d, u: https://<domain>/pricing, e: 90000}` to `/api/event`, reload after the flush (poll the stats API for `totals.visit_duration === 90`), and expect `stat-duration` to contain `1m 30s`; and the pages card's `/pricing` row to contain `1m 30s`. The pages card still has three rows.

- [x] **Step 6: Look at it**
  Run `mise exec -- lgx run` and `mise exec -- lgx ui-dev`, open a site with data at desktop and phone widths, light and dark: five tiles sit in one row at `lg`, the fifth spans the row on a phone, and on a phone the pages card's three columns still leave the path readable (about 100 px or more).

- [x] **Step 7: Run everything**
  Run: `mise exec -- lgx check`
  Expected: PASS (server tests, dashboard unit tests, browser tests).

- [x] **Step 8: Commit**
  `git commit -m "Dashboard: visit duration and time on page"`

> Deviation: on a phone the Pages card leaves about 90 px for a long path, a little under the ~100 px aimed for; the full path is in its title, and it was accepted.

### Task 6: Docs

**Files:**
- Modify: `README.md`, `docs/KNOWLEDGE.md`, `AGENTS.md`

- [x] **Step 1: README**
  - The intro and "Tracking a site": the tracker's size from Task 4, Step 4, in the existing wording ("under 3 KB" or what the number supports), and that the script also reports how long a page was visible.
  - "The dashboard": the fifth tile and the pages card's Time column, with the definitions (visit duration is the average visible time per measured visit; time on page per measured visitor of that page).
  - "What is collected": a paragraph for the engagement beacon: site, time, visitor id, path, visible milliseconds; nothing else.
  - "Limitations": remove "No time on page."; add that time is visible time, not active time, capped at 30 minutes per stretch, that a visit crossing UTC midnight counts as two, and that there is no scroll depth.

- [x] **Step 2: KNOWLEDGE**
  A dated section "Engagement" with only what was verified while doing the work: which events delivered the unload beacon in headless Chromium, how JSON numbers arrived in `parse-event`, the tracker's size, anything DuckDB did with `avg`/`round` over integers.

- [x] **Step 3: AGENTS.md**
  The request-path rule names `engagements` beside `events` as written only by `ingest.lg`.

- [x] **Step 4: Commit**
  `git commit -m "docs: engagement metrics"`

- [x] **Step 5: PR**
  Push the branch and open a PR against `master`, as the earlier work did.

---

## Summary

Implemented on `engagement-metrics`: migration 007 (`engagements`), the engagement branch of `parse-event` and a flush that writes events and engagements apart, `visit_duration` in totals and the previous span, `time` on every top page, a tracker that measures visible time with `performance.now()` and posts deltas on page change, hide and `pagehide` (never throwing into the host page), the Visit duration tile and the Pages card's Time column, and the docs. `lgx check` passes: 49 server tests (318 assertions), 5 dashboard unit tests, 7 browser tests. Checked by eye against the built binary at desktop (light) and phone (dark) widths.

Issues met: Chromium aborts an unload beacon on a navigation to `about:blank`, so the browser test leaves for another site; a codex review on Task 3 was killed by the foreground timeout and re-run in the background.

Deviations, in one place:
- Task 1: a new site-delete test; the public-flag test rolls back two migrations.
- Task 2: a shared `insert-all!` (log line says "rows"); the route test's flush writes 2.
- Task 3: the plan's expected previous-span visitors was wrong (0, not 1).
- Task 4: 3695 bytes, README "under 4 KB"; the test leaves for a real page; the new tests follow `E2E_PORT` (fixup `be94bf5`).
- Task 5: about 90 px for a long path on a phone, accepted.

What the plan could have specified better: the tracker's size from a measured draft rather than an estimate, and how the browser test leaves the page (it named `about:blank`, which cannot carry an unload beacon in Chromium).
