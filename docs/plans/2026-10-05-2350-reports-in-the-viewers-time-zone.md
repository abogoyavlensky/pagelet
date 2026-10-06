# Reports in the Viewer's Time Zone Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dashboard shows every report in the time zone of the browser viewing it: "today" is the viewer's today, days start at the viewer's midnight, and the hourly chart is labelled in the viewer's hours.

**Tech Stack:** DuckDB's ICU time zone functions in `src/pagelet/stats.lg`; the query string in `src/pagelet/routes.lg`; `Intl.DateTimeFormat` in the React dashboard (`ui/src/api.ts`, `ui/src/format.ts`); Playwright's `timezoneId` for the browser test.

**Repo:** `~/Projects/pagelet`. Work on a branch `viewer-time-zone` off `master` and open a PR, as the earlier work did. Run every command through mise (`mise exec -- lgx ...`).

---

## Design

### The problem

Every report is in UTC. `stats.lg` cuts periods at UTC midnight (`period`, `span`, `today`), buckets the chart by UTC day or hour, and the dashboard shows those labels as written (`format.ts`: "never shifted into the browser's zone"), with "UTC" in the chart's hour readout, the chart table's header and the custom range's hint. For an owner in Amsterdam or Tokyo, "today" starts at 02:00 or 09:00 and the hourly chart is shifted by hours. The docs call this out as a limitation (`docs/dashboard.md`, README).

### The approach: the browser names its zone, the server does the arithmetic

The dashboard sends its IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`, for example `Europe/Amsterdam`) as a `tz` query parameter on `GET /api/sites/:id/stats`. The server computes the period's day boundaries in that zone, converts them to UTC instants for the `where` clause, and labels the chart's buckets in local time. The dashboard shows the labels as written, exactly as it does now; only the server's notion of a day moves.

Why the server and not the browser: a UTC-bucketed day cannot be re-cut into local days in the browser; it would need raw events or hourly data for every period, and `count(distinct visitor)` cannot be re-aggregated from hours. Why the browser's zone and not a per-site setting: that is what was asked for, it needs no schema, no settings UI and no migration, and every viewer sees their own days. The cost: two people in different zones see different "today" numbers for the same public dashboard, and a shared link to `?period=custom&from=..&to=..` means those days in the reader's zone. A per-site zone setting could be added later on top of this (the server already takes a zone; a setting would just supply it), so nothing here forecloses it.

### DuckDB

Verified on 2026-10-05 against the duckdb package's build (recorded in `docs/KNOWLEDGE.md` by Task 5):

- The ICU extension is in: `pg_timezone_names()` lists 638 zones, including legacy names browsers report (`Asia/Calcutta`, `Europe/Kiev`, `US/Pacific`) and `UTC`, `Etc/UTC`, `GMT`. An unknown zone in a conversion throws `Not implemented Error: Unknown TimeZone`.
- **`at time zone ?` cannot take a bound zone**: with `?::timestamp at time zone ?` DuckDB types the second parameter as a timestamp too and fails on the string (also with `?::varchar`). The function form binds fine: `timezone(zone, ts)`.
- The two conversions, both session-independent (`set TimeZone` does not change them; `now()::timestamp` does follow the session zone, so it is never used):
  - naive local → naive UTC: `timezone('UTC', timezone(?, ?::timestamp))` with `[zone local]`; `"2026-09-10T00:00:00"` in `Europe/Amsterdam` is `2026-09-09T22:00:00`.
  - naive UTC → naive local: `timezone(?, timezone('UTC', ts))` with `[zone]`; `2026-09-10 22:30:00` is `2026-09-11T00:30` in Amsterdam.
  - the current local day: `timezone(?, now())::date`.
- DST: a local time that does not exist (`2026-03-29 02:30` in Amsterdam) converts as if it did (01:30 UTC); on the fall-back day the two UTC hours 00:30 and 01:30 both label `02:30` local, so an hourly chart merges them into one bar. A few zones change their clocks at midnight (`America/Havana` repeats 00:00-01:00 when DST ends; `America/Santiago` and `America/Asuncion` skip midnight when it starts), so there one hour of the change day converts onto the neighbouring day's side of the boundary. This plan accepts that as a limitation (one hour, twice a year, in a handful of zones) and notes it in `docs/dashboard.md`; it does not special-case it. `generate_series` over naive local timestamps gives 24 hour buckets and N day buckets regardless of DST.

### The period

`stats/period` takes the zone and returns, besides what it returns today, the local boundaries it was built from:

```clojure
{:from "2026-09-09T22:00:00"          ; naive UTC, inclusive: the where clause
 :to-exclusive "2026-09-11T22:00:00"  ; naive UTC
 :bucket "day"                        ; or "hour"
 :zone "Europe/Amsterdam"
 :local-from "2026-09-10T00:00:00"    ; naive local: the chart's first bucket
 :local-to-exclusive "2026-09-12T00:00:00"}
```

`span` builds `:local-from`/`:local-to-exclusive` from the two days as it builds `:from`/`:to-exclusive` now, then converts each to UTC with the first DuckDB form above. `today` and the `7d`/`30d` arithmetic run on the zone's current day (`timezone(?, now())::date`), so "today" is the viewer's today and "last 7 days" ends with it. Custom days are the viewer's days. With `"UTC"` every value equals today's, so the existing tests keep their expectations once they pass the zone.

`previous-period` works in local time, so the comparison span is the same number of local days, not the same number of hours: on a 23-hour DST day, "vs yesterday so far" must still start at yesterday's midnight, and a UTC-length subtraction would start it at 01:00. It takes the zone, the local boundaries and `now` (UTC, as now), and in one query computes in naive local time (`?::timestamp` arithmetic on naive values ignores clock changes):

```
length   = local-to-exclusive - local-from
prev-from = local-from - length
prev-to   = least(local-to-exclusive, timezone(zone, timezone('UTC', now))) - length
```

then converts both to UTC with `timezone('UTC', timezone(zone, ..))` and returns `{:from :to-exclusive}` for `totals` as today. With `"UTC"` this equals the current arithmetic.

The in-period filter (`in-period`, `in-period-params`) does not change: it compares `ts` with the UTC instants, so every panel but the chart needs nothing. `realtime` ("the last five minutes") needs nothing.

### The chart

`timeseries` generates its buckets from the local boundaries (`?::timestamp` of `:local-from` to `:local-to-exclusive - interval 1 <bucket>`), and groups events by `date_trunc('<bucket>', timezone(?, timezone('UTC', ts)))` with the zone as a parameter, inside the same UTC `where`. Labels come from `strftime` as now. Verified: a query of this shape with `Europe/Amsterdam` puts a `22:30 UTC` event on the next local day.

### The route

`GET /api/sites/:id/stats` reads `tz` from the query string (`query-params` already splits it; zone names need no decoding: letters, `/`, `_`, `+`, `-`; the dashboard URL-encodes `/` as `%2F`, so `query-params` must decode `%2F`, see below). Rules:

- `tz` absent or empty: `"UTC"`. The API behaves exactly as before for curl, the e2e helpers and anyone scripting it.
- `tz` present and in `pg_timezone_names()`: used.
- `tz` present and unknown: `400 {"error": "tz must be an IANA time zone name"}`, like a bad period. The dashboard shows it as it shows any failed load ("Could not load this period: ...", Retry). Browsers and DuckDB both take their names from ICU, so this should never fire for a real browser; it is for hand-written URLs.

`stats/zone` (in `stats.lg`, since `db.lg`, `stats.lg` and `auth.lg` own the SQL) answers `{:zone "..."}` or `{:error "..."}` with the `exists(select 1 from pg_timezone_names() where name = ?)` lookup. The route runs it first, then `period` with the zone, so the request path still binds no dynamic vars and runs no SQL directly.

The response's `:period` names what the dashboard sees: `{:from <local-from> :to <local-to-exclusive> :bucket .. :tz <zone>}`. The dashboard does not read `from`/`to` today, but a reader of the JSON should see the days as the viewer sees them, and `tz` says which zone they are in.

**`%2F` in the query string.** `URLSearchParams` encodes `Europe/Amsterdam` as `Europe%2FAmsterdam`. `query-params` takes values "as written", and let-go 1.13.0 has no decoder (checked on 2026-10-05: nothing in `http`, `string` has only `escape`, and `URLEncoder` has no `decode`). Add a private `percent-decode` in `routes.lg` that turns `+` into a space and each `%XX` into its character (`str/replace` with the regex `%[0-9A-Fa-f]{2}` and a function; zone names are ASCII, so no multi-byte sequences arise), applied to every query value in `query-params`. Period names and dates contain no escapes, so nothing changes for them. Update `query-params`' docstring. Pin it in `routes_test.lg`: `?period=today&tz=Europe%2FAmsterdam` answers 200 with `:tz "Europe/Amsterdam"`.

### The dashboard

- `ui/src/api.ts`: `stats(id, p)` adds `tz=<zone>` to the query, through `periodQuery`. `Stats.period` gains `tz: string`. The overview's cards (`Sites.tsx`) call the same `api.stats`, so they move with it.
- `ui/src/format.ts`:
  - `zone()`: `Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'`, in a `try` (a very old engine could throw).
  - `utcDay(days)` becomes `localDay(days, base = new Date())`: the date of `base` in the browser's zone, `YYYY-MM-DD`, shifted by `days` calendar days. Shift with `setDate(getDate() + days)` on a copy of `base`, never by adding `days * 86_400_000`: in Amsterdam, 00:30 on March 30, 2026 minus 24 hours is March 28, skipping yesterday (the 29th had 23 hours). Then read `getFullYear`, `getMonth`, `getDate` and zero-pad.
  - `isCurrent(p, today = localDay())`: unchanged otherwise.
  - `longDate` for an hour drops the ` UTC` suffix: "Sep 30, 13:00". The file's header comment changes from "UTC... never shifted" to: every date the server sends is already in the viewer's zone and is shown as written.
- `ui/src/components/PeriodControl.tsx`: `utcDay` → `localDay`; the hint "Days are UTC." becomes `Days are in {zone()} time.` ("Days are in Europe/Amsterdam time.").
- `ui/src/components/Timeseries.tsx`: the hidden table's header `Time (UTC)` becomes `Time`.
- The refresh rule (`isCurrent`) now compares with the local today, which is the day the server also used. A period chosen yesterday and left open past local midnight keeps polling (it reaches "today" by its own `from`/`to`, as before).

### Visitors across midnight

The visitor id's salt changes at **UTC** midnight (`ingest.lg`, `salts`), and this plan leaves that alone: there is no one zone to rotate it in, and rotating per site is a different feature. So a visitor active on both sides of UTC midnight within one local day counts as two visitors in that day (in Amsterdam, someone browsing from 01:30 to 02:30 local). The docs say so. The same split already exists today at the UTC day boundary; it just no longer lines up with the chart's day boundary.

### Testing

Server (`test/pagelet/stats_test.lg`, `routes_test.lg`):

- `periods`: pass `"UTC"` to every existing call (expectations unchanged), then with `"Europe/Amsterdam"` (UTC+2 on 2026-09-10): `7d` is `{:from "2026-09-03T22:00:00" :to-exclusive "2026-09-10T22:00:00" :bucket "day" :zone "Europe/Amsterdam" :local-from "2026-09-04T00:00:00" :local-to-exclusive "2026-09-11T00:00:00"}`; `today` in `"Asia/Kolkata"` (UTC+5:30) is `2026-09-09T18:30:00` to `2026-09-10T18:30:00`.
- `stats/zone`: `"Europe/Amsterdam"`, `"Asia/Calcutta"` and `"UTC"` are accepted; `"Nowhere/Zone"`, `""` and `nil` give an error... except `nil`/`""` are the route's "absent" case: decide in `zone` so the route stays dumb: `nil` or blank → `{:zone "UTC"}`.
- A new test `local-days`: in the seeded data, b's 2026-09-09 events are at 12:00-12:20 UTC and the 10th's at 09:00-09:10 UTC. Add one more seeded row at `2026-09-09 22:30:00` for visitor `vz` (path `/late`). In UTC the 7-day series has `vz` on the 9th; in `Europe/Amsterdam` the series puts `vz` on the 10th (`{:t "2026-09-10" :visitors 3 ...}`), a custom period `2026-09-10`..`2026-09-10` in Amsterdam counts 3 visitors and `/late` among the pages, and the hourly series for that day puts `vz` in bucket `"2026-09-10T00:00"` (index 0) and a's 09:00 UTC views at `"2026-09-10T11:00"` (index 11). Check the existing tests' totals still hold after the new row (the 7-day UTC totals become 3 visitors, 29 pageviews; update the expectations, or give `vz` a 2026-09-09 22:30 timestamp only in the new test's own connection, whichever keeps the diff smaller: prefer the latter by adding a `(seeded-late)` helper that inserts the extra row on top of `(seeded)`).
- A fall-back day in `hours`: seed `/a` by `vf` at `2026-10-25 00:30:00` UTC and `/b` by `vf` at `2026-10-25 01:30:00` UTC (02:30 CEST and 02:30 CET in Amsterdam). The hourly series for the custom day `2026-10-25` in `Europe/Amsterdam` has 24 rows, and the row `"2026-10-25T02:00"` holds both pageviews.
- A DST comparison, `the-previous-span-across-dst`: seed one `/early` pageview by `vd` at `2026-03-27 23:30:00` UTC (00:30 on March 28 in Amsterdam) in a fresh connection. For the custom day `2026-03-29` (Amsterdam's 23-hour day) with `now` = `2026-03-29T10:00:00` (12:00 local), `:previous` is `{:visitors 1 :pageviews 1 :visit_duration nil}`: the span before runs from March 28 00:00 local (`2026-03-27T23:00:00` UTC) to 12:00 local. A UTC-length subtraction (23 h) would start at 00:00 UTC and miss it. In `"UTC"`, the same period's `:previous` is empty (the event is on the 27th there).
- `routes_test.lg` `events-to-stats`: `?period=today&tz=Europe%2FAmsterdam` answers 200 with `:period :tz "Europe/Amsterdam"` and the same totals (the event is "now" in both zones); `?period=today&tz=Nowhere%2FZone` is 400; no `tz` answers `:tz "UTC"`.

Dashboard (`ui/test/format.test.ts`): the file sets `process.env.TZ = 'Europe/Amsterdam'` before its imports' first `Date` is made (Node re-reads `TZ` on change), so the DST cases are deterministic on any machine. `localDay(0, new Date(2026, 8, 30, 23, 30))` is `2026-09-30`; `localDay(-6, new Date(2026, 8, 30))` is `2026-09-24`; `localDay(-1, new Date(2026, 2, 30, 0, 30))` is `2026-03-29` (the spring-forward day; a 24-hour shift would say the 28th); `localDay(1, new Date(2026, 9, 24, 23, 30))` is `2026-10-25` (fall back); `localDay()` with no arguments matches `/^\d{4}-\d{2}-\d{2}$/`; `longDate('2026-09-30T13:00')` is `"Sep 30, 13:00"`.

Browser (`e2e/tests/timezone.spec.js`, new, `test.use({ timezoneId: 'Asia/Tokyo' })` at the top so the whole file runs in Tokyo): sign in, create a site through the API, post one pageview the way `dashboard.spec.js` does, `expect.poll` the `stats` helper until `totals.pageviews` is 1 (ingest is buffered; the e2e flush is 300 ms), then open `/sites/<id>?period=today`, wait for the `/stats` response whose URL contains `tz=Asia%2FTokyo`, and assert on its JSON: `period.tz` is `Asia/Tokyo`, `period.from` starts with today's date in Tokyo (from Node: `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())`, which gives `YYYY-MM-DD`), and the one bucket with `pageviews` 1 has an hour equal to Tokyo's current hour (compute the hour before posting and after the response with `Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false })`; accept either, so the test holds across an hour boundary). Then assert the custom range popover's hint reads "Days are in Asia/Tokyo time." and delete the site. The page's own `Date` runs in Tokyo under `timezoneId`, so `localDay()` agrees with the server.

### Docs

- `docs/dashboard.md`: the top bar's "custom range of UTC days" becomes "custom range of days"; a sentence after the card list: reports are in the time zone of the browser that opens the dashboard: today is your today, days start at your midnight, and two people in different zones see the same visits cut into different days. Limitations: replace "Reports are in UTC; there is no local-timezone view." with two notes from the design: a visitor active across UTC midnight counts twice in the day it spans, since the visitor id changes at UTC midnight whatever your zone; and in the few zones whose clocks change at midnight (Cuba, Chile, Paraguay) one hour of that day lands on the neighbouring day. Keep the engagement line's "A visit across UTC midnight counts as two".
- `README.md`: "Reports use UTC. A visitor returning on another day counts again." becomes "Reports are in your browser's time zone. A visitor returning on another day counts again."
- `docs/KNOWLEDGE.md`: a dated section "Time zones in DuckDB (2026-10-05)" with the verified facts from the design's DuckDB section (ICU present, 638 names, `at time zone ?` fails to bind, the `timezone(...)` forms, session independence, the DST behaviour).

## File Structure

- Modify: `src/pagelet/stats.lg` (`zone`, `today`, `period`/`span`, `timeseries`, the response's `:period`)
- Modify: `src/pagelet/routes.lg` (the stats route reads `tz`; `query-params` decodes `%2F`)
- Modify: `test/pagelet/stats_test.lg`, `test/pagelet/routes_test.lg`
- Modify: `ui/src/api.ts` (`tz` in the stats query, `period.tz`)
- Modify: `ui/src/format.ts` (`zone`, `localDay`, `isCurrent`, `longDate`, header comment)
- Modify: `ui/src/components/PeriodControl.tsx`, `ui/src/components/Timeseries.tsx`
- Modify: `ui/test/format.test.ts`
- Create: `e2e/tests/timezone.spec.js`
- Modify: `docs/dashboard.md`, `README.md`, `docs/KNOWLEDGE.md`, this plan

No migration, no change to `ingest.lg`, `db.lg` or the tracker.

## Tasks

### Task 1: Periods in a zone

**Files:**
- Modify: `src/pagelet/stats.lg`
- Test: `test/pagelet/stats_test.lg`

- [ ] **Step 1: Write the failing tests**
  In `stats_test.lg`, give every `stats/period` and `stats/today` call a zone argument (`"UTC"` for the existing ones) and add the Amsterdam and Kolkata cases from the design's Testing section to `periods`, plus a `zones` test for `stats/zone` (accepted names, `nil`/blank → `"UTC"`, `"Nowhere/Zone"` → `:error`), and the DST comparison case from the design's Testing section (`the-previous-span-across-dst`). Expect the new keys (`:zone`, `:local-from`, `:local-to-exclusive`) in every period map, and `:tz` in `(:period s)` of `seven-days`.

- [ ] **Step 2: Run the tests to see them fail**
  Run: `mise exec -- lgx test`
  Expected: the stats tests FAIL (arity, then missing keys).

- [ ] **Step 3: Implement**
  In `stats.lg`: `zone` (the `pg_timezone_names()` lookup; `nil` or blank is `"UTC"`); `today` takes the zone (`timezone(?, now())::date`); `span` builds the local boundaries, converts them with `timezone('UTC', timezone(?, ?::timestamp))`, and returns the six-key map from the design; `period` takes `[conn params now-day zone]` and threads the zone through; `stats` answers `:period {:from local-from :to local-to-exclusive :bucket :tz}`. Update the namespace comment: a period is now built in a zone, with its UTC instants for the filter and its local boundaries for the chart. `previous-period` takes the zone and local boundaries and does its arithmetic in local time as the design shows. Keep `now`, `in-period` and `realtime` as they are.

- [ ] **Step 4: Run the tests**
  Run: `mise exec -- lgx test`
  Expected: PASS. (`routes_test.lg` fails until Task 3 if `period`'s arity changed under it; if so, pass `"UTC"` from the route for now and finish the route in Task 3.)

- [ ] **Step 5: Commit**
  `git commit -m "stats: periods cut at midnight in a given zone"`

### Task 2: The chart in local buckets

**Files:**
- Modify: `src/pagelet/stats.lg`
- Test: `test/pagelet/stats_test.lg`

- [ ] **Step 1: Write the failing test**
  Add `seeded-late` (one `/late` pageview by `vz` at `2026-09-09 22:30:00`), the fall-back case in `hours` and the `local-days` test from the design: the UTC 7-day series puts `vz` on the 9th; the Amsterdam series on the 10th; the Amsterdam custom day `2026-09-10` has 3 visitors and `/late`; its hourly series has `vz` at index 0 (`"2026-09-10T00:00"`) and a's views at index 11 (`"2026-09-10T11:00"`); the series still has 7 and 24 rows.

- [ ] **Step 2: Run it to see it fail**
  Run: `mise exec -- lgx test`
  Expected: `local-days` FAILS (buckets are UTC).

- [ ] **Step 3: Implement**
  `timeseries` generates buckets from `:local-from`/`:local-to-exclusive` and groups by `date_trunc('<bucket>', timezone(?, timezone('UTC', ts)))`, with the zone bound before the `in-period` parameters. Update its docstring.

- [ ] **Step 4: Run the tests**
  Run: `mise exec -- lgx test`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "stats: chart buckets in the period's zone"`

### Task 3: The route reads tz

**Files:**
- Modify: `src/pagelet/routes.lg`
- Test: `test/pagelet/routes_test.lg`

- [ ] **Step 1: Write the failing tests**
  In `events-to-stats`: `?period=today&tz=Europe%2FAmsterdam` → 200, `[:json :period :tz]` is `"Europe/Amsterdam"`, totals as for the UTC call; `?period=today&tz=Nowhere%2FZone` → 400 with the error text; the plain call's `:tz` is `"UTC"`.

- [ ] **Step 2: Run them to see them fail**
  Run: `mise exec -- lgx test`
  Expected: the new assertions FAIL.

- [ ] **Step 3: Implement**
  The stats route: `(stats/zone db (:tz params))`, 400 on its error, else `(stats/period db params (stats/today db zone) zone)`. Add `percent-decode` and apply it in `query-params` per the design's note; update the `query-params` docstring, which says values are taken as written. Update the route's comment block if it describes the query string.

- [ ] **Step 4: Run the tests**
  Run: `mise exec -- lgx test`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -m "routes: stats take the viewer's time zone as tz"`

### Task 4: The dashboard sends its zone and drops "UTC"

**Files:**
- Modify: `ui/src/api.ts`, `ui/src/format.ts`, `ui/src/components/PeriodControl.tsx`, `ui/src/components/Timeseries.tsx`
- Test: `ui/test/format.test.ts`

- [ ] **Step 1: Write the failing tests**
  In `format.test.ts`: set `process.env.TZ = 'Europe/Amsterdam'` first, then the `localDay` cases from the design (fixed bases, the two DST days), `longDate('2026-09-30T13:00')` → `"Sep 30, 13:00"` and `longDate('2026-09-23')` → `"Wed, Sep 23"`. Import `localDay` and `longDate`.

- [ ] **Step 2: Run them to see them fail**
  Run: `mise exec -- lgx ui-test`
  Expected: FAIL (no `localDay`; `longDate` says UTC).

- [ ] **Step 3: Implement**
  `format.ts`: `zone`, `localDay` (calendar shift with `setDate`, per the design), `isCurrent`'s default, `longDate`, the header comment. `api.ts`: `tz: zone()` in `periodQuery`, `tz: string` in `Stats.period`. `PeriodControl.tsx`: `localDay`, the hint. `Timeseries.tsx`: the header. Keep `format.ts` free of runtime imports (the test loads it straight into Node).

- [ ] **Step 4: Run the tests and the type check**
  Run: `mise exec -- lgx ui-test` and `cd ui && npx tsc --noEmit`
  Expected: PASS, no type errors.

- [ ] **Step 5: Commit**
  `git commit -m "ui: reports in the browser's time zone"`

### Task 5: The browser test, docs and the PR

**Files:**
- Create: `e2e/tests/timezone.spec.js`
- Modify: `docs/dashboard.md`, `README.md`, `docs/KNOWLEDGE.md`, this plan

- [ ] **Step 1: Write the browser spec**
  `timezone.spec.js` as in the design's Testing section (`test.use({ timezoneId: 'Asia/Tokyo' })`, one pageview, the `/stats` response's `tz`, `period.from` and the hour bucket, the popover hint, delete the site). Use `helpers.js` (`signIn`, `apiLogin`, `createSite`, `deleteSite`, `uniqueDomain`).

- [ ] **Step 2: Run the browser tests**
  Run: `mise exec -- lgx e2e`
  Expected: every spec PASSES, the new one included. If 8099 is taken, `E2E_PORT=8098`.

- [ ] **Step 3: Docs**
  `docs/dashboard.md`, `README.md` and the KNOWLEDGE section per the design's Docs section. `/writing-clearly` applies.

- [ ] **Step 4: The whole check**
  Run: `mise exec -- lgx check`
  Expected: server tests, UI unit tests and browser tests all PASS.

- [ ] **Step 5: Mark the plan executed, commit, open the PR**
  Add `**Status: completed <date>.**` and a short summary at the end of this plan, as the earlier plans have. `git commit -m "docs: reports in the viewer's time zone"`, push, and open a PR titled `Show reports in the viewer's time zone`.
