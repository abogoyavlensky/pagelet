# Dashboard Auto-Refresh Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dashboard left open stays current: the site page and the overview refetch their numbers every 60 s while visible and at once when the tab or app comes back, and a Refresh button asks on demand.

**Tech Stack:** React 19 / react-router 7 / TypeScript in `ui/`, `node --test` for the UI's unit tests, Playwright 1.56 in `e2e/`. No server change.

**Repo:** `~/Projects/pagelet`. Work on a branch `auto-refresh` off `master` and open a PR, as the earlier work did. Run every command through mise (`mise exec -- lgx ...`).

---

## Design

### The problem

The report on `/sites/:id` loads once per period or session change (`ui/src/pages/Site.tsx:61-66`) and never again; the overview's cards load once on mount (`ui/src/pages/Sites.tsx:30-35`). Only the "Right now" card (15 s) and the first-visit screen (5 s) poll. A dashboard left open goes stale, and the installed app (standalone window) has no browser reload button to fix it.

### Approach

Polling, in the UI only. Every 60 s while the page is visible, and at once when it becomes visible again, the page asks for its data again and swaps the new numbers in **quietly**: no dimming, no blanking. A Refresh button in the top bar does the same on demand, **loudly**: the page dims as it does on a period switch, and the button's icon spins.

Rejected: server-sent events. A stale dashboard does not need 5-second freshness, and SSE would add the system's only long-lived connection. Also not built now: server-side caching and a slower interval for signed-out viewers; the load of one stats call a minute per visible tab is small for this deployment.

### `useApi` gains a quiet reload (`ui/src/api.ts`)

`Loaded<T>` gets one more function:

```ts
export type Loaded<T> = {
  data: T | undefined
  error: ApiError | Error | undefined
  loading: boolean
  /** Ask again, showing `loading`. */
  reload: () => void
  /** Ask again without `loading`: the last data stays as it is until the answer. */
  refresh: () => void
}
```

`refresh` differs from `reload` in one thing only: it does not set `loading` to true. Its answer is handled exactly like any other: success sets the data and clears the error; failure sets the error. Both set `loading` to false, so a quiet refresh that overtakes a loud load in flight still ends the loading state.

A failed quiet refresh is therefore **shown**, through what the pages already have: on the site page the alert "Could not load this period ... Showing the previous one. Retry" appears and the report dims (`Site.tsx:103-109, 117`), and the next successful tick clears it. This is deliberate: a dashboard that cannot reach the server should say that its numbers are not current. It also means a session that ends while a **private** site's page is open is noticed on the next tick: the stats call answers 401 and the existing `useSignedOutOn` signs the page out. On a **public** site the stats call keeps answering 200 without a session, so the owner's controls stay on screen until some other request answers 401, exactly as today; this plan does not add a session check.

Implementation shape: `useApi` today starts each load from an effect keyed on `[run, tick]` with a per-effect `live` flag. A quiet refresh must not go through a flag that the effect reads and resets (StrictMode runs effects twice in dev, `ui/src/main.tsx`, and a period switch on the same tick must still dim). Use one generation counter instead:

- a `useRef` counter `gen`; a `start(quiet: boolean)` function that takes `const g = ++gen.current`, sets `loading` true unless `quiet`, calls the latest `run()`, and applies the answer only if `gen.current === g`;
- the effect (deps `[run, tick]`, as now) calls `start(false)` and its cleanup bumps `gen.current`, so an answer for old deps or after unmount is dropped;
- `reload` stays `setTick((t) => t + 1)`; `refresh` is `() => start(true)`.

`refresh` is a new function on every render; callers hold the latest one (see the hook below), not a stale closure.

### One hook for "again every minute while visible" (`ui/src/refresh.ts`, new)

```ts
export const REFRESH_MS = 60_000

/**
 * Call `again` every REFRESH_MS while the tab is visible, and at once when
 * it becomes visible again. Not on mount: the page's own first load does
 * that. `enabled` false stops it.
 */
export function useRefresh(again: () => void, enabled = true): void
```

- It keeps the latest `again` in a ref, so the effect depends only on `enabled` and a re-render does not restart the timer.
- Visible on mount (and enabled): start the interval, no immediate call. Hidden: clear it. Visible again: call `again()` at once and start a fresh interval. This is the pattern of `Waiting.tsx:27-37`; `LiveCard.tsx` and `Waiting.tsx` keep their own timers and are not refactored onto the hook (they differ in interval and in polling on mount, and this plan does not need to touch that).
- Cleanup clears the interval and removes the `visibilitychange` listener.

### Which periods refresh (`ui/src/format.ts`)

A period that ended before today cannot change, so it has no timer and no refetch on return.

```ts
/** Whether the period reaches today (UTC), so its numbers can still change. */
export function isCurrent(p: Period, today = utcDay()): boolean
```

`today`, `7d` and `30d` are always current; `custom` is current when `p.to >= today` (plain string comparison of `YYYY-MM-DD`; the server's days are UTC days, and `utcDay` already exists in `format.ts`). The `today` parameter is there for the unit test.

The Refresh button is not tied to this: it is offered for any period.

### The site page (`ui/src/pages/Site.tsx`)

- `useRefresh(report.refresh, enabled)` where `enabled` is `shown !== undefined && isCurrent(period) && (!waiting || viewer)`. While the owner's first-visit screen is up, `Waiting` does its own 5 s polling and the hook stays off. A visitor on a public site with no events sees "No visits recorded yet" with no polling of its own (`Site.tsx:111-114`), so the hook stays on there, and the report appears within a minute of the first visit.
- Only the report refreshes on the timer. The site list (`sites`) does not; the "Right now" card keeps its own 15 s poll and already polls at once when the tab becomes visible.
- Manual refresh: `const refreshNow = () => { report.reload(); setNudge((n) => n + 1) }`. `nudge` is a counter in `Site`, passed down through `Body` to `LiveCard`.
- `TopBar` gets `onRefresh={refreshNow}` and `refreshing={report.loading}`.
- No change to how `first` works: after "View dashboard", the first report that has events (now at most a minute away) replaces it as before.

### "Right now" follows a manual refresh (`ui/src/components/LiveCard.tsx`)

`LiveCard` takes an optional `nudge?: number` prop and adds it to its effect's deps (`[siteId, nudge]`). A changed `nudge` restarts the effect, which polls at once when visible and restarts the 15 s interval. The card keeps its last answer on screen meanwhile (`now` is state outside the effect).

### The overview (`ui/src/pages/Sites.tsx`)

- `Sites` owns a `tick` counter and passes it to every `SiteCard`, which adds it to its effect's deps beside `tries` (`[site.id, tries, tick]`). The card's stats and its "online" badge are asked for again; `setStats`/`setOnline` run only on success, so the card keeps its numbers while the request is out and when it fails. A 401 still signs out through the card's `useSignedOutOn(failed)`.
- `useRefresh(() => { sites.refresh(); setTick((t) => t + 1) })`: the site list is refreshed quietly too, so a site added or removed elsewhere shows up.
- The top bar gets the Refresh button here as well: `onRefresh={() => { sites.reload(); setTick((t) => t + 1) }}`, `refreshing={sites.loading}`. The overview is where the installed app opens.

### The Refresh button (`ui/src/components/TopBar.tsx`, `ActionsMenu.tsx`, `Icons.tsx`)

- `TopBar` takes `onRefresh?: () => void` and `refreshing?: boolean`. When `onRefresh` is given it renders `RefreshButton` in the right-hand group: after the period control, before Settings / Sign out / "Sign in". So a visitor on a public site gets it too.
- On the site page `Site` passes `onRefresh` when `!waiting || viewer`: whenever the report shows, and on a visitor's "No visits recorded yet" view. It is left out only on the owner's first-visit screen, which polls by itself. `Sites` always passes it.
- `RefreshButton({ onClick, busy })` lives in `ActionsMenu.tsx` beside `SettingsButton`, uses the same `iconButton` class, is icon-only at every width, has `aria-label="Refresh"`, and is `disabled` while `busy`. Its icon is Lucide's `refresh-cw` added to `Icons.tsx` as `RefreshIcon({ spinning })`, which adds `motion-safe:animate-spin` while spinning.
- On a phone the top row already holds the logo, the site button and two icon buttons; the third must fit at 360 px without wrapping or squeezing the site button to nothing. Check it in the browser; if it does not fit, the fix is the gap/padding of the right-hand group, not hiding the button.

### Tests

- Unit (`ui/test/format.test.ts`): `isCurrent` for the three presets, a custom range ending yesterday (false), ending today (true), ending in the future (true), with a fixed `today`.
- Browser (`e2e/tests/refresh.spec.js`, new): one spec, one site, created through the API as `public.spec.js` does.
  1. `await page.clock.install()` before the first navigation, so the page's timers can be advanced. Sign in through the page, open the site, wait for `Pageviews 1`.
  2. **Button:** post a second event, then click Refresh until the tile reads 2 (`expect(async () => {...}).toPass()`, since a click can land before the 300 ms flush). No `page.reload()`.
  3. **Timer:** post a third event, wait about 1 s of real time for the flush (poll the stats API with the `stats` helper until it reports 3), then `await page.clock.fastForward(60_000)` and expect the tile to read 3.
  4. **Return to the tab:** make the page hidden (`page.evaluate`: `Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })`, then dispatch `visibilitychange`), post a fourth event and wait for the API to report 4, make it visible again the same way, and expect the tile to read 4 with no clock advance.
  5. **Overview:** go to `/`, find the site's card by its domain and expect `1` visitors; post an event with a different `User-Agent` header (a second visitor), wait for the API, `fastForward(60_000)`, and expect the card to read `2`.
  6. **A failed quiet refresh shows and heals** (on the site page, before going to the overview): `page.route` the stats URL to abort, `fastForward(60_000)`, expect the alert "Could not load this period"; `page.unroute`, `fastForward(60_000)`, expect the alert gone and the tile unchanged.
  7. Delete the site through the API.
  If `page.clock` interferes with anything the page needs (the app uses `setInterval`, `setTimeout` and `Date.now` only), fall back to `page.clock.install()` after the first load plus `runFor`, and record what was needed in `docs/KNOWLEDGE.md`.
- The existing specs must stay green unchanged: the new timer is 60 s and none of them waits that long on one page.

### Docs

- `README.md`, "The dashboard" section: say that an open dashboard refreshes every minute while visible and when you return to it, and that the top bar has a Refresh button.
- `docs/KNOWLEDGE.md:206` says "**No response streaming**: online-now is polled every 15 s by the UI." That is out of date as a statement about let-go: the v1.13.0 tag contains `streamResponseBody` (`pkg/rt/http.go`, let-go #851), which writes a channel or lazy-seq response body chunk by chunk with a flush after each. Reword the bullet: streaming exists in let-go 1.13.0 but has not been tried in pagelet or through Caddy; the dashboard polls by choice (the "Right now" card every 15 s, the reports every 60 s). Do not claim streaming works here.
- Add a short KNOWLEDGE entry for anything learned about `page.clock` or the visibility emulation in the spec.

## File Structure

| File | Change |
|---|---|
| `ui/src/api.ts` | `useApi`: generation counter, `refresh` on `Loaded<T>` |
| `ui/src/refresh.ts` (new) | `REFRESH_MS`, `useRefresh` |
| `ui/src/format.ts` | `isCurrent` |
| `ui/test/format.test.ts` | `isCurrent` cases |
| `ui/src/components/Icons.tsx` | `RefreshIcon` |
| `ui/src/components/ActionsMenu.tsx` | `RefreshButton` |
| `ui/src/components/TopBar.tsx` | `onRefresh`, `refreshing` props; renders the button |
| `ui/src/components/LiveCard.tsx` | `nudge` prop |
| `ui/src/pages/Site.tsx` | the timer, the manual refresh, `nudge` through `Body` |
| `ui/src/pages/Sites.tsx` | `tick` for the cards, the timer, the button |
| `e2e/tests/refresh.spec.js` (new) | button, timer, return to the tab, overview |
| `README.md`, `docs/KNOWLEDGE.md` | as under Docs |

---

### Task 1: Branch, `isCurrent`, and the quiet reload

**Files:**
- Modify: `ui/src/format.ts`, `ui/src/api.ts`
- Test: `ui/test/format.test.ts`

- [x] **Step 1: Branch**
  `git checkout -b auto-refresh` from an up-to-date `master`. Commit this plan first if it is not committed yet (`Plan: dashboard auto-refresh`).

- [x] **Step 2: Write the failing test for `isCurrent`**
  In `ui/test/format.test.ts`, import `isCurrent` and add a test with `today = '2026-09-30'`: `today`, `7d`, `30d` → true; custom `09-01..09-29` → false; `09-01..09-30` → true; `09-01..10-05` → true.
  Run: `mise exec -- lgx ui-test`. Expected: FAIL (no export `isCurrent`).

- [x] **Step 3: Implement `isCurrent`** in `ui/src/format.ts` with the signature from Design.
  Run: `mise exec -- lgx ui-test`. Expected: PASS.

- [x] **Step 4: `useApi`'s `refresh`**
  Rework `useApi` in `ui/src/api.ts` as Design describes (generation counter, `start(quiet)`, `refresh`), and extend `Loaded<T>` and the hook's doc comment. Behaviour for existing callers must not change: `reload` still shows `loading`, a stale answer is still ignored, the last data still stays while a load is in flight.
  Run: `cd ui && npx tsc -b && npm run lint`. Expected: no errors.

- [x] **Step 5: Commit**
  `git commit -m "Dashboard: a quiet reload in useApi; isCurrent for periods"`

### Task 2: The `useRefresh` hook and the site page's timer

**Files:**
- Create: `ui/src/refresh.ts`
- Modify: `ui/src/pages/Site.tsx`

- [x] **Step 1: Write `useRefresh`** in `ui/src/refresh.ts` per Design (latest callback in a ref; no call on mount; call at once on becoming visible; off when `enabled` is false).

- [x] **Step 2: Use it in `Site`**
  `useRefresh(report.refresh, shown !== undefined && isCurrent(period) && (!waiting || viewer))`. The hook call must sit above the early returns in `Site` (hooks cannot follow a conditional return), so compute `shown` and `waiting` before them or move the call accordingly.

- [x] **Step 3: Check by hand**
  `mise exec -- lgx run` and `mise exec -- lgx ui-dev`; open a site with events, post an event with curl (see the README's event format or `e2e/tests/dashboard.spec.js` for the body), and temporarily set `REFRESH_MS` to 5000 to watch the tile change without the page dimming. Switch to a custom range that ended yesterday and confirm in the network panel that no stats requests repeat. Restore `REFRESH_MS` to `60_000`.
  Run: `cd ui && npx tsc -b && npm run lint`. Expected: no errors.

- [x] **Step 4: Commit**
  `git commit -m "Dashboard: the report refreshes every minute and on return to the tab"`

> Deviation: the hand check with a 5 s `REFRESH_MS` was replaced by the browser spec (Task 5), which drives the real 60 s timer with Playwright's clock, plus the end-to-end pass at the end.

### Task 3: The Refresh button

**Files:**
- Modify: `ui/src/components/Icons.tsx`, `ui/src/components/ActionsMenu.tsx`, `ui/src/components/TopBar.tsx`, `ui/src/components/LiveCard.tsx`, `ui/src/pages/Site.tsx`

- [ ] **Step 1: `RefreshIcon` and `RefreshButton`** per Design (Lucide `refresh-cw` paths, `aria-label="Refresh"`, disabled and spinning while busy, `motion-safe:` on the spin).

- [ ] **Step 2: `TopBar` props** `onRefresh` and `refreshing`; render the button after the period control and before Settings / Sign out / "Sign in". Update the component's doc comment.

- [ ] **Step 3: `LiveCard`'s `nudge`** prop in the effect deps; update its doc comment.

- [ ] **Step 4: Wire `Site`**: the `nudge` state, `refreshNow`, `nudge` through `Body` to `LiveCard`, and `onRefresh`/`refreshing` on `TopBar` when `!waiting || viewer`.

- [ ] **Step 5: Check by hand** in the dev server: the button dims the report and spins, the "Right now" card asks again (network panel), a public site's signed-out view has the button, and the top row fits at 360 px wide and at 768 px (signed in and as a visitor).
  Run: `cd ui && npx tsc -b && npm run lint`. Expected: no errors.

- [ ] **Step 6: Commit**
  `git commit -m "Dashboard: a Refresh button in the top bar"`

### Task 4: The overview

**Files:**
- Modify: `ui/src/pages/Sites.tsx`

- [ ] **Step 1: `tick`** state in `Sites`, passed to `SiteCard` and added to its effect deps; `useRefresh` that refreshes the list quietly and bumps `tick`; `onRefresh`/`refreshing` on the overview's `TopBar`.

- [ ] **Step 2: Check by hand**: with `REFRESH_MS` temporarily at 5000, a card's visitors and "online" badge change after a posted event without the card blanking or the sparkline flashing; the button does the same on demand. Restore `REFRESH_MS`.
  Run: `cd ui && npx tsc -b && npm run lint`. Expected: no errors.

- [ ] **Step 3: Commit**
  `git commit -m "Dashboard: the overview refreshes too"`

### Task 5: The browser spec

**Files:**
- Create: `e2e/tests/refresh.spec.js`

- [ ] **Step 1: Write the spec** as under Design → Tests, with a header comment in the style of the other specs. Reuse `apiLogin`, `createSite`, `deleteSite`, `stats`, `uniqueDomain` from `helpers.js`; copy the small `signIn(page)` from `public.spec.js` into `helpers.js` and import it in both specs rather than duplicating it.

- [ ] **Step 2: Run it**
  Run: `mise exec -- lgx e2e`. Expected: every spec passes, the new one included.
  Then `cd e2e && npx playwright test refresh --repeat-each 3`. Expected: all green (the spec must not be flaky against the flush interval).

- [ ] **Step 3: Commit**
  `git commit -m "e2e: the dashboard refreshes by button, by timer and on return"`

### Task 6: Docs and the full check

**Files:**
- Modify: `README.md`, `docs/KNOWLEDGE.md`, this plan

- [ ] **Step 1: README and KNOWLEDGE** as under Design → Docs.

- [ ] **Step 2: Full check**
  Run: `mise exec -- lgx check`. Expected: server tests, UI unit tests and every browser spec pass.

- [ ] **Step 3: Commit**
  `git commit -m "docs: the dashboard refreshes itself"`

- [ ] **Step 4: Close the plan**
  Mark the plan completed with a short summary and any deviations, as the earlier plans do; commit (`Plan: dashboard auto-refresh is done`). Push the branch and open a PR against `master`.
