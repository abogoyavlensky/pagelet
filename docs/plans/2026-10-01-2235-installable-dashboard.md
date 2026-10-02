# Installable Dashboard Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard installable as an app (a web app manifest, PNG icons, an Apple touch icon and theme colours) so it opens from a phone's home screen in its own window, with no service worker and no offline mode.

**Tech Stack:** let-go 1.13 (`src/pagelet/routes.lg`), Vite 8 (`ui/public`, `ui/index.html`), Playwright 1.56 (icon rendering and the browser test). Skill: `/writing-clearly` for the docs.

---

## Design

### Why, and what is left out

An installed dashboard gets a home-screen icon and a window without browser
bars. Offline support is worth nothing for live analytics (a cached page of
yesterday's numbers is worse than an error), and Chrome no longer requires a
service worker to offer "Install". So this adds only what makes the app
installable. No service worker, no `vite-plugin-pwa`, no caching changes.

### What the browser needs, and where it comes from

| Piece | File | Served at |
|---|---|---|
| Manifest | `ui/public/manifest.webmanifest` | `/app/manifest.webmanifest` |
| Icon 192 px | `ui/public/icon-192.png` | `/app/icon-192.png` |
| Icon 512 px | `ui/public/icon-512.png` | `/app/icon-512.png` |
| Apple touch icon, 180 px | `ui/public/apple-touch-icon.png` | `/app/apple-touch-icon.png` |
| Links and theme colour | `ui/index.html` | the SPA routes' `index.html` |

Vite copies `ui/public` into `resources/public/app/` and, because the build
`base` is `/app/`, rewrites root-relative `href`s in `index.html` from `/x`
to `/app/x` (it already does this for `/favicon.svg`). The server serves
every file there from the one `/app/:file` route through `static-response`.

### The server change

`static-response` (`src/pagelet/routes.lg:40`) serves only the extensions
in `content-types` and answers 404 otherwise. Add two entries:

```clojure
"png"         "image/png"
"webmanifest" "application/manifest+json"
```

Nothing else on the server changes. These files get the same
`public, max-age=86400` as every other `/app/` file, which is fine for icons
and a manifest that change once in a long while.

`io/slurp` reads resources as strings. Fonts came back from the binary byte
for byte (`docs/KNOWLEDGE.md`, "Fonts through the binary"), so PNGs should
too. The browser test checks this against the built binary. If the bytes
differ, stop and report: the fix (a binary-safe read in `static-response`)
is a separate decision.

### The manifest

```json
{
  "name": "pagelet",
  "short_name": "pagelet",
  "description": "Self-hosted web analytics",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f2f3f7",
  "theme_color": "#f2f3f7",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- Icon `src`s are **relative**. The browser resolves them against the
  manifest's URL, so they are right in the build (`/app/icon-192.png`) and
  under `lgx ui-dev` (`/icon-192.png`) alike. Vite never rewrites the
  manifest's contents, so absolute `/app/...` paths would break in dev.
- `start_url` and `scope` are `/`, not `/app/`. The SPA's pages are `/`,
  `/login`, `/sites` and `/sites/:id`, and a scope may be wider than the
  manifest's directory. `/` is the websites overview (`ui/src/App.tsx`), and
  it sends a signed-out user to `/login`.
- `any` and `maskable` are separate entries. Chrome warns about
  `"any maskable"` on one entry. The same 512 px file serves both because
  the icon is full-bleed with its mark inside the maskable safe zone (below).
- The colours are the light theme's `--color-paper` (`ui/src/index.css`),
  the page canvas and the sticky top bar's background. The manifest cannot
  follow the system theme. Light is the default look, and the splash screen
  it colours is shown only briefly.

### `index.html`

Add to `<head>`, beside the existing favicon link:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="theme-color" content="#f2f3f7" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)" />
```

These are `--color-paper` in the light and dark themes. The sticky top bar
(`ui/src/components/TopBar.tsx`) is `bg-paper`, so the installed window's
title bar runs straight into it in both themes. iOS 16.4+ reads `display` and
`name` from the manifest, so no `apple-mobile-web-app-*` meta tags are
needed.

### The icon

The app icon is the favicon, `ui/public/favicon.svg`: a blue `#3b6fe0`
rising line on a soft blue `#e9f0ff` tile with `rx="9"` corners. The same
mark is drawn inline in `ui/src/components/Wordmark.tsx`.

The app icons are drawn **full-bleed**: the same SVG without the `rx`, so
the tile fills the square. Android, iOS and desktop launchers apply their
own mask. A pre-rounded tile would show light corners inside their rounded
square on iOS, and a smaller, doubly rounded tile on Android.

The favicon is the single source. `scripts/gen-icons.mjs` reads
`ui/public/favicon.svg`, removes the `rx` attribute from its `<rect>`, and
renders the result. So the next icon change means editing the favicon and
re-running the script, with no second copy of the mark to keep in step. If
the favicon has no `<rect ... rx="...">`, the script renders it unchanged.

The maskable safe zone is a circle of radius 40% (12.8 of 32 units) around
the centre. The path `M8 21 L13 15 L18 18 L24 10` reaches farthest at
(24, 10): 10 units out, 11.5 with half the stroke. The mark survives a
circular mask as it is.

The repo has no SVG rasteriser (no `rsvg-convert`, ImageMagick or
Inkscape), but `e2e/` has Playwright and its headless Chromium. The script
renders the full-bleed SVG at 192, 512 and 180 px and writes the three
PNGs into `ui/public/`. The PNGs are committed, and the script is how to
regenerate them. It is a one-off tool, like `scripts/gen-timezones.sh`,
not a build step, so `lgx build` does not need a browser.

The script loads Playwright from `e2e/node_modules` with
`createRequire(new URL('../e2e/package.json', import.meta.url))` and then
`require('playwright')` (a dependency of `@playwright/test`). ES module
imports resolve from the script's own directory, which has no
`node_modules`. For each size it sets a square viewport, `setContent`s a
page with zero margin and the SVG at `width`/`height` 100%, and
`screenshot`s it to `ui/public/<name>.png`. The tile fills every pixel, so
nothing is transparent and the Apple touch icon gets no black background.

### iOS note

An app added to the iOS home screen keeps its own cookies, apart from
Safari's. Since iOS 17.2, Safari's cookies are copied in when the app is
added, so a signed-in user stays signed in. On older iOS, or when the
session has expired, users sign in once inside the app. This is worth a
line in the README; no code is needed.

### Testing

- **Unit (`test/pagelet/routes_test.lg`, `static-files`):** when the
  dashboard is built (`/app/manifest.webmanifest` answers 200), the
  manifest is `application/manifest+json` and `/app/icon-192.png` is
  `image/png`. This follows the test's existing `#{200 503}` pattern:
  `resources/public/app/` is build output and is gitignored, so `lgx test`
  must pass without a build.
- **Browser (`e2e/tests/install.spec.js`), against the built binary:**
  - the page at `/` has a `link[rel=manifest]` whose `href` is
    `/app/manifest.webmanifest`, an `apple-touch-icon` link at
    `/app/apple-touch-icon.png`, and two `theme-color` metas;
  - the manifest is fetched with `Content-Type: application/manifest+json`
    and parses as JSON, with `display` `standalone` and `start_url` `/`;
  - every icon `src` in it, resolved against the manifest URL, plus the
    Apple touch icon, answers 200 as `image/png`, and its body equals the
    file in `ui/public/` byte for byte. This is the binary-safety check
    for `io/slurp`.

  Signing in is not needed: `/` serves `index.html` to anyone.
- **Manual (optional, after deploy):** Chrome DevTools → Application →
  Manifest shows no errors and an install button. Add to the home screen on
  a phone.

## File Structure

| File | Change |
|---|---|
| `scripts/gen-icons.mjs` | Create: renders `favicon.svg`, full-bleed, to the three PNGs with e2e's Playwright |
| `ui/public/icon-192.png`, `ui/public/icon-512.png`, `ui/public/apple-touch-icon.png` | Create: output of the script, committed |
| `ui/public/manifest.webmanifest` | Create: the manifest above |
| `ui/index.html` | Modify: manifest link, Apple touch icon link, two `theme-color` metas |
| `src/pagelet/routes.lg` | Modify: `png` and `webmanifest` in `content-types` |
| `test/pagelet/routes_test.lg` | Modify: content-type checks in `static-files`, when built |
| `e2e/tests/install.spec.js` | Create: links, manifest and icons through the built binary |
| `README.md` | Modify: the dashboard can be installed; the iOS sign-in note |
| `docs/KNOWLEDGE.md` | Modify: PNGs through the binary, and how the icons are made |

## Tasks

### Task 1: Serve PNGs and manifests

**Files:**
- Modify: `src/pagelet/routes.lg`
- Test: `test/pagelet/routes_test.lg`

- [ ] **Step 1: Write the test.** In `static-files`, add: when
  `(call handler :get "/app/manifest.webmanifest")` answers 200, its
  `Content-Type` is `application/manifest+json`, and
  `/app/icon-192.png` answers 200 with `image/png`. Skip both checks when
  the manifest answers 404 (dashboard not built). Read the file's existing
  style first and match it.
- [ ] **Step 2: Add the two entries** `"png" "image/png"` and
  `"webmanifest" "application/manifest+json"` to `content-types` in
  `src/pagelet/routes.lg`.
- [ ] **Step 3: Run the unit tests.**
  Run: `mise exec -- lgx test`
  Expected: PASS. The new checks are skipped until the files exist and are
  built (Task 3).
- [ ] **Step 4: Commit.**
  `git commit -m "Serve PNG icons and the web app manifest"`

### Task 2: Generate the icons

**Files:**
- Create: `scripts/gen-icons.mjs`
- Create: `ui/public/icon-192.png`, `ui/public/icon-512.png`, `ui/public/apple-touch-icon.png`

- [ ] **Step 1: Write `scripts/gen-icons.mjs`** as the Design's "The icon"
  section describes: `ui/public/favicon.svg` read and its `rect`'s `rx`
  removed, sizes
  `{ 'icon-192': 192, 'icon-512': 512, 'apple-touch-icon': 180 }`,
  Playwright loaded through `createRequire` from `e2e/package.json`, output
  paths resolved from `import.meta.url` so it runs from any directory.
  Start the file with a comment on usage and on why it lives outside the
  build, in the style of `scripts/gen-timezones.sh`.
- [ ] **Step 2: Run it.**
  Run: `mise exec -- node scripts/gen-icons.mjs`
  Expected: three PNGs in `ui/public/`. If Playwright's browser is missing,
  run `mise exec -- lgx e2e-setup` first.
- [ ] **Step 3: Check the output.** `file ui/public/*.png` reports 192×192,
  512×512 and 180×180 PNGs. Open `icon-512.png` with the Read tool and
  check that the blue line is centred on a soft blue square that fills the
  image, with no rounded corners and no transparent border.
- [ ] **Step 4: Commit.**
  `git commit -m "Dashboard: app icons from the favicon"`

### Task 3: The manifest and the head tags

**Files:**
- Create: `ui/public/manifest.webmanifest`
- Modify: `ui/index.html`

- [ ] **Step 1: Write `ui/public/manifest.webmanifest`** exactly as in the
  Design.
- [ ] **Step 2: Add the four tags** from the Design to `ui/index.html`'s
  `<head>`, after the favicon link.
- [ ] **Step 3: Build and check the rewrite.**
  Run: `mise exec -- lgx ui-build && grep -E 'manifest|apple-touch|theme-color' resources/public/app/index.html`
  Expected: `href="/app/manifest.webmanifest"` and
  `href="/app/apple-touch-icon.png"`, and both `theme-color` metas. If Vite
  left either `href` without `/app/`, write that `href` with the `/app/`
  prefix in `ui/index.html`, note it in `docs/KNOWLEDGE.md`, and rebuild.
  `ls resources/public/app` lists the manifest and the three PNGs.
- [ ] **Step 4: Run the unit tests again**, now against the built files.
  Run: `mise exec -- lgx test`
  Expected: PASS, with the Task 1 checks now running.
- [ ] **Step 5: Commit.**
  `git commit -m "Dashboard: installable, with a web app manifest and theme colours"`

### Task 4: Browser test through the binary

**Files:**
- Create: `e2e/tests/install.spec.js`

- [ ] **Step 1: Write the spec** as the Design's "Testing" section
  describes. Use the `request` fixture for the manifest and icons, and
  `page.goto('/')` plus locators for the head tags. Read the expected bytes
  with `fs.readFileSync` from `ui/public/` (resolve the path from
  `import.meta.url`) and compare with `Buffer.compare(...) === 0`. Open the
  file with a short comment in the style of `dashboard.spec.js`.
- [ ] **Step 2: Run the browser tests.**
  Run: `mise exec -- lgx e2e`
  Expected: PASS, both the existing specs and `install.spec.js`. If the
  PNG bytes differ, stop and report it to the user (see Design, "The
  server change"). Do not change `static-response` under this plan.
- [ ] **Step 3: Commit.**
  `git commit -m "e2e: the manifest and icons through the binary"`

### Task 5: Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/KNOWLEDGE.md`

- [ ] **Step 1: README.** In "The dashboard", add two or three sentences:
  the dashboard can be installed as an app (Chrome or Edge "Install", or
  "Add to Home Screen" on a phone), it has no offline mode, and on iOS the
  installed app keeps its own sign-in, so users may need to sign in once
  more there.
  Use `/writing-clearly`.
- [ ] **Step 2: KNOWLEDGE.** Add a short dated section, "Installable
  dashboard (2026-10-01)": PNGs come back from the binary byte for byte as
  `image/png` (checked by `e2e/tests/install.spec.js`); the icons are made
  from `favicon.svg` by `scripts/gen-icons.mjs` with e2e's Playwright,
  because the host has no SVG rasteriser, so re-run it after changing the
  favicon; the manifest's icon `src`s are relative so dev and build
  both work; whether Vite rewrote the manifest link to `/app/` (as seen in
  Task 3).
- [ ] **Step 3: Commit.**
  `git commit -m "docs: the installable dashboard"`
