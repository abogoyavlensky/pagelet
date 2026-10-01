# Dashboard Bento Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rejected "Lichen" dashboard UI (docs/plans/2026-10-01-1848-dashboard-redesign.md) with a modern, readable bento layout in soft colours, the shape of popular analytics apps, built for phones as well as desktops.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind 4, react-router 7, Recharts 3, Onest (`@fontsource-variable/onest`), Playwright 1.56, Node 24 `node --test`.

---

## Design

The user rejected the Lichen UI ("navigation is not clear, UX awful, looks bad"): its controls were disguised as text, the sentence headline took a third of the screen, and the cream-and-serif look read as an unfinished blog. They approved a mockup of this design. The server additions from the previous plan (bounce rate, the previous span, `has_events`, pages online now, sites named after their domain) stay as they are.

### Shape

- **`/` is a websites overview.** One card per site: its initial on a soft tile, the domain, "N online" when someone is there, the last 7 days' visitors with the change against the 7 days before, and a sparkline. A site with no events says "Waiting for the first visit". "Add website" is a button and a dashed card.
- **A site page** (`/sites/:id`) has one top bar: the logo (to `/`), `/`, the site as a bordered button that switches sites (with who is online on each, "All websites" and "Add website"), then the period as tabs (Today, 7 days, 30 days, Custom with two date fields), a labelled Settings button and a sign-out icon. On a phone the period tabs get their own full-width row.
- **The site body is a bento grid:**
  - four stat tiles, each in its metric's soft colour: Visitors, Pageviews, Views per visit (each with an up/down badge against the span before) and Bounce rate ("Visits that saw one page");
  - a Traffic card (the chart, with a Visitors/Pageviews toggle in its header) beside a Right now card (who is online, the pages they are on);
  - Pages and Sources cards (visitors and views per row, over soft bars);
  - Countries (visitors and share) beside a column of Devices (tabs: Devices, Browsers, Systems) and Events (or a hint showing `pagelet("signup")` when there are none).
  - Lists show seven rows, then "Show all N".
  - On a phone: stat tiles in a 2×2 grid, every card full width.
- **Settings** is one dialog: the tracking code, the domain, and deleting the site (type the domain to confirm).
- **Waiting**, **Add a website** and **Sign in** sit on single cards.

### Look

- Canvas `#F2F3F7`, white cards with a hairline and 20px corners, no shadows except on floating things (menus, dialogs, the tooltip).
- One sans, Onest (true tabular figures checked), semibold numbers, no uppercase labels, no serif. Newsreader and IBM Plex Sans go.
- Metric colours, each a soft tint for its tile, a strong tone for its dot and line, a deep tone for text on the tint: visitors `#3B6FE0`, pageviews `#16935E`, views per visit `#7C5CDB`, bounce `#D9692F` (the `/dataviz` validator passes all six checks on white). The chart wears the colour of the metric it plots.
- Up badges green, down badges orange.
- Dark theme by the system setting: the same roles on `#0F1115` / `#171A21`, metric tones lightened and validated against the dark card.

### Code

- `components/Card.tsx` (card shell and `Segmented` tabs), `StatCards.tsx`, `Timeseries.tsx` (the Traffic card), `LiveCard.tsx`, `Breakdown.tsx` (list cards and `Events`), `PeriodControl.tsx`, `TopBar.tsx`, `SiteSwitcher.tsx`, `SiteMark.tsx`, `ActionsMenu.tsx` (`SettingsButton`, `SignOutButton`), `Waiting.tsx`, `Wordmark.tsx`; `pages/Sites.tsx` (the overview), `Site.tsx`, `AddSite.tsx`, `Login.tsx`.
- Gone: `Headline.tsx`, `OnlineNow.tsx`, `PeriodMenu.tsx`, the "last site" memory (`/` is the overview now).
- `format.ts` keeps `count`, `tick`, `longDate`, `utcDay`, `country`, `periodLabel`, `share`, and gains `change(now, then)` and `versus(period)` for the badges, tested in `ui/test/format.test.ts`; the sentence helpers (`people`, `periodPhrase`, `comparison`) go with the sentence headline.
- Test ids: `stat-visitors`, `stat-pageviews`, `stat-views-per-visit`, `stat-bounce`, `online-now` (the Right now card), `panel-<name>`, `waiting`.

---

### Task 1: The bento UI

**Files:** `ui/src/**`, `ui/package.json`

- [x] **Step 1:** Land the approved mockup's components and pages; drop the unused fonts, components and the last-site memory.
- [x] **Step 2:** Move the badge logic into `format.ts` (`change`, `versus`), drop the sentence helpers, update `ui/test/format.test.ts`.
- [x] **Step 3:** Dark theme: validate the dark metric tones with `/dataviz`'s script against `#171A21`; ink buttons use `text-paper` so they invert.
- [x] **Step 4:** `cd ui && npm run build && npm run lint && npm test` pass; no horizontal overflow at 390px.
- [x] **Step 5:** Commit `Dashboard: a bento layout in soft colours`.

> Deviation: the dark metric tones are `#4F84EA`, `#1F9F67`, `#8A6DE6`, `#DD7440`; a lighter first try failed the validator's dark lightness band. CSS grids use `grid-cols-1` (`minmax(0, 1fr)`) and `min-w-0` items, since a non-wrapping row otherwise widened the page past a 390px screen.

### Task 2: Browser tests

**Files:** `e2e/tests/dashboard.spec.js`

- [x] **Step 1:** Rewrite the flow: wrong then right password; the overview; "Add website" by domain; the waiting card and "You're live"; the stat tiles (1 visitor, 3 pageviews, 0% bounce); 3 pages; Netherlands at 100%; the Right now card at 1; the chart toggle; the 30 days tab; delete from Settings, back on the overview without the site.
- [x] **Step 2:** `mise exec -- lgx e2e` passes, three times in a row.
- [x] **Step 3:** Commit `Browser tests for the bento dashboard`.

### Task 3: Docs, review, final check

**Files:** `README.md`, `docs/KNOWLEDGE.md`, this plan

- [ ] **Step 1:** README's dashboard paragraph and KNOWLEDGE's font notes for the new UI; mark the Lichen plan's UI as superseded by this one.
- [ ] **Step 2:** Codex review of the branch against `dashboard-redesign`; fix must-fix findings.
- [ ] **Step 3:** `mise exec -- lgx check`, and a screenshot pass (desktop light and dark, phone) against the built binary.
- [ ] **Step 4:** Commit `docs: the bento dashboard`.
