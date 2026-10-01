# Dashboard Redesign Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard as one calm page per site (a sentence for a headline, one quiet line chart, four open breakdowns, everything else behind small overlays), with the four small stats additions that page needs.

**Tech Stack:** let-go 1.13 / DuckDB (`stats.lg`, `routes.lg`, `db.lg`), React 19, TypeScript 6, Vite 8, Tailwind 4, react-router 7, Recharts 3, Playwright 1.56, Node 24 (`node --test`). Skills: `/frontend-design` for the visual work, `/dataviz` before touching the chart, `/writing-clearly` for UI copy.

---

## Design

The source brief is "Lightweight Web Analytics — UI Design Direction" (the user's attachment; its decisions are folded in below, so this plan stands alone). Its test for every piece of UI: *does this help someone understand their website faster?*

### What changes, in one view

| Area | Today | After |
|---|---|---|
| Navigation | `/sites` list page, "← All sites" link | Site switcher dropdown in the top bar; `/` opens the last-viewed site |
| Period | Row of tabs plus inline date fields | One dropdown: Today, Last 7 days, Last 30 days, Custom range |
| Headline | Three equal 6xl numbers | A sentence about visitors, a comparison line, three small stats |
| Chart | Area with wash and grid | One 2px line, no fill, no grid |
| Breakdowns | Seven two-column panels | Pages, Sources, Countries, Devices (Browsers and Systems behind a switch), Events only when a site sends any; one number per row, with visitors or views chosen in each list's header, so nothing shown today is lost |
| Online | "N online now" text | "N online" that opens a popover listing pages |
| Snippet, settings, sign out | Inline expanding panels, top-bar link | `···` menu opening small dialogs |
| New site | Name and domain inline form | `/sites/new`, domain only, then a waiting state that turns into "You're live" |
| No data ever | Seven "No data for this period" | One calm waiting state with the tracking code |
| Theme | Graphite & Paper: teal, Fraunces, paper grain, load stagger | Lichen: sage, Newsreader, no grain, no entrance animation, dark theme |

### Page layout (desktop)

```text
pagelet.

pagelet.app ▾                           Last 30 days ▾    ● 3 online   ···


1,842 people visited in the last 30 days.            (serif, the one big thing)
14% more than the 30 days before.                    (sans, muted)

3,921 pageviews      2.1 views per visit      58% bounced


   ╭─╮          ╭──╮
───╯ ╰──────────╯  ╰────                             (one line, baseline only)
Sep 1                                  Sep 30


Pages                    visitors      Sources                  visitors
/                           1,204      google.com                    621
/docs                         481      github.com                    188

Countries                visitors      Devices · Browsers · Systems  visitors
United Kingdom         571    31%      Desktop                1,326    72%
United States          442    24%      Mobile                   497    27%

Events           count   visitors      (only when the site sends custom events)
signup              12          9
```

Everything is left-aligned in one column, `max-w-[1000px]`, with generous gaps between the headline, the chart and the breakdowns, and a medium gap between the two breakdown rows. Below 720px the breakdowns stack: Pages, Sources, Countries, Devices, Events. The top bar wraps to two lines; no hamburger.

### Theme: Lichen

A custom theme (the theme-factory presets are deck themes; this follows its create-your-own path). Tokens stay Tailwind `@theme` variables in `ui/src/index.css`, so utilities keep their names (`bg-paper`, `text-ink`, `text-muted`, `border-hairline`, `text-accent`, `bg-accent-soft`); `bg-card` becomes `bg-surface`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#F7F7F4` | `#111210` | page background |
| `surface` | `#FFFFFF` | `#181916` | popovers, dialogs, inputs, the snippet |
| `ink` | `#20201E` | `#F2F2EE` | primary text |
| `muted` | `#6B6B66` | `#9B9C95` | secondary text, axis ticks |
| `faint` | `#A1A19B` | `#5E5F59` | non-text marks only (idle dot, chevrons) |
| `hairline` | `#E7E7E2` | `#292A26` | borders, the chart baseline |
| `accent` | `#5B6D5B` | `#9DB29D` | chart line, online dot, the "You're live" mark, focus ring |
| `accent-soft` | accent at 14% | accent at 18% | selection, hover wash in menus |
| `danger` | `#A03D2E` | `#E08A7A` | errors, delete |

- `muted` is darker than the brief's `#777772` because that fails 4.5:1 on the background; the brief's value is not used for text.
- Dark values apply under `@media (prefers-color-scheme: dark)` by overriding the same variables on `:root`; `color-scheme: light dark` on `html` so date inputs and scrollbars follow. No toggle.
- The accent appears only where listed. Buttons are ink on paper (primary: `bg-ink text-paper`), links are ink with an underline, not accent.
- Radius: 8px on buttons, inputs and the snippet; 10px on popovers and dialogs; none on dashboard sections. Shadows only on popovers, dialogs and the chart tooltip: `0 8px 24px -12px rgb(0 0 0 / 0.18)`.
- Type: **Newsreader** (variable, with the optical-size axis, `@fontsource-variable/newsreader`) for the headline sentence and nothing else on the dashboard, plus the wordmark and the two page titles ("Add a website", the waiting state's title). **IBM Plex Sans** 400/500 for everything else. Fraunces is removed. Section titles (Pages, Sources, …) are Plex 500 at body size, not serif. Code (the snippet) uses the system monospace stack, as now.
- No uppercase tracked labels anywhere; labels are sentence case, muted.
- Numbers in lists and the small stats use tabular figures (`.num`); the headline sentence uses proportional figures.
- Motion: the load stagger (`.rise`) and the paper grain are deleted. What stays or is added: the wrong-password shake; the online dot's pulse (only when someone is online); popovers and dialogs open with a 120ms fade and 4px rise; the chart fades (150ms) when the metric changes; the "You're live" mark fades in once (300ms). All off under `prefers-reduced-motion`.

### Headline and small stats

- The headline is a sentence in Newsreader, about `text-4xl` on phones and `text-5xl` on desktop, weight 400, line-height about 1.15: **"1,842 people visited in the last 30 days."** "1,842 people" is a button (`aria-pressed`, `data-testid="metric-visitors"`) that makes the chart plot visitors.
- Under it, in Plex, muted, body size: the comparison, e.g. "14% more than the 30 days before." It is omitted when the previous span had no visitors.
- Then one row of three small stats, number in ink and label in muted, on one baseline: "3,921 pageviews" (a button, `data-testid="metric-pageviews"`, switches the chart), "2.1 views per visit" (`data-testid="stat-views-per-visit"`), "58% bounced" (`data-testid="stat-bounce"`). The pressed metric carries a 2px accent underline under its number; the other does not. Visitors is pressed by default.
- All copy comes from pure functions in `ui/src/format.ts` (Task 4), which pin the wording.

### Chart

Recharts `LineChart`, one `Line` (`type="monotone"`, 2px, accent, round joins), no `CartesianGrid`, no fill. X axis: hairline baseline, muted 12px ticks, same thinning rule as now. Y axis: no line, at most three muted ticks. Tooltip: surface background, hairline border, 8px radius, the shadow above; date, then both metrics, the plotted one first. Colours are CSS variables (`var(--color-accent)` and so on) passed as SVG attribute values, so the dark theme needs no JavaScript; the hex constants at `Timeseries.tsx:11-14` go. Recharts animation stays off; the metric switch is a CSS opacity fade on a wrapper keyed by metric. The screen-reader table stays. Height 240px.

### Breakdowns

One component, `Breakdown`, replaces `RankedList`:

- Header: title (Plex 500) on the left; on the right the unit word, which is a button. It reads "visitors" or "views" and clicking it flips the list between the two (`aria-label="Show views"` / `"Show visitors"`, an underline on hover and focus so it reads as a control; each list keeps its own choice, visitors first). This is how every row's pageviews, shown as a second column today, stay available without a second column.
- Rows: label left (truncated, `title` holds the full text), the chosen number right. Countries and Devices are share lists: they show the count in muted and, after it, its share of the period's total (of `totals.visitors` or `totals.pageviews`, by the chosen unit) in ink, via `format.share`.
- Events is the one list with two fixed columns, "count" (ink) and "visitors" (muted), and no switch.
- The row's bottom rule encodes the share: a full-width 1px hairline with, over its left part, a 2px accent line at 45% opacity as wide as the row's shown value relative to the list's largest. No tinted row backgrounds.
- At most 6 rows; when the list is longer, a quiet "Show N more" button under it reveals the rest (the server still sends 10).
- `data-testid="panel-<title lower-cased>"` on the section, rows are `li`.
- A list that is empty for the period shows one muted line, "Nothing in this period".

The sections:

| Section | Data | Numbers shown |
|---|---|---|
| Pages | `stats.pages` | visitors or views |
| Sources | `stats.referrers` | visitors or views |
| Countries | `stats.countries` (flag and name via `format.country`) | visitors or views, and the share of the total |
| Devices | `stats.devices`, or `stats.browsers` / `stats.os` through the header switch | visitors or views, and the share of the total |
| Events | `stats.events`, rendered only when non-empty | count and visitors |

The Devices header is three text buttons, "Devices", "Browsers", "Systems" (`aria-pressed`; the pressed one in ink, the others muted); the section keeps `data-testid="panel-devices"` whichever is shown. Device names are capitalised for display ("desktop" → "Desktop").

### Top bar and overlays

Row one: the wordmark (links to `/`). Row two, left: the site switcher. Right: the period menu, the online indicator, the actions menu.

- **Site switcher** (`aria-label="Switch website"`, shows the current domain and a chevron): a menu of every site's domain, a check beside the current one, a divider, then "Add website" (links to `/sites/new`). Each time the menu opens it asks `realtime` for every site once (as `Sites.tsx:15-22` does today; a failed call counts as 0) and shows a muted "N online" with the accent dot beside each site that has someone on it, so the glance across sites that the sites page gave is kept. Choosing a site navigates to `/sites/:id` and keeps the current `?period=…` query.
- **Period menu** (`aria-label="Period"`, shows "Today", "Last 7 days", "Last 30 days", or the custom range as "Sep 1 – Sep 30"): the three presets and "Custom range". Choosing "Custom range" swaps the menu body for two date inputs (labels "From", "To") and an "Apply" button; a muted line at the bottom of the menu says "Days are UTC". The period stays in the URL exactly as now (`?period=7d`, `?period=custom&from=…&to=…`), default `7d`.
- **Online** (`data-testid="online-now"`): "N online" with the pulsing accent dot when N > 0, a button that opens a popover: "3 people are here now" ("1 person is here now"), then up to five pages with their visitor counts. When N is 0 it is plain muted text "0 online" with a faint dot, not a button. Polled every 15s while the tab is visible, as now.
- **Actions** (`aria-label="Site actions"`, shows `···`): "Tracking code" (dialog: one sentence and the snippet with its copy button), "Site settings" (dialog: the domain field with "Save", then "Delete site" with the type-the-domain confirmation, `aria-label="Type the domain to confirm"`), "Sign out". The brief's "Share dashboard" is not built: there is no sharing on the server.
- Menus and the online popover use one `Popover` component: a trigger button and an absolutely positioned panel under it; closes on outside pointer-down, on Escape (focus returns to the trigger), and when an item is chosen; `aria-expanded` on the trigger; menu items are `role="menuitem"` inside `role="menu"`. Dialogs use the native `<dialog>` with `showModal()` through one `Dialog` component (title, body, Escape and backdrop click close it).

### Sites, names and routes

- The UI shows a site by its **domain** everywhere and no longer asks for a name. The server keeps the `name` column and field; a blank or missing name now defaults to the domain, so the UI sends only `{domain}` on create and update. An explicit name is still validated (1–64 characters) and stored. `db/sites` orders by domain.
- Routes: `/login`; `/` (Home: loads the sites, then redirects to `/sites/new` when there are none, else to the site id in `localStorage["pagelet:last-site"]` if it still exists, else the first site); `/sites/new` (the add page); `/sites/:id` (the dashboard; it writes the last-site key on mount); `/sites` and anything else redirect to `/`. The server already answers `/sites/:id` with the app for `/sites/new`; no server route changes. Login navigates to `/`.
- **Add a website** (`/sites/new`): the title, one "Domain" field (`#site-domain`, placeholder `example.com`), the primary button "Add website", and the server's error under the field. On success it navigates to `/sites/:id`, which shows the waiting state. The top bar here is the wordmark and an actions menu with only "Sign out"; when sites exist, a muted "Cancel" link returns to `/`.

### Waiting state (no events ever)

When the stats answer has `has_events: false`, the dashboard body (`data-testid="waiting"`) is, instead of headline, chart and breakdowns:

```text
quickmeet.app is ready

Add this to the <head> of every page:
<script defer src="https://…/p.js"></script>                 Copy

● Waiting for the first visit…
```

The top bar shows the switcher and actions only (no period, no online). While it is shown and the tab is visible, the page asks for the stats again every 5s, and once when the tab becomes visible again (the stats of a site with no events are cheap, and `has_events` stays true however long ago the first visit was, which a check on who is online would not). When an answer has `has_events: true`, the last line becomes a small success: a check mark in accent, **"You're live"**, "Your first visit has been received.", and the button "View dashboard", which shows the dashboard from that answer. The copy never claims the script is installed correctly: with no events that cannot be known.

When `has_events` is true but the period has no visitors, the body is only the headline sentence "Nobody visited in the last 7 days." (no comparison, stats, chart or breakdowns).

### Server additions (`stats.lg`, mirrored in `ui/src/api.ts`)

The stats response gains three things and the realtime response one:

```ts
type Stats = {
  // …unchanged…
  totals: { visitors: number; pageviews: number; views_per_visitor: number; bounce_rate: number }
  previous: { visitors: number; pageviews: number }
  has_events: boolean
}
type Realtime = { online: number; pages: { name: string; visitors: number }[] }
```

- **`bounce_rate`**: an integer 0–100. The visitor hash is salted per day (`visitor.lg:31`), so a "visitor" in a period is already one visit-day, which is why the UI may say "views per visit" for `views_per_visitor`. A bounce is a visitor whose only event in the period is a single pageview; a visitor with one pageview and a custom event, or with a custom event alone, is not one. `bounce_rate` is bounces over all visitors in the period. 0 when there are no visitors. Cast so DuckDB returns an int, not a DECIMAL string (see KNOWLEDGE, "round(2.84, 1)"): `cast(round(100 * bounced::double / visitors) as integer)`.
- **`previous`**: visitors and pageviews over the span just before the period, cut like-for-like. With `len = to-exclusive − from` and `cut = least(to-exclusive, now)`, the previous span is `[from − len, cut − len)`. So "today at 14:10" is compared with yesterday until 14:10, and a period that ended in the past with the whole span before it. The arithmetic runs in DuckDB (`?::timestamp - (?::timestamp - ?::timestamp)`), formatted back with `strftime(…, '%Y-%m-%dT%H:%M:%S')`.
- `stats/stats` takes the current time as a fourth argument, `(stats conn site-id p now)`, a naive UTC string like `"2026-09-10T14:10:00"`; `stats/now` returns it from DuckDB (`strftime(now() at time zone 'UTC', '%Y-%m-%dT%H:%M:%S')`). The route passes `(stats/now db)`; tests pass a fixed value.
- **`has_events`**: whether the site has any event at all (`select exists(select 1 from events where site_id = ?)`).
- **realtime `pages`**: the top five paths by distinct visitors among pageviews of the last five minutes (path not null), ordered by visitors desc, then path; `[]` when nobody is online.

No migration, no new route, no binding or direct SQL on the request path: the queries stay in `stats.lg` and `db.lg`.

### Testing

- `lgx test`: new and adjusted cases in `test/pagelet/stats_test.lg` and `routes_test.lg`.
- `lgx ui-test` (new): `node --test` over `ui/test/format.test.ts`, which imports `../src/format.ts` directly (Node 24 strips the types; `format.ts` has no runtime imports). It covers the headline copy. `ui/test/` is outside `tsconfig.app.json`'s `include`, so `tsc -b` ignores it.
- `lgx e2e`: `e2e/tests/dashboard.spec.js` is rewritten for the new flow in Task 8. Between Tasks 5 and 8 it is expected to fail; `cd ui && npm run build && npm run lint` gates those tasks.
- A visual pass with screenshots (light, dark, 390px) in Task 9.

### Out of scope

Sharing a dashboard, a theme toggle, renaming the `views_per_visitor` JSON key, dropping the `name` column, changing the tracker.

---

## File Structure

Server:

- Modify `src/pagelet/stats.lg`: `now`, bounce in `totals`, `previous`, `has-events?`, realtime pages; `stats` takes `now`.
- Modify `src/pagelet/routes.lg`: pass `(stats/now db)`; `site-input` defaults the name to the domain.
- Modify `src/pagelet/db.lg`: `sites` orders by domain.
- Modify `test/pagelet/stats_test.lg`, `test/pagelet/routes_test.lg`.

Dashboard (`ui/`):

- Modify `src/index.css`: the Lichen tokens, dark overrides, fonts, motion.
- Modify `src/api.ts`: the new fields; `createSite(domain)`, `updateSite(id, domain)`; `realtime` type.
- Modify `src/format.ts`: copy helpers (`people`, `periodPhrase`, `periodLabel`, `comparison`, `share`).
- Create `test/format.test.ts`.
- Modify `src/App.tsx`: routes, `Home`, the guarded layout without the old top bar.
- Create `src/components/Popover.tsx`, `src/components/Dialog.tsx`.
- Create `src/components/TopBar.tsx` (wordmark row and the controls row; composes the four below).
- Create `src/components/SiteSwitcher.tsx`, `src/components/PeriodMenu.tsx`, `src/components/ActionsMenu.tsx` (the menu plus its two dialogs: tracking code, site settings).
- Modify `src/components/OnlineNow.tsx` (popover with pages).
- Create `src/components/Headline.tsx` (sentence, comparison, small stats; exports `Metric`).
- Modify `src/components/Timeseries.tsx` (line chart, CSS variables).
- Create `src/components/Breakdown.tsx`.
- Create `src/components/Waiting.tsx` (the waiting and "You're live" state).
- Modify `src/components/Snippet.tsx`, `src/components/Wordmark.tsx` (tokens, radius).
- Modify `src/pages/Site.tsx` (composition only), `src/pages/Login.tsx`.
- Create `src/pages/AddSite.tsx`.
- Delete `src/pages/Sites.tsx`, `src/components/PeriodPicker.tsx`, `src/components/RankedList.tsx`, `src/components/SiteForm.tsx`, `src/components/StatRow.tsx`.
- Modify `public/favicon.svg` (Lichen colours), `package.json` (fonts, `test` script).

Elsewhere:

- Modify `e2e/tests/dashboard.spec.js`; check `e2e/tests/helpers.js` still fits.
- Modify `lgx.edn` (`ui-test` task, added to `check`), `.github/workflows/test.yml` (a step for it).
- Modify `README.md` ("The dashboard"), `docs/KNOWLEDGE.md` (fonts row and note).

---

### Task 1: Stats additions on the server

**Files:**
- Modify: `src/pagelet/stats.lg`, `src/pagelet/routes.lg`
- Test: `test/pagelet/stats_test.lg`, `test/pagelet/routes_test.lg`

Work on a branch: `git switch -c dashboard-redesign` first.

- [x] **Step 1: Write the failing tests** in `stats_test.lg`, per the Design's "Server additions":
  - Every existing `stats/stats` call gets a fourth argument; use `"2026-09-20T00:00:00"` (after every seeded day, so nothing is cut).
  - `seven-days`: totals become `{:visitors 2 :pageviews 28 :views_per_visitor 14.0 :bounce_rate 0}`; `(:previous s)` is `{:visitors 0 :pageviews 0}`; `(:has_events s)` is true.
  - `an-empty-period`: `:bounce_rate 0`, `:previous {:visitors 0 :pageviews 0}`, `:has_events true`; for site `"nope"` `:has_events` is false.
  - A new `bounces` test with its own in-memory database: three visitors on one day, one with a single pageview, one with a single pageview plus a `signup` event, one with two pageviews, one with only a `signup` event → `:bounce_rate 25`.
  - A new `the-previous-span` test on the seeded data, period `custom` 2026-09-10 to 2026-09-10: with now `"2026-09-20T00:00:00"` previous is `{:visitors 1 :pageviews 8}` (all of 09-09); with now `"2026-09-10T12:05:00"` it is `{:visitors 1 :pageviews 5}` (09-09 until 12:05); with now `"2026-09-10T11:00:00"` it is `{:visitors 0 :pageviews 0}`.
  - `online-now`: `{:online 1 :pages [{:name "/" :visitors 1}]}` for `s1`, `{:online 0 :pages []}` for `s2`; `(stats/now conn)` matches `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}`.

- [x] **Step 2: Run them to see them fail**
  Run: `mise exec -- lgx test`
  Expected: failures in `pagelet.stats-test` (arity, missing keys).

- [x] **Step 3: Implement in `stats.lg`**: `now`; `:bounce_rate` in `totals` (a subquery grouping events by visitor: a bounce has one event in all and it is a pageview, as defined in the Design); a private `previous-period` returning `{:from :to-exclusive}` and `previous` returning `(select-keys (totals …) [:visitors :pageviews])`; `has-events?`; `:pages` in `realtime`; `stats` gains `now`, `:previous` and `:has_events`. Update the namespace comment to mention them. In `routes.lg` the stats route calls `(stats/stats db (:id site) p (stats/now db))`.

- [x] **Step 4: Adjust `routes_test.lg`**: in `events-to-stats` the realtime answer becomes `{:online 1 :pages [{:name "/pricing" :visitors 1}]}`; add assertions that the stats JSON has `:has_events true`, `[:totals :bounce_rate]` 100 and `:previous {:visitors 0 :pageviews 0}`.

- [x] **Step 5: Run the tests**
  Run: `mise exec -- lgx test`
  Expected: all pass.

- [x] **Step 6: Commit**
  `git commit -m "Stats: bounce rate, the previous span, has_events, pages online now"`

> Deviation: the `bounces` test has four visitors (the step's "three" was a slip; 1 bounce in 4 is the 25 it expects). `totals` now groups by visitor in a CTE so one query yields both the old numbers and the bounce rate; `pageviews` is cast to `bigint` because DuckDB's `sum` returns a HUGEINT. The `Stats` and `Realtime` types in `ui/src/api.ts` moved here from Task 5 Step 1 (AGENTS.md: change both together; Codex's review).

### Task 2: Sites by domain alone

**Files:**
- Modify: `src/pagelet/routes.lg` (`site-input`), `src/pagelet/db.lg` (`sites`)
- Test: `test/pagelet/routes_test.lg`

- [x] **Step 1: Change the `sites-crud` test**: `{:domain "ok.com"}` and `{:name "" :domain "ok.com"}` both create a site named after its domain (use distinct domains; 201, `:name` equals `:domain`); a 65-character name is still 400; a `PUT` with only `{:domain "example.net"}` sets the name to `example.net`; the list assertion checks the order of `:domain` values, sorted by domain.

- [x] **Step 2: Run to see it fail**
  Run: `mise exec -- lgx test`
  Expected: `sites-crud` fails.

- [x] **Step 3: Implement**: in `site-input`, validate the domain first, then let a blank name become the domain; only a non-blank name is checked for 1–64 characters. Update its docstring and the "Body:" comment on the POST route. `db/sites` orders by `domain`.

- [x] **Step 4: Run the tests**
  Run: `mise exec -- lgx test`
  Expected: all pass.

- [x] **Step 5: Commit**
  `git commit -m "Sites: the name defaults to the domain"`

### Task 3: The Lichen theme

**Files:**
- Modify: `ui/package.json`, `ui/src/index.css`, `ui/public/favicon.svg`, `ui/src/components/Wordmark.tsx`, `ui/src/components/Snippet.tsx`

- [x] **Step 1: Fonts**: in `ui/`, `npm uninstall @fontsource-variable/fraunces && npm i @fontsource-variable/newsreader`. Check which stylesheet carries the optical-size axis (`ls node_modules/@fontsource-variable/newsreader/*.css`; expect `opsz.css`) and note the family name it declares (expect `"Newsreader Variable"`).

- [x] **Step 2: `index.css`**: replace the `@theme` block with the Lichen table from the Design (light values; `--color-card` becomes `--color-surface`; add `--color-faint`, `--color-danger`), `--font-display` as Newsreader; a `prefers-color-scheme: dark` block overriding the same variables on `:root`; `color-scheme: light dark` on `html`. Delete the body grain, `.display-num`, `.rise` and its keyframes. Keep `.num`, the focus rule, `.shake`, `.pulse`. Add the popover/dialog open animation (120ms fade, 4px rise), the chart fade (150ms) and the one-time "live" fade (300ms), all inside the reduced-motion opt-out. Update the header comment to name the theme.

- [x] **Step 3: Fix what the token rename breaks**: `bg-card` → `bg-surface` and 8px radius in `Snippet.tsx` (its Copy button becomes ink text, not accent); the wordmark stays "pagelet." in the display face at `text-xl`, its dot in accent; replace `text-red-800` uses with `text-danger` as files are touched in later tasks. Recolour `favicon.svg` (`#F7F7F4` ground, `#5B6D5B` line).

- [x] **Step 4: Build**
  Run: `cd ui && npm run build && npm run lint`
  Expected: both succeed (files that still use `.rise` or `font-display` compile; they are rewritten in later tasks).

- [x] **Step 5: Commit**
  `git commit -m "Dashboard: the Lichen theme, Newsreader, a dark theme"`

### Task 4: The copy helpers

**Files:**
- Modify: `ui/src/format.ts`, `ui/package.json`, `lgx.edn`, `.github/workflows/test.yml`
- Test: `ui/test/format.test.ts`

The functions, all pure, in `format.ts` (it must keep having no runtime imports; `import type { Period } from './api'` is fine):

```ts
people(n: number): string                       // "1,842 people", "1 person", "Nobody"
periodPhrase(p: Period): string                 // "today" | "in the last 7 days" | "in the last 30 days"
                                                // | "on Sep 9" | "from Sep 1 to Sep 30"
periodLabel(p: Period): string                  // "Today" | "Last 7 days" | "Last 30 days" | "Sep 9" | "Sep 1 – Sep 30"
comparison(now: number, before: number, p: Period): string | undefined
share(part: number, whole: number): string      // "31%", "<1%" for a non-zero share under 0.5%, "0%"
```

`comparison` returns `undefined` when `before` is 0. Otherwise, with `pct = Math.round(Math.abs(now − before) / before × 100)`: `"About the same as <ref>."` when `pct` is 0, `"<pct>% more than <ref>."` or `"<pct>% fewer than <ref>."`. `<ref>` is `"by this time yesterday"` for today, `"the 7 days before"`, `"the 30 days before"`, and for custom `"the day before"` or `"the N days before"` (N = inclusive days from `from` to `to`).

- [x] **Step 1: Write `ui/test/format.test.ts`** with `node:test` and `node:assert/strict`, importing `../src/format.ts`: singular and plural and zero for `people`; every `periodPhrase` and `periodLabel` form; `comparison` for more, fewer, same, no previous, today, custom one day, custom several days; `share` for a round share, `<1%`, zero and a zero whole. Add `"test": "node --test test/"` to `ui/package.json`.

- [x] **Step 2: Run to see it fail**
  Run: `cd ui && npm test`
  Expected: failures (the functions do not exist).

- [x] **Step 3: Implement** the functions in `format.ts`.

- [x] **Step 4: Run**
  Run: `cd ui && npm test && npm run build`
  Expected: tests pass; the build is unaffected.

- [x] **Step 5: Wire it up**: an `lgx.edn` task `ui-test` (`cd ui && npm test`, with a `:doc`), added to `check` after `lgx:test`; a "Dashboard unit tests" step (`lgx ui-test`) in `.github/workflows/test.yml` after "Unit tests".
  Run: `mise exec -- lgx ui-test`
  Expected: pass.

- [x] **Step 6: Commit**
  `git commit -m "Dashboard: the headline's wording as tested functions"`

> Deviation: the test script is `node --test "test/*.test.ts"`; Node 24 treats a bare `test/` argument as a file and fails. The CI step sits after "Install the dashboard" (right after "Unit tests" plus the install), so it runs inside the installed `ui/`.

### Task 5: Overlays, the top bar, routes and adding a site

**Files:**
- Create: `ui/src/components/Popover.tsx`, `Dialog.tsx`, `TopBar.tsx`, `SiteSwitcher.tsx`, `PeriodMenu.tsx`, `ActionsMenu.tsx`, `ui/src/pages/AddSite.tsx`
- Modify: `ui/src/api.ts`, `ui/src/App.tsx`, `ui/src/components/OnlineNow.tsx`, `ui/src/pages/Site.tsx`, `ui/src/pages/Login.tsx`
- Delete: `ui/src/pages/Sites.tsx`, `ui/src/components/PeriodPicker.tsx`, `ui/src/components/SiteForm.tsx`

Read `/frontend-design` before writing components. Everything here follows the Design's "Top bar and overlays" and "Sites, names and routes"; the labels and `aria-label`s there are exact, since Task 8's tests use them.

- [ ] **Step 1: `api.ts`**: the `Stats` and realtime types from the Design; `createSite(domain)` and `updateSite(id, domain)` send only `{domain}`. Keep the header comment's "change both together".

- [ ] **Step 2: `Popover` and `Dialog`** as the Design describes. `Popover` props: the trigger's content and `aria-label`, an alignment (`left` | `right`), and children as a render function receiving `close`. `Dialog` props: `open`, `onClose`, `title`, children.

- [ ] **Step 3: `SiteSwitcher`, `PeriodMenu`, `ActionsMenu`, `OnlineNow`, `TopBar`**. `PeriodMenu` takes over `PeriodPicker`'s custom-range state and validation (from ≤ to). `ActionsMenu` holds the tracking-code dialog (uses `Snippet`) and the settings dialog (domain form with the server's error shown; the delete block moves here from `Site.tsx:159-193`; after a delete, navigate to `/`; after a save, reload the sites). Sign-out keeps the behaviour and comment at `App.tsx:14-28` (signed out only once the server says so). `TopBar` takes optional site props, so `AddSite` can render it with the wordmark and sign-out only.

- [ ] **Step 4: Routes**: `App.tsx` gets `Home` and the route table from the Design; the guarded layout keeps the `max-w-[1000px]` column and no longer renders a bar itself. `AddSite.tsx` per the Design. `Site.tsx` renders `TopBar` in place of its header, panels and period row, stores the last-site key, and keeps rendering the old report body for now (Task 6 replaces it); remove `.rise` uses in files touched. `Login.tsx` navigates to `/`.

- [ ] **Step 5: Build and try it**
  Run: `cd ui && npm run build && npm run lint`
  Expected: both succeed, with no unused files left importing deleted ones.
  Then run `mise exec -- lgx run` and `mise exec -- lgx ui-dev`, sign in (`admin` in development) and walk through: add a site by domain, switch sites, each period option including a custom range and Back/Forward, the tracking-code and settings dialogs, Escape and outside-click on every overlay, keyboard-only use of each menu, sign out.

- [ ] **Step 6: Commit**
  `git commit -m "Dashboard: a top bar of small menus in place of the sites page"`

### Task 6: The dashboard body

**Files:**
- Create: `ui/src/components/Headline.tsx`, `Breakdown.tsx`, `Waiting.tsx`
- Modify: `ui/src/components/Timeseries.tsx`, `ui/src/pages/Site.tsx`
- Delete: `ui/src/components/StatRow.tsx`, `ui/src/components/RankedList.tsx`

Read `/dataviz` before changing the chart.

- [ ] **Step 1: `Headline`** per "Headline and small stats", using Task 4's functions; it exports the `Metric` type that `Timeseries` imports.

- [ ] **Step 2: `Timeseries`** per "Chart". Check in both colour schemes that the line, ticks and tooltip take the variables; if an SVG attribute does not resolve `var()`, pass the same value through the element's `style` instead.

- [ ] **Step 3: `Breakdown`** per "Breakdowns" (props: title or a header node for the Devices switch, rows of `{name, visitors, pageviews}`, an optional total pair that makes it a share list; Events passes its two fixed columns instead), and the section composition in `Site.tsx`: Pages and Sources in the first row, Countries and Devices (with its switch) in the second, Events below when non-empty.

- [ ] **Step 4: `Waiting`** per "Waiting state", and the three body states in `Site.tsx`: `has_events` false → `Waiting` (top bar without period and online); visitors 0 → the "Nobody visited …" sentence alone; otherwise the full body. `Waiting` holds the polled answer itself and shows "You're live" until "View dashboard" is clicked; an answer with `has_events: true` must not swap the body on its own. Keep the existing behaviours: the last report stays, dimmed, while a period loads (remember the period each report was loaded for and word the headline from that one, not from the URL, so a dimmed or failed-over report never claims the new period); a failed load shows the alert with Retry (`Site.tsx:109-117`), now in `text-danger`.

- [ ] **Step 5: Build**
  Run: `cd ui && npm run build && npm run lint && npm test`
  Expected: all succeed; `grep -rn "rise\|display-num\|bg-card\|red-800\|uppercase" ui/src` prints nothing.

- [ ] **Step 6: Commit**
  `git commit -m "Dashboard: a sentence, one line and four open lists"`

### Task 7: The sign-in page

**Files:**
- Modify: `ui/src/pages/Login.tsx`

- [ ] **Step 1: Restyle** to the theme: no card, border or shadow around the form; a centred narrow column with the wordmark, the line "Analytics without the cookies.", a sentence-case "Password" label, a bordered 8px-radius input on `surface`, and the ink "Sign in" button. Keep `#password`, the `role="alert"` text "Wrong password", the shake, and the `aria-invalid` wiring.

- [ ] **Step 2: Build**
  Run: `cd ui && npm run build && npm run lint`
  Expected: both succeed.

- [ ] **Step 3: Commit**
  `git commit -m "Dashboard: the sign-in page in the new theme"`

### Task 8: Browser tests

**Files:**
- Modify: `e2e/tests/dashboard.spec.js` (and `e2e/tests/helpers.js` only if a helper no longer fits)

- [ ] **Step 1: Rewrite the dashboard spec** as one flow, keeping its comments' style:
  1. Wrong password says "Wrong password" and stays; the right one leaves `/login`.
  2. `page.goto('/sites/new')`, fill `#site-domain`, click "Add website"; the URL becomes `/sites/<12 hex>`; `getByTestId('waiting')` is visible and contains the script tag.
  3. Post three pageviews as now (`/`, `/pricing`, `/docs`, `z: 'Europe/Amsterdam'`); "You're live" appears within 20s; click "View dashboard".
  4. `getByTestId('headline')` reads "1 person visited in the last 7 days."; `metric-pageviews` contains "3"; `stat-bounce` contains "0%"; `panel-pages` has 3 `li`; `panel-countries` has 1 `li` containing "Netherlands", "1" and "100%"; there is no `panel-events`. In `panel-pages`, click "Show views": the row for `/` shows 1 and the button now offers "Show visitors".
  5. `online-now` reads "1 online" (allow 20s); clicking it shows "1 person is here now".
  6. Click `metric-pageviews`: it becomes `aria-pressed="true"` and `metric-visitors` `"false"`.
  7. Open "Period", choose "Last 30 days": the URL has `period=30d`, the stats response for it arrives, the headline reads "… in the last 30 days."
  8. "Site actions" → "Site settings": "Delete site" is disabled until the domain is typed; after the click, wait for the `GET /api/sites` answer and assert the domain is not in it, and the URL is no longer the site's.

- [ ] **Step 2: Run**
  Run: `mise exec -- lgx e2e`
  Expected: both specs pass (the tracker spec is untouched and creates its site through the API with a name, which the server still accepts).

- [ ] **Step 3: Commit**
  `git commit -m "Browser tests for the redesigned dashboard"`

### Task 9: A visual pass

**Files:** whatever the pass finds, in `ui/src/`.

- [ ] **Step 1: Seed and look.** With the server stopped, backfill about 30 days of events for one site into a scratch database with a throwaway script (several pages, referrers, countries, devices, browsers, one custom event; do not commit the script), then run the built binary and take screenshots with headless Chromium: the dashboard at 1280px in light and dark (`colorScheme` in Playwright), at 390px, each open overlay, the waiting state, "You're live", the "Nobody visited" state, the add page and sign-in.

- [ ] **Step 2: Critique against the brief and `/frontend-design`.** Check: the headline is the only large thing; the page is about 1–1.5 screens at 1280×800; no section sits in a box; the accent appears only where the Design lists it; no uppercase labels; text contrast holds in both schemes; focus rings are visible on every control; nothing animates on load. Remove one thing that does not earn its place. Fix what is off and rerun `cd ui && npm run build && npm run lint && npm test`.

- [ ] **Step 3: Fonts through the binary.** Repeat the KNOWLEDGE check for the new font: for each Newsreader file in `resources/public/app/`, `curl -s localhost:<port>/app/<file> | cmp - resources/public/app/<file>` prints nothing, and the page's computed headline font is Newsreader.

- [ ] **Step 4: Run everything**
  Run: `mise exec -- lgx check`
  Expected: unit, dashboard and browser tests pass.

- [ ] **Step 5: Commit**
  `git commit -m "Dashboard: fixes from the visual pass"` (skip if the pass changed nothing)

### Task 10: Docs

**Files:**
- Modify: `README.md`, `docs/KNOWLEDGE.md`

- [ ] **Step 1: README**: rewrite the "Screens:" paragraph under "The dashboard" for the new shape (sign-in; one page per site with the site switcher, period menu, who is online and on which pages, the headline numbers including bounce rate and the comparison with the span before, the chart, and the lists; adding a site by its domain and the waiting state; tracking code and settings behind the `···` menu; light and dark). Mention `lgx ui-test` beside the other commands, and in "what is collected" or the nearest fitting place, one line defining bounce (a visitor-day whose only event is one pageview) if the README defines the other numbers. Fix any other line that names Fraunces or the sites list.

- [ ] **Step 2: KNOWLEDGE**: the stack table's font row (Newsreader, IBM Plex Sans) and the "Fonts through the binary" note, dated, with what Task 9 Step 3 found; a short dated note on anything learned (for example whether `var()` works in Recharts' SVG attributes, and `node --test` running `.ts` directly on Node 24).

- [ ] **Step 3: Commit**
  `git commit -m "docs: the redesigned dashboard"`
