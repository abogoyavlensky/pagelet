# Exclude Your Own Visits Implementation Plan

**Status: completed 2026-10-03.** See the summary at the end.

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A site owner can stop one browser from being counted on one tracked site by setting a localStorage flag on that site, the way Umami and Plausible do it.

**Tech Stack:** The tracker `resources/public/p.js` (plain ES5, no build step); Playwright 1.56 in `e2e/` for the browser test; docs in `docs/tracking.md`.

**Repo:** `~/Projects/pagelet`. Work on a branch `exclude-self` off `master` and open a PR, as the earlier work did. Run every command through mise (`mise exec -- lgx ...`).

---

## Design

### The problem

The owner's own visits to a production site are counted with everyone else's. The tracker has one "do not track" switch already: `off` at `resources/public/p.js:10`, computed once at load, true for `file:` pages and for `localhost` without `data-dev`. Both `send` and `flush` return early on it, so it silences page views, custom events and engagement beacons together. There is no way to turn it on for a real site.

Discussed and set aside: a query parameter that sets the flag and a per-site link in the dashboard (nicer, and the only way on a phone, but more tracker bytes and UI; may follow later), and server-side IP exclusion (breaks when the home or mobile IP changes, and adds an IP-shaped setting to a project whose only use of the IP is the daily hash).

### The flag

The tracker reads `localStorage.pagelet_ignore` once at load, beside the other `off` conditions. When its value is the string `"true"`, `off` is true and nothing is sent from that page load. The key follows Plausible (`plausible_ignore`); the value is the string `"true"`, so `setItem("pagelet_ignore", "true")` turns it on and either `removeItem("pagelet_ignore")` or any other value turns it off.

The read sits in a function that never throws, since `localStorage` can throw on access (Safari's private mode on older versions, a page with storage blocked) and the tracker promises never to throw into the page:

```js
function ignored() {
  try { return localStorage.getItem("pagelet_ignore") == "true"; } catch (_) { return false; }
}
var off = l.protocol == "file:" || !has("dev") && /^(localhost|127\.0\.0\.1)$/.test(l.hostname) || ignored();
```

**Read once at load, not per send.** `off` is one expression computed once, and a page load is either counted or not: a page view that was sent gets its engagement beacon too. The flag takes effect from the next page load, which the docs say. The alternative (checking on every send, as Umami does) would let a flag set mid-visit cut a page view off from its time on page and buys nothing the owner needs.

The flag applies with `data-dev` as well: a developer on `localhost` who set it is not counted either.

**Where it lives.** localStorage is per origin, so the flag must be set on the tracked site itself, in each browser the owner uses, and once per site. It is not set on the Pagelet host. `example.com` and `www.example.com` are different origins; the owner sets it on whichever one they open (a site normally redirects to one of them). Clearing the site's data in the browser removes it, and so does the browser's own storage eviction. All of this goes in the docs.

### Size

`p.js` is 3695 bytes and the README and `docs/tracking.md` say "under 4 KB". The change adds about 110 bytes. Task 1 checks the size after the edit and `docs/KNOWLEDGE.md:384` (the line recording the tracker's size) is updated.

### Caching

`/p.js` is served with `max-age=86400` (`src/pagelet/routes.lg:53`), so a browser may run the old tracker for up to a day after an upgrade. That is the existing behaviour for every tracker change and needs nothing here.

### Testing

No unit tests exist for `p.js`; the browser specs in `e2e/tests/tracker.spec.js` are its tests. One new spec in that file, in the file's style (a unique site on a routed domain, the SPA fixture, `apiLogin`/`createSite`/`deleteSite`/`stats`, the 300 ms e2e flush):

1. Load `http://<domain>/`: one page view is counted (proves the pipeline before anything is ignored).
2. `page.evaluate` sets `localStorage.pagelet_ignore = "true"`, then `page.reload()`. Click `#about` and `#signup`. Nothing should be sent.
3. `page.evaluate` removes the flag, `page.reload()` (now on `/about`), click `#pricing`.
4. `expect.poll` until `totals.pageviews` is 3, then assert `pages` is exactly `/`, `/about`, `/pricing` with one page view each, `events` is `[]`, and `totals.visitors` is 1.

Why this is a sound negative test: the ignored `signup` event, had it been sent, left the page before the reload in step 3, and the server flushes its buffer in arrival order, so by the time the `/about` view of step 3 is visible in stats the event would be too. An ignored page view would also push `/about` to two views. No sleep-and-assert-zero is needed.

Steps 2 and 3 set the flag with `page.evaluate` after a load, not `addInitScript`: an init script runs on every navigation and could not be removed for step 3.

A second, smaller spec covers blocked storage: `page.addInitScript` redefines `window.localStorage` with a getter that throws (`Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } })`), the page loads and clicks `#about`, no `pageerror` fires, and `totals.pageviews` reaches 2. That pins the `try`/`catch` in `ignored`: without it the tracker would die at load and send nothing.

### Docs

`docs/tracking.md` gets a section `## Excluding your own visits` between the custom events paragraph and `## What is collected`: open the site in the browser to exclude, run the one-line `setItem` in the developer console, reload; from then on that browser sends nothing for that site (no page views, events, or time on page); repeat for every site and every browser; the `removeItem` line to count yourself again; the flag is per origin (`www.` noted) and is lost when the site's data is cleared. The README's link line for the tracking doc mentions it. `/writing-clearly` applies.

## File Structure

- Modify: `resources/public/p.js` (the `ignored` function and the `off` expression)
- Modify: `e2e/tests/tracker.spec.js` (one new spec)
- Modify: `docs/tracking.md` (the new section)
- Modify: `README.md` (the tracking doc's link line)
- Modify: `docs/KNOWLEDGE.md` (the tracker's size line)

No server code changes: the server never sees an ignored browser's requests.

## Tasks

### Task 1: The flag in the tracker

**Files:**
- Modify: `resources/public/p.js`

- [x] **Step 1: Add the read**
  Add the `ignored` function from the design above the `off` line and `|| ignored()` to the `off` expression. Update the comment above `off` so it names all three cases (file: pages, localhost without `data-dev`, the owner's flag). Keep the file's style: ES5, short names, one-line comments.

- [x] **Step 2: Check the size**
  Run: `wc -c resources/public/p.js`
  Expected: below 4096. If not, shorten the comment, not the code.

- [x] **Step 3: Commit**
  `git commit -m "tracker: pagelet_ignore in localStorage excludes a browser"`

### Task 2: The browser test

**Files:**
- Modify: `e2e/tests/tracker.spec.js`

- [x] **Step 1: Write the specs**
  Add `test('a browser with pagelet_ignore set is not counted', ...)` following the design's four steps. Reuse the file's `spa` fixture and its `page.route` of `http://${domain}/**`; delete the site at the end. A comment at the top says why the order of loads makes the negative assertion sound (the design's "Why this is a sound negative test"). Then add `test('blocked storage does not stop the tracker', ...)` as in the design's Testing section, modelled on the existing "a failing tracker never breaks navigation" spec (`addInitScript`, a `pageerror` listener, `errors` asserted empty).

- [x] **Step 2: Run the browser tests**
  Run: `mise exec -- lgx e2e`
  Expected: every spec PASSES, the new one included.

- [x] **Step 3: See it fail without the tracker change**
  Task 1 is already committed, so put master's tracker back in the working tree with `git checkout master -- resources/public/p.js`, run `mise exec -- lgx e2e` (it rebuilds the binary, which embeds `p.js`), and confirm the new spec fails (`events` holds the signup or `/about` has two views). Then `git checkout HEAD -- resources/public/p.js` and confirm `git status` is clean.
  Expected: the new spec FAILS with master's tracker and PASSES with the branch's.

- [x] **Step 4: Commit**
  `git commit -m "e2e: a browser with pagelet_ignore set is not counted"`

### Task 3: Docs and the PR

**Files:**
- Modify: `docs/tracking.md`, `README.md`, `docs/KNOWLEDGE.md`, this plan

- [x] **Step 1: tracking.md**
  Add `## Excluding your own visits` as in the design's Docs section, with two fenced `js` blocks:
  ```js
  localStorage.setItem("pagelet_ignore", "true");
  ```
  ```js
  localStorage.removeItem("pagelet_ignore");
  ```

- [x] **Step 2: README and KNOWLEDGE**
  In the README's Documentation list, the tracking line becomes "script options, custom events, excluding your own visits, and collected data". In `docs/KNOWLEDGE.md`, update the tracker size line with the new byte count.

> Deviation: the old size line in `docs/KNOWLEDGE.md` belongs to the dated Engagement section, so it stays as history; a new dated section records the new size instead.

- [x] **Step 3: The whole check**
  Run: `mise exec -- lgx check`
  Expected: server tests, UI unit tests and browser tests all PASS.

- [x] **Step 4: Mark the plan executed, commit, open the PR**
  Add `**Status: completed <date>.**` and a short summary at the end of this plan, as the earlier plans have. `git commit -m "docs: excluding your own visits"`, push, and open a PR titled `Exclude your own visits with a localStorage flag`.

## Summary

Shipped as planned. The tracker reads `localStorage.pagelet_ignore` once at load, inside a function that never throws. When it is `"true"`, `off` is set, and nothing goes out from that load: no page views, no custom events, and no time on page. The tracker grew from 3695 to 3925 bytes, still under 4 KB. Two new browser specs cover the flag and blocked storage. The flag spec fails against master's tracker, which sent 5 page views where 3 were expected, and passes with the change. `docs/tracking.md` has a new "Excluding your own visits" section, and the README's Tracking link mentions it. `lgx check` passes: 51 server tests, the UI tests, and 12 browser tests.

Codex reviews: the plan review caught a broken stash step and asked for a blocked-storage test; both were folded in before execution. Tasks 1-3 were clean.

Deviations, in one place:
- The old size line in `docs/KNOWLEDGE.md` sits in the dated Engagement section, so it stays as history. A new dated section records the new size (Task 3).

What the plan could have specified better: nothing.
