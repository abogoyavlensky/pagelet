# Manual Site Order and the Capitalized Name Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner arranges the websites on the overview by dragging them, the order is kept on the server, and the product name reads "Pagelet" wherever the dashboard shows it.

**Tech Stack:** let-go 1.13 / DuckDB / ragtime migrations on the server; React 19 / react-router 7 / TypeScript / Tailwind 4 in `ui/`, with dnd-kit (`@dnd-kit/core` 6.3, `@dnd-kit/sortable` 10, `@dnd-kit/utilities` 3.2) added for the drag; Playwright 1.56 in `e2e/`.

**Repo:** `~/Projects/pagelet`. Work on a branch `site-order` off `master` and open a PR, as the earlier work did. Run every command through mise (`mise exec -- lgx ...`).

---

## Design

### The problem

The overview (`ui/src/pages/Sites.tsx`) and the site switcher (`ui/src/components/SiteSwitcher.tsx`) list sites in domain order, because `db/sites` says `order by domain` (`src/pagelet/db.lg:61`). The owner wants to arrange them by hand. Separately, the name is written "pagelet" in the header and should be "Pagelet".

Rejected in discussion: ordering by traffic, pinning, and move up / move down buttons. The five stat cards on the site page stay as they are.

### The order lives in a `position` column

Migration `008-add-sites-position` adds `position integer` to `sites` (no constraint: DuckDB takes none in `add column`, see migration 006) and numbers the existing rows 1..n in domain order, so nothing moves on upgrade:

```sql
alter table sites add column position integer
update sites set position = r.n
  from (select id, row_number() over (order by domain) as n from sites) r
  where sites.id = r.id
```

Down drops the column.

`position` is **not** part of the site JSON. The order of the array `/api/sites` returns is the order; `site-columns` and the `Site` type in `ui/src/api.ts` do not change.

In `db.lg`:

- `sites` orders by `position, domain` (domain breaks a tie and places a null, which DuckDB sorts last). Its docstring says so. `sites-by-domain` builds a map from it and does not care about order, so ingest is unaffected.
- `create-site!` puts a new site at the end: its position is `coalesce(max(position), 0) + 1` over the table, computed in the same insert statement (an `insert ... select` over `sites`; an aggregate over an empty table still yields one row). The signature does not change.
- New `reorder-sites!`:

  ```clojure
  (defn reorder-sites!
    "Put the sites in the order of `ids`, in one transaction: the listed
     ones first as given, the others after them in the order they had.
     Ids that name no site are ignored. Returns every site, in the new order."
    [conn ids])
  ```

  It reads the current ids in order inside the transaction, builds the final list (listed known ids, de-duplicated keeping the first occurrence, then the rest), writes `position` 1..n with one `update sites set position = ? where id = ?` per site, and returns `(sites conn)`.

  The lenient merge is deliberate. A list that went stale (a site added or deleted in another tab between loading the overview and dropping a card) still saves, and the answer carries the true list. A strict "must be a permutation" check would turn that into an error for no gain.

### The endpoint

`PUT /api/sites/order`, body `{"ids": ["<id>", ...]}`, in `routes.lg` beside the other site routes: `protected` and `json-only`, like every dashboard write.

- `ids` must be an array of strings; anything else is `400 {"error": "ids must be a list of site ids."}`.
- Otherwise `200` with `db/reorder-sites!`'s result: the full site list in the new order, the same shape as `GET /api/sites`.
- No `ingest/refresh-sites!`: the ingest cache is keyed by domain and no domain changed.

ruuter 2.1.1 matches a literal segment before a parameter (`ruuter/core.cljc`, "literal first, then param"), so `/api/sites/order` does not fall into `PUT /api/sites/:id`. Site ids are 12 hex characters, so no site is ever named `order`. A route test pins both.

### `useApi` gains `mutate` (`ui/src/api.ts`)

The overview must show the dropped order at once and take the server's answer when it comes. `Loaded<T>` gets one more function:

```ts
/** Replace the data in place. Any answer still in flight is dropped. */
mutate: (data: T) => void
```

It bumps the generation counter (so an older ask's answer cannot overwrite it), sets the data, clears the error and sets `loading` false.

`api` gains:

```ts
reorderSites: (ids: string[]) => request<Site[]>('PUT', '/api/sites/order', { ids }),
```

### Dragging on the overview (`ui/src/pages/Sites.tsx`)

dnd-kit's classic packages: `DndContext` with `closestCenter`, a `SortableContext` over the site ids with `rectSortingStrategy` (the grid is one to three columns), and two sensors: `PointerSensor` (mouse, touch and pen) and `KeyboardSensor` with `sortableKeyboardCoordinates`. dnd-kit's built-in live-region announcements stay on.

**The card and its handle.** Today the whole card is a `<Link>`. A button cannot sit inside a link, so each card becomes a `relative` wrapper `<div>` (the sortable node: `setNodeRef`, the transform and transition styles) holding two siblings:

- the `<Link>`, unchanged in look and behaviour, so a click or tap anywhere on the card still opens the site;
- a grip handle: a `<button type="button">` at the card's top right corner, absolutely positioned over the card, carrying the sortable `attributes` and `listeners` (through `setActivatorNodeRef`), `aria-label="Reorder <domain>"`, `data-testid="site-handle"`, `touch-action: none` (Tailwind `touch-none`) so a touch drag does not scroll the page, `cursor-grab`, and a `GripIcon` (Lucide's `grip-vertical`, added to `ui/src/components/Icons.tsx` in the file's style). It is `text-faint`, `text-muted` on hover and focus. Only the handle starts a drag, so no activation delay or distance is needed.

The card's header row gets right padding so the "N online" badge sits left of the handle and never under it. The wrapper carries `data-testid="site-card"`. While dragged, the wrapper is raised (`z-10`) with a shadow. No `DragOverlay`.

With fewer than two sites there is nothing to reorder: the handle is not rendered. The dashed "+ Add website" tile stays the grid's last child, outside the sortable items, and never moves.

**On drop.** When the card landed on a different one: compute the new list with `arrayMove`, remember the previous list, `sites.mutate(next)`, and call `api.reorderSites(next.map((s) => s.id))`.

- Success: `sites.mutate(saved)` with the server's list.
- Failure: `sites.mutate(previous)`, so the cards snap back, and show `Could not save the order.` as a `role="alert"` line in the style of the existing "Could not load the websites." line. A 401 goes through `useSignedOutOn` like the page's other errors. The line clears when the next drag starts.

Cards are keyed by site id, so a reorder moves them without remounting and each keeps its loaded numbers.

**The list holds still while busy.** Two flags: `dragging` (drag start until drop or cancel) and `saving` (drop until the save settles). `busy` is either. While busy, nothing but the drag and its save may change the list:

- `useRefresh(..., !busy)` uses the hook's existing `enabled` argument (`ui/src/refresh.ts`), so the minute tick and the return-to-tab refresh do not fire.
- A list request already in flight when the drag starts is dropped: drag start calls `sites.mutate(sites.data)`, which bumps the generation and keeps the data.
- The Refresh button stays in place but does nothing while busy: its handler returns early. `refreshing` is true for `saving` as well as `sites.loading`, so the icon turns during the save.
- One save at a time: while `saving`, sorting is disabled (`useSortable({ id, disabled: saving })` and the handle `disabled`), so a second drop cannot race the first. A save takes one round trip, so the wait is not felt.

**The switcher** needs no change: it renders the `sites` array it is given, which now comes in the saved order (`ui/src/pages/Site.tsx:40` loads it from `api.sites`).

### The name

"Pagelet" replaces "pagelet" where the dashboard shows the product name:

| Where | Now | After |
|---|---|---|
| `ui/src/components/Wordmark.tsx:10` (every header, the owner's and a public viewer's, and the login page if it uses the wordmark) | `pagelet` | `Pagelet` |
| `ui/src/components/TopBar.tsx:55` `aria-label` | `pagelet, all websites` | `Pagelet, all websites` |
| `ui/index.html:11` `<title>` | `pagelet` | `Pagelet` |
| `ui/public/manifest.webmanifest` `name`, `short_name` | `pagelet` | `Pagelet` |
| `ui/src/pages/AddSite.tsx:34` | `...is all pagelet needs.` | `...is all Pagelet needs.` |

Left lowercase on purpose: `pagelet("signup")` in `Breakdown.tsx:105` and the README's tracker examples (the JavaScript function), the binary, the repo, the database file and URLs. Before editing, grep `ui/src`, `ui/index.html`, `ui/public` and `e2e/tests` for other user-visible "pagelet" strings (page titles set in code, alt text) and for tests that assert the old spelling; fix what turns up under the same rule.

### Testing

- **`test/pagelet/db_test.lg`**: the migration count goes from 7 to 8 (and the rollback count with it); `sites-are-private-until-made-public` rolls back `2` to get before 006 and must now roll back `3`. A new test covers the backfill (rows inserted before 008 come out numbered in domain order), new sites going last, and `reorder-sites!` (a full list, a partial list, an unknown id, a duplicate id).
- **`test/pagelet/routes_test.lg`**: `sites-crud` asserts "Listed by domain" today; it becomes creation order (`example.com`, `bare.com`, `blank.com`, `another.org`). A new `sites-order` test: 401 without a session, 415 without JSON, 400 for a missing or non-list `ids` and for a list holding a non-string, 200 with the new order and `GET /api/sites` agreeing afterwards, and `PUT /api/sites/:id` still working for a real id.
- **`e2e/tests/order.spec.js`** (new): two sites created through the API on unique domains; on the overview, drag the second one's handle onto the first card with the mouse; the second now precedes the first in the DOM and in `GET /api/sites`; it still does after a reload; clicking a card still opens its site. Specs share one database and run side by side, so only the relative order of the spec's own two sites is asserted. Both sites are deleted at the end. A second test makes the save fail (`page.route` answering `PUT **/api/sites/order` with 500), drags the same way, and expects the "Could not save the order." alert and the two cards back in their first order.
- **The name**: the e2e spec above (or `dashboard.spec.js`, whichever reads better) asserts the header shows `Pagelet`.

---

## File Structure

| File | Change |
|---|---|
| `src/pagelet/migrations.lg` | append migration `008-add-sites-position` |
| `src/pagelet/db.lg` | `sites` orders by position; `create-site!` appends; new `reorder-sites!` |
| `src/pagelet/routes.lg` | new `PUT /api/sites/order` |
| `test/pagelet/db_test.lg` | migration counts; position and reorder tests |
| `test/pagelet/routes_test.lg` | list order in `sites-crud`; new `sites-order` |
| `ui/package.json`, `ui/package-lock.json` | add the three dnd-kit packages |
| `ui/src/api.ts` | `mutate` on `Loaded`; `api.reorderSites` |
| `ui/src/components/Icons.tsx` | `GripIcon` |
| `ui/src/pages/Sites.tsx` | sortable grid, the handle, save on drop, paused refresh |
| `ui/src/components/Wordmark.tsx`, `TopBar.tsx`, `ui/src/pages/AddSite.tsx`, `ui/index.html`, `ui/public/manifest.webmanifest` | the capitalized name |
| `e2e/tests/order.spec.js` | new browser test |
| `README.md`, `docs/KNOWLEDGE.md` | the order in "what the dashboard does"; anything verified about DuckDB or dnd-kit along the way |

---

### Task 0: Branch and the plan

- [ ] **Step 1: Branch**
  `git switch -c site-order` (from an up-to-date `master`).

- [ ] **Step 2: Commit the plan** if it is not committed yet
  `git add docs/plans/2026-10-02-2155-manual-site-order.md && git commit -m "Plan: manual site order"`

### Task 1: The `position` column and the queries

**Files:**
- Modify: `src/pagelet/migrations.lg`, `src/pagelet/db.lg`
- Test: `test/pagelet/db_test.lg`

- [ ] **Step 1: Write the failing tests**
  In `db_test.lg`: bump the migration count and the full rollback from 7 to 8, and the rollback in `sites-are-private-until-made-public` from 2 to 3. Add `sites-keep-a-manual-order`: migrate, roll back 1 (to before 008), insert two sites by hand with domains `b.com` then `a.com`, migrate, and expect `db/sites` to list `a.com`, `b.com` (the backfill follows the domain). Then `create-site!` a third on a domain that sorts first (`0.com`) and expect it last. Then `reorder-sites!`: a full list in a new order; a partial list (one id) puts that site first and keeps the others' order; an unknown id and a repeated id are ignored; each call returns the list `db/sites` then gives.

- [ ] **Step 2: Run them to see them fail**
  Run: `mise exec -- lgx test`
  Expected: the new and changed db tests FAIL (no `position`, no `reorder-sites!`).

- [ ] **Step 3: Add migration 008**
  Append to `migrations.lg` with a comment in the file's voice (the owner's order on the overview and in the switcher; existing rows numbered by domain so nothing moves; no constraint, as in 006). Up is the two statements from the design, down drops the column.

- [ ] **Step 4: Change the queries in `db.lg`**
  `sites` → `order by position, domain`, docstring updated. `create-site!` computes the next position inside its insert, still `returning` the site columns. Add `reorder-sites!` as specified, using `duckdb/with-transaction` the way `delete-site!` does. If DuckDB refuses either the `update ... from` backfill or the `insert ... select` with an aggregate, find the form it accepts and record it in `docs/KNOWLEDGE.md` (Task 6).

- [ ] **Step 5: Run the tests**
  Run: `mise exec -- lgx test`
  Expected: the db tests PASS. `sites-crud` in `routes_test.lg` now FAILS on "Listed by domain"; Task 2 fixes it.

- [ ] **Step 6: Commit**
  `git commit -m "Sites: a position column and a manual order (migration 008)"`

### Task 2: `PUT /api/sites/order`

**Files:**
- Modify: `src/pagelet/routes.lg`
- Test: `test/pagelet/routes_test.lg`

- [ ] **Step 1: Write the tests**
  Change the `sites-crud` list assertion to creation order and its comment to "Listed in the owner's order: as created until moved." Add `sites-order` per the design's testing section.

- [ ] **Step 2: Run them to see `sites-order` fail**
  Run: `mise exec -- lgx test`
  Expected: `sites-order` FAILS (the path falls to `PUT /api/sites/:id` and answers 404 or 400).

- [ ] **Step 3: Add the route**
  In the route table beside the other site routes, with a comment giving the body and the lenient rule. `protected`, `json-only`; validate that `(:ids body)` is sequential and every element a string; answer with `db/reorder-sites!`. No SQL in this file.

- [ ] **Step 4: Run the tests**
  Run: `mise exec -- lgx test`
  Expected: all PASS.

- [ ] **Step 5: Commit**
  `git commit -m "Routes: PUT /api/sites/order"`

### Task 3: The capitalized name

**Files:**
- Modify: `ui/src/components/Wordmark.tsx`, `ui/src/components/TopBar.tsx`, `ui/src/pages/AddSite.tsx`, `ui/index.html`, `ui/public/manifest.webmanifest`

- [ ] **Step 1: Grep, then edit**
  `grep -rn -i "pagelet" ui/src ui/index.html ui/public e2e/tests` and apply the rule from the design: the product name as shown to a person becomes "Pagelet"; the `pagelet(...)` function, file names and URLs stay.

- [ ] **Step 2: Check the build and the unit tests**
  Run: `mise exec -- lgx ui-build && mise exec -- lgx ui-test`
  Expected: both succeed.

- [ ] **Step 3: Commit**
  `git commit -m "Dashboard: the name is Pagelet"`

### Task 4: Drag and drop on the overview

**Files:**
- Modify: `ui/package.json`, `ui/package-lock.json`, `ui/src/api.ts`, `ui/src/components/Icons.tsx`, `ui/src/pages/Sites.tsx`

- [ ] **Step 1: Add dnd-kit**
  `cd ui && npm install @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2`
  Expected: no peer dependency error with React 19 (their peers are `react >=16.8`).

- [ ] **Step 2: `mutate` and `reorderSites` in `api.ts`**
  As in the design. Keep the doc comment on `useApi` current.

- [ ] **Step 3: `GripIcon` in `Icons.tsx`**
  Lucide's `grip-vertical` (six small circles), in the file's existing style.

- [ ] **Step 4: The sortable grid in `Sites.tsx`**
  Restructure `SiteCard` into the wrapper, the link and the handle as designed; wrap the cards in `DndContext` and `SortableContext`; add the drop handler, the `dragging` and `saving` flags with everything "The list holds still while busy" lists, and the error line. Update the file's comments (the `Sites` doc comment mentions how the page keeps itself current; say that it holds still during a drag). Check by hand with `lgx run` and `lgx ui-dev` side by side: drag with the mouse; with the keyboard (Tab to a handle, Space, arrows, Space); at a phone width with touch emulation; a click on a card still opens the site; one site shows no handle; both themes.

- [ ] **Step 5: Lint, build, unit tests**
  Run: `cd ui && npm run lint && cd .. && mise exec -- lgx ui-build && mise exec -- lgx ui-test`
  Expected: all succeed.

- [ ] **Step 6: Commit**
  `git commit -m "Dashboard: drag the websites into order"`

### Task 5: Browser test

**Files:**
- Create: `e2e/tests/order.spec.js`

- [ ] **Step 1: Write the spec**
  Follow `dashboard.spec.js` and `helpers.js` (`apiLogin`, `createSite`, `deleteSite`, `signIn`, `uniqueDomain`). Find each card by `[data-testid="site-card"]` filtered by its domain text. Drag with `page.mouse`: move to the second card's handle, press, move to the first card's centre in several steps (dnd-kit needs intermediate moves), release; wait for the `PUT /api/sites/order` response. Assert the relative order of the two domains in the DOM and in `GET /api/sites`, again after `page.reload()`, then that clicking the first card lands on `/sites/<id>`. Assert the header shows `Pagelet`. Add the failed-save test from the design's testing section. Delete both sites in a `finally` or `afterAll`.

- [ ] **Step 2: Run the browser tests**
  Run: `mise exec -- lgx e2e`
  Expected: every spec PASSES, the new one included. If an older spec asserted the lowercase name or a list order, fix the assertion.

- [ ] **Step 3: Commit**
  `git commit -m "e2e: reordering the websites"`

### Task 6: Docs and the PR

**Files:**
- Modify: `README.md`, `docs/KNOWLEDGE.md`, this plan

- [ ] **Step 1: README and KNOWLEDGE**
  In the README's description of the dashboard, one sentence: the websites are in the owner's order, changed by dragging a card's handle; a new site goes last. In `docs/KNOWLEDGE.md`, the stack table gains dnd-kit, and a dated note records what was verified along the way (the DuckDB statements that worked, ruuter's literal-before-param matching, anything dnd-kit needed for touch or for the Playwright drag).

- [ ] **Step 2: The whole check**
  Run: `mise exec -- lgx check`
  Expected: server tests, UI unit tests and browser tests all PASS.

- [ ] **Step 3: Mark the plan executed, commit, open the PR**
  Add `**Status: completed <date>.**` and a short summary at the end of this plan, as the earlier plans have. `git commit -m "docs: manual site order"`, push, and open a PR titled `Manual site order; the name is Pagelet`.
