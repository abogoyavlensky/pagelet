# Clickable Pages Implementation Plan

**Status: completed 2026-10-06.** See the summary at the end.

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page name in the Pages card and the "Right now" card is a link to that page on the tracked site, opened in a new tab.

**Tech Stack:** The dashboard in `ui/` (React 19, TypeScript, Tailwind 4); `node --test` for the format helpers; Playwright in `e2e/` for the browser test; docs in `docs/`.

**Repo:** `~/Projects/pagelet`. Work on a branch `clickable-pages` off `master` and open a PR, as the earlier work did. Run every command through mise (`mise exec -- lgx ...`).

---

## Design

### The problem

The Pages card (`ui/src/components/Breakdown.tsx`, `Pages`) and the "Right now" card (`ui/src/components/LiveCard.tsx`) list paths like `/pricing` as plain text with a `title` tooltip. Nothing happens on click. An owner who wants to look at a page has to type its URL.

Discussed and set aside: copy-on-click (an invisible, unconventional action on a list row, ambiguous about whether it copies the path or the URL, and the clipboard API fails silently without a secure context); a hover copy icon beside the link (noise for a case the browser's context menu already covers once the name is an anchor); linking Sources (referrer hosts, many of them aggregates where a link adds little). Sources, Countries, Devices, Browsers, Systems and Events stay plain text.

### The link

Each page name becomes an anchor to `https://<domain><path>` with `target="_blank"` and `rel="noopener"`, where `domain` is the site's stored hostname and `path` is the row's name exactly as the server sends it. Only the name is the anchor: the bar behind the row and the number cells stay as they are, since making the whole row clickable would fight the bar and the dense layout.

The URL is built by one helper in `ui/src/format.ts`, so the scheme and the join live in one place and the Node tests pin them:

```ts
/** Where a page lives on its site: "https://example.com/pricing". */
export function pageUrl(domain: string, path: string): string
```

It returns `'https://' + domain + path`. Nothing else: paths always start with `/` (`visitor/path-of` returns `/` for an empty one, `src/pagelet/visitor.lg:41`), and in hash mode the fragment is already part of the stored path (`/#/about`, `src/pagelet/ingest.lg:81`), so appending it to the host gives the right URL without special cases.

**https is assumed.** A site stores only a hostname; the validator rejects a scheme, path or port (`src/pagelet/routes.lg:108`). Nearly every tracked site is served over https, and a site on plain http gets a wrong link. That is documented, not configured: a scheme field on the site form is more than the case deserves. **www is not added.** Ingest counts `www.example.com` under `example.com` (`src/pagelet/ingest.lg:66`), so a `www`-only site links to its apex, which such sites redirect in the common case.

### Where the domain comes from

The server keeps sending bare paths; `ui/src/api.ts` and `src/pagelet/stats.lg` do not change. The Site page already resolves the site object (`ui/src/pages/Site.tsx:74`) and passes `siteId` into `Body`; it passes `domain` the same way, and `Body` hands it to `Pages` and `LiveCard`.

`site` can be undefined for a moment: `Body` renders as soon as the report is in, and the site list may still be loading. So `domain` is optional all the way down (`domain?: string`), and a row without one renders the plain span it renders today. No placeholder link, no `#`.

### The components

`List` in `Breakdown.tsx` takes an optional `href` per item. Its row renders the name as `<a>` when `href` is set and as the existing `<span>` otherwise, with the same truncation, padding and `title`. `Pages` sets `href` to `pageUrl(domain, r.name)` when it has a domain; `Breakdown` and `Events` set nothing, so the other cards are untouched by construction.

`LiveCard` does the same inline for its own list: it has three lines of row markup and no shared list, so no abstraction is added for it.

Styling: the anchor keeps the row's text colour and gains `hover:underline underline-offset-4` (the underline offset the dashboard's other text links use, `ui/src/pages/Site.tsx:98`). Because the bar is an absolutely positioned sibling, the anchor keeps `relative` like the span does, so it stays above the bar and clickable along its whole width. Focus is the browser's default outline, as on the dashboard's other links.

### Second-order effect

Clicking through from the dashboard creates a real visit on the owner's own site. The exclude-own-visits flag (`docs/tracking.md`, "Excluding your own visits") handles that when it is set, so the docs mention the links next to the flag rather than the dashboard trying to prevent the visit.

### Testing

- `ui/test/format.test.ts`: `pageUrl` with a plain path, the root path and a hash-mode path.
- `e2e/tests/dashboard.spec.js`: the existing dashboard spec already lists `/pricing` in the Pages card and `/docs` in the Right now card. Assertions join it for both: the `/pricing` row's link and the Right now card's `/docs` link each have the expected `https://<domain><path>` `href`, `target` `_blank` and `rel` `noopener`. The spec's `domain` is the routed e2e hostname, so the expected URL is built from it.
- No component unit tests exist in `ui/`; the e2e spec is the component test, as for every other card.

## File Structure

- Modify `ui/src/format.ts`: add `pageUrl`.
- Modify `ui/test/format.test.ts`: pin `pageUrl`.
- Modify `ui/src/components/Breakdown.tsx`: optional `href` on `Item`; `List` renders an anchor for it; `Pages` takes `domain?` and sets `href`.
- Modify `ui/src/components/LiveCard.tsx`: `domain?` prop; the page row is an anchor when it is set.
- Modify `ui/src/pages/Site.tsx`: `Body` takes `domain?` from `site?.domain` and passes it to `Pages` and `LiveCard`.
- Modify `e2e/tests/dashboard.spec.js`: assert the two hrefs.
- Modify `docs/dashboard.md`: the top pages and the Right now pages link to the page on the site, over https.
- Modify `docs/tracking.md`: under "Excluding your own visits", a sentence that opening a page from the dashboard is a visit like any other.
- Modify `docs/KNOWLEDGE.md`: a short dated entry with the https assumption and the optional-domain rule.

## Tasks

### Task 1: The URL helper

**Files:**
- Modify: `ui/src/format.ts`
- Test: `ui/test/format.test.ts`

- [x] **Step 1: Write the failing test**
  Add `pageUrl` to the import and a `test('pageUrl', ...)` block asserting:
  `pageUrl('example.com', '/pricing')` is `'https://example.com/pricing'`;
  `pageUrl('example.com', '/')` is `'https://example.com/'`;
  `pageUrl('example.com', '/#/about')` is `'https://example.com/#/about'`.

- [x] **Step 2: Run it to make sure it fails**
  Run: `mise exec -- lgx ui-test`
  Expected: FAIL, `pageUrl` is not exported.

- [x] **Step 3: Implement the helper**
  In `ui/src/format.ts`, next to the other label helpers, add `pageUrl` with the docstring and signature from the design. No runtime imports: the file is loaded straight into Node by the test.

- [x] **Step 4: Run the tests**
  Run: `mise exec -- lgx ui-test`
  Expected: PASS.

- [x] **Step 5: Commit**
  `git commit -m "Dashboard: pageUrl builds a page's https URL from the site's domain"`

### Task 2: Links in the Pages card and the Right now card

**Files:**
- Modify: `ui/src/components/Breakdown.tsx`
- Modify: `ui/src/components/LiveCard.tsx`
- Modify: `ui/src/pages/Site.tsx`

- [x] **Step 1: Breakdown**
  Add `href?: string` to `Item`. In `List`'s row, render the name as `<a href={i.href} target="_blank" rel="noopener" title={i.name} className="relative min-w-0 flex-1 truncate px-2.5 text-ink hover:underline underline-offset-4">` when `i.href` is set, else the existing span. Keep the classes identical apart from the hover underline so the row does not shift. Give `Pages` a `domain?: string` prop and set `href: domain ? pageUrl(domain, r.name) : undefined` on each item, importing `pageUrl` from `../format`. `Breakdown` and `Events` do not set `href`.

- [x] **Step 2: LiveCard**
  Add `domain?: string` to the props. In the page row, render the name as the same kind of anchor when `domain` is set (`href={pageUrl(domain, p.name)}`), else the existing span, keeping `truncate text-ink` and the `title`.

- [x] **Step 3: Site page**
  Add `domain?: string` to `Body`'s props, pass `domain={site?.domain}` where `Body` is rendered, and inside `Body` pass `domain={domain}` to `<Pages>` and `<LiveCard>`.

- [x] **Step 4: Type-check and lint**
  Run: `cd ui && mise exec -- npx tsc -b && mise exec -- npm run lint`
  Expected: no errors from TypeScript or oxlint.

- [x] **Step 5: Look at it**
  Run `mise exec -- lgx run` and `mise exec -- lgx ui-dev`, open a site with visits, and check: the page name underlines on hover, opens `https://<domain><path>` in a new tab on click, the bar and numbers look as before, and the Sources card has no links. Check the Right now card the same way.

> Deviation: Step 5 was done headlessly with Playwright against `lgx run` (no browser preview in this environment); the hrefs, target and rel were read from the DOM and the hover state screenshotted.

- [x] **Step 6: Commit**
  `git commit -m "Dashboard: page names link to the page on the site"`

### Task 3: Browser test

**Files:**
- Modify: `e2e/tests/dashboard.spec.js`

- [x] **Step 1: Assert the links**
  In the dashboard spec, after the existing `/pricing` time assertion, add:
  `await expect(pages.locator('li', { hasText: '/pricing' }).getByRole('link')).toHaveAttribute('href', \`https://${domain}/pricing\`)`, and on the same locator `toHaveAttribute('target', '_blank')` and `toHaveAttribute('rel', 'noopener')`.
  After the existing Right now `/docs` assertion, add the same three checks on `page.getByTestId('online-now').getByRole('link', { name: '/docs' })`, with `href` `https://${domain}/docs`.

- [x] **Step 2: Run the browser tests**
  Run: `mise exec -- lgx e2e`
  Expected: all specs PASS, including the new assertions.

- [x] **Step 3: Commit**
  `git commit -m "e2e: the Pages and Right now cards link to the page"`

### Task 4: Docs

**Files:**
- Modify: `docs/dashboard.md`
- Modify: `docs/tracking.md`
- Modify: `docs/KNOWLEDGE.md`

- [x] **Step 1: dashboard.md**
  In the card list, say that each page in the top pages and in the Right now card links to that page on the site, opened in a new tab, and that the link assumes https and the site's domain as entered (so a site served over plain http, or only on `www`, may need the address corrected by hand).

- [x] **Step 2: tracking.md**
  Under "Excluding your own visits", add a sentence that opening a page from the dashboard's Pages or Right now card is a visit like any other, so set the flag in the browser you open them from.

- [x] **Step 3: KNOWLEDGE.md**
  Add a dated entry "Clickable pages (2026-10-05)": `pageUrl` in `format.ts` assumes https and appends the stored path verbatim (hash-mode fragments included); `domain` is optional down the tree because `Body` can render before the site list resolves, and a row without it stays plain text.

- [x] **Step 4: Commit**
  `git commit -m "Docs: page links in the dashboard, and that they count as visits"`

### Task 5: Check and PR

- [x] **Step 1: Full check**
  Run: `mise exec -- lgx check`
  Expected: unit tests, ui tests and e2e all PASS.

- [x] **Step 2: Open the PR**
  Push `clickable-pages` and open a PR against `master` titled "Pages link to the page on the site", with a short body: what links, what is assumed (https, no www), what stays plain text, and the own-visits note.

---

## Summary

Shipped on the `clickable-pages` branch in four commits after the plan: the `pageUrl` helper with Node tests; anchors in `Breakdown.tsx` (optional `href` per item, set only by `Pages`) and `LiveCard.tsx`, with `domain` passed from `Site.tsx`; e2e assertions on `href`, `target` and `rel` in both cards; docs in `dashboard.md`, `tracking.md` and `KNOWLEDGE.md`. `lgx check` passes: 51 server tests, 7 UI tests, 12 browser specs. Codex reviewed every commit and found nothing to fix.

Deviations:
- Task 2 step 5 ("look at it") was done headlessly with Playwright against `lgx run`, since this environment has no browser preview. The hrefs, target and rel were read from the DOM, Sources was confirmed to have no links, and the hover state was screenshotted.

What the plan could have specified better: nothing; it held up as written.
