# What we know: let-go, lgx, DuckDB and the Go packages

Working notes for building pagelet on let-go. Everything here was
verified against source or by running it, on the dates given. When a
claim goes stale, fix or delete it: a missing note beats a wrong one.

## The stack

| Piece | Version | Role |
|---|---|---|
| let-go | 1.13.0 | the runtime; first release with the `:go/*` interop |
| lgx | 0.4.2 | project tool; builds the custom `lg` with Go packages linked in |
| Go | 1.27 | builds the runtime; cgo, because the DuckDB driver is cgo |
| letgo-packages `duckdb`, `ragtime` | duckdb-v0.2.0, ragtime-v0.2.0 | storage and migrations; both name `sql-v0.2.0` |
| `github.com/mileusna/useragent` | v1.3.5 | user agent parsing, generated bindings (`:go/interop`) |
| integrant, ruuter | 1.0.1, v2.1.1 | components, routing |
| React, react-router, Recharts | 19, 7.18, 3 | the dashboard in `ui/` (Vite 8, TypeScript 6, Tailwind 4) |
| dnd-kit (`core`, `sortable`, `utilities`) | 6.3, 10, 3.2 | dragging the overview's cards into order |
| Onest | fontsource 5.3 | the dashboard's font, shipped as files in the binary |
| @playwright/test | 1.56.0 | browser tests in `e2e/`, on `chromium_headless_shell-1194` |

## The useragent bindings (2026-09-30)

`(ua/Parse s)` returns an opaque `go.useragent.UserAgent`. Its struct
fields are **not** reachable with `.-Field` (`method -Name not found`) or
`.Field`; read them as map keys instead: `(:Name u)`, `(:OS u)`,
`(:Mobile u)`, `(:Tablet u)`, `(:Desktop u)`, `(:Bot u)`, `(:Device u)`.
Methods work with `.`: `(.IsChrome u)`.

What the library says for common agents:

| Agent | `:Name` | `:OS` | Mobile/Tablet/Desktop/Bot |
|---|---|---|---|
| Chrome, macOS | `Chrome` | `macOS` | desktop |
| Safari, iPhone | `Safari` | `iOS` | mobile |
| Safari, iPad | `Safari` | `iOS` | tablet |
| Edge, Windows | `Edge` | `Windows` | desktop |
| Firefox, Linux | `Firefox` | `Linux` | desktop |
| Samsung, Android | `Samsung Browser` | `Android` | mobile |
| Chrome, ChromeOS | `Chrome` | `ChromeOS` | desktop |
| Googlebot | `Googlebot` | `""` | bot |
| HeadlessChrome | `Headless Chrome` | `""` | bot |
| curl | `curl` | `""` | none of them |
| `""` | `""` | `""` | none of them |

## Environment

- Go 1.27.1 tarballs on dl.google.com returned 404 on 2026-09-30, so
  `mise install` could not fetch Go. The module proxy still serves the
  toolchain (`GOTOOLCHAIN=go1.27.1 go version` downloads it into the
  module cache); linking that directory to
  `~/.local/share/mise/installs/go/1.27.1` satisfies mise.
- The first `lgx run` built the DuckDB runtime in about 50 s.

## DuckDB through the duckdb package (2026-09-30)

Checked on an in-memory database opened with `(duckdb/open "")`:

| SQL | let-go value |
|---|---|
| `select '{"a":1}'::json` | `{:a 1.0}`: the build has the `json` extension, so `events.props` is `json` |
| `select now() at time zone 'UTC'` | `"2026-09-30T18:31:42.739512"`, a naive timestamp string |
| `select (now() at time zone 'UTC')::date` | `"2026-09-30"` |
| `select current_setting('TimeZone')` | `"Etc/UTC"` on this machine; the `at time zone 'UTC'` form does not depend on it |
| `generate_series(timestamp '2026-09-01', timestamp '2026-09-03', interval 1 day)` | three rows, `"2026-09-01T00:00:00"` ... |
| `count(*)`, `sum(1)`, `count(distinct ...)` | ints |
| `round(2.84, 1)` | **`"2.8"`, a string**: the literal is a DECIMAL. Round a double (`round(x::double / y, 1)`) to get a float |
| `strftime(ts, '%Y-%m-%dT%H:00')` | `"2026-09-01T13:00"` |
| `('2026-09-30'::date - 6)::varchar` | `"2026-09-24"` |
| `select ?::timestamp` with `"2026-09-23T00:00:00"` | round-trips |

A `json` column reads back decoded (numbers as floats); `p::varchar`
gives the text.

ragtime's bookkeeping table (`seq integer primary key, id text`) works on
DuckDB unchanged: migrate, migrate again (no-op), roll back all four.

## Shutdown (2026-09-30)

`syscall/signal-notify` (`pkg/rt/syscall_linux.go:599` in let-go 1.13.0)
delivers signals as ints onto a let-go channel. `syscall/SIGINT` and
`SIGTERM` exist on every platform (`syscall_other.go` defines them too), but
`signal-notify` itself is an "unsupported" stub off Linux, so `main.lg` calls
it in a `try` and falls back to `http/wait`. Checked with the built binary:
post one event, `kill -TERM` at once, and the file holds that event, so
`ig/halt!` ran the buffer's final flush before `os/exit 0`.

let-go core has `sleep` (milliseconds) and `flush!`; defining either in a
namespace prints a redefinition warning unless excluded.

## Headless Chromium is a bot (2026-09-30)

Playwright's `chromium-headless-shell` sends
`... HeadlessChrome/141.0.7390.37 ...`, which the useragent library flags
as `Bot`, so ingest drops its events (202, nothing stored). A page-level
`userAgent` option does **not** help: `navigator.sendBeacon` requests go out
from the browser process with the original agent. Launch the browser with
`--user-agent=<a desktop Chrome string>` instead; that covers beacons too.

## Browser tests (2026-09-30)

- `@playwright/test` 1.56.0, on `chromium_headless_shell-1194` (the same
  build quickmeet uses, already in `~/.cache/ms-playwright`).
- `npx playwright install chromium-headless-shell` fails on this dev box:
  "Playwright does not support chromium-headless-shell on ubuntu26.04-x64".
  The cached browser still runs. CI (ubuntu-24.04) installs normally.
- The tracker spec serves the app from a made-up public host with
  `page.route` and the tracker from `127.0.0.1:8099`. Chromium 141's local
  network access checks block that ("the request client is not a secure
  context and the resource is in more-private address space `loopback`"),
  so the config launches with
  `--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests`.

## Fonts through the binary (2026-09-30)

quickmeet's note that `io/slurp` strings may not carry binaries turned out
not to bite here: every font Vite emits (Fraunces and IBM Plex Sans, woff2
and the woff fallbacks) came back from the built `bin/pagelet` byte for
byte (`curl ... | cmp - resources/public/app/<font>`), and headless
Chromium loaded "Fraunces Variable" and "IBM Plex Sans" 400/500 from it.
So fonts ship as files under `/app/`, served as `font/woff2` / `font/woff`;
no `assetsInlineLimit` change.

On 2026-10-01 Fraunces gave way to Newsreader
(`@fontsource-variable/newsreader/opsz.css`, family "Newsreader
Variable", weights 200-800 with the optical-size axis). Its three woff2
files (latin, latin-ext, vietnamese) came back from the binary byte for
byte as `font/woff2`, and Chromium loaded "Newsreader Variable" and Plex
400/500.

Later the same day the bento redesign replaced both with Onest
(`@fontsource-variable/onest/wght.css`, family "Onest Variable", weights
100-900; it has true tabular figures, checked by measuring `1111` against
`0000` with `tabular-nums`). Its seven woff2 files came back from the
binary byte for byte as `font/woff2`, and Chromium loaded it.

## The redesigned dashboard (2026-10-01)

- Recharts passes `stroke="var(--color-accent)"` and tick `fill` through
  as SVG attributes, and Chromium resolves the variables there (computed
  `rgb(91,109,91)` light, `rgb(157,178,157)` dark), so the chart follows
  the dark theme with no JavaScript.
- `node --test test/` on Node 24.20 treats the directory as a file and
  fails; `node --test "test/*.test.ts"` works. Node runs the `.ts` files
  directly (type stripping) as long as imports name the `.ts` file and
  type imports are `import type`; `ui/src/format.ts` keeps no runtime
  imports for that reason.
- No DuckDB CLI or Python module on the dev box. To seed a scratch
  database with backdated events, a throwaway script run with
  `lgx run script.lg <file>` can use `duckdb.core`, `pagelet.db` and
  `pagelet.migrations` with the server stopped. The ingest endpoint
  cannot backdate: it stamps events with the current time.
- The binary embeds the dashboard, so a UI change needs `lgx build` (or
  `lgx ui-build` then `lgx lgx:build`) before checking it against
  `bin/pagelet`; building while that binary runs fails with "text file
  busy".
- Playwright scrolls an element into view before clicking it, and it did
  so for a menu item still in its 120 ms open animation, moving the page
  by 162 px. A person clicking cannot cause this; a test that reads scroll
  positions after such a click should wait for the menu first.
- Once, a Playwright run left its `../bin/pagelet` web server orphaned
  (parent pid 1) on 8099, and the next run refused to start ("already
  used"). Check `ss -ltnp | grep 8099` before rerunning.
- `e2e/tests/refresh.spec.js` drives the 60 s refresh with
  `page.clock.install()` before the first navigation: time still flows,
  fetches and the server are untouched, and `clock.fastForward(60_000)`
  fires the interval once. A hidden tab is emulated by redefining
  `document.hidden` and dispatching `visibilitychange`; the app reads
  nothing else (not `visibilityState`).
- `totals` casts `sum(pageviews)` to `bigint`: DuckDB's `sum` over a
  BIGINT is a HUGEINT (how the driver would return one was not checked).

## Installable dashboard (2026-10-02)

- PNGs come back from the binary byte for byte as `image/png`, like the
  fonts (`e2e/tests/install.spec.js` compares each icon with its file in
  `ui/public/`).
- The icons are made from `ui/public/favicon.svg` by
  `scripts/gen-icons.mjs`, drawn full-bleed (the tile's `rx` removed), with
  the e2e tests' Playwright: the host has no SVG rasteriser. Re-run it and
  commit the PNGs after changing the favicon.
- Vite rewrites `href="/manifest.webmanifest"` and
  `href="/apple-touch-icon.png"` in `index.html` to `/app/...`, as it does
  for the favicon. It does not touch the manifest's contents, so the icon
  `src`s there are relative to the manifest, which keeps them right under
  `lgx ui-dev` (served at `/`) and in the build (`/app/`).
- No service worker: Chrome offers "Install" without one, and a cached
  dashboard would only show stale numbers.

## Docker image (2026-09-30)

- `bin/pagelet` links glibc and libstdc++ dynamically (`ldd`: libstdc++.so.6,
  libm, libgcc_s, libc), so the image is `debian:trixie-slim` plus
  `libstdc++6`.
- The glibc floor comes from the build host. Built on this dev box (Ubuntu
  26.04, glibc 2.43) the binary needs `GLIBC_2.43` (`objdump -T`), newer
  than trixie's 2.41, so a locally built binary will **not** start in the
  image. CI builds on ubuntu-24.04 (glibc 2.39), which trixie satisfies; the
  workflows pin that runner, because `ubuntu-latest` will move to a newer
  Ubuntu whose glibc trixie lacks.
  Build the image from a CI binary, or build the binary on a host with a
  glibc no newer than the base image's.
- Not run here: the agent user has no access to the Docker socket, so
  `lgx docker` (the smoke test) was not executed on this machine.

## let-go constraints the design works around

- **Handlers share one dynamic-binding stack** (let-go 1.13.0; see
  quickmeet's `docs/backlog/letgo-http-handlers-share-dynamic-bindings.md`):
  nothing on the request path uses `binding`, and there is no HoneySQL;
  queries are plain SQL strings with `?` parameters (`src/pagelet/db.lg`,
  `stats.lg`).
- **Streaming responses are untried here**: let-go 1.13.0 writes a
  channel or lazy-seq response body chunk by chunk, flushing after each
  (`streamResponseBody` in `pkg/rt/http.go`, let-go #851), but pagelet has
  never used it, and buffering through Caddy is unchecked. The dashboard
  polls by choice: who is online every 15 s, the reports every 60 s
  (`ui/src/refresh.ts`).
- **`signal-notify` is Linux-only** (`pkg/rt/syscall_linux.go:599`;
  `syscall_other.go` stubs it): `main.lg` falls back to `http/wait`.
- **cgo cannot cross-compile**: `lgx build --target` forces
  `CGO_ENABLED=0`; build natively.
- **No monitor locks** (`monitor-enter` is a no-op): the ingest buffer's
  write lock is a one-slot channel holding a token (`ingest.lg`, `locked`).
- **Static files are read with `io/slurp`** into a string; fonts survive it
  (above).

## Gotchas met along the way (2026-09-30)

- let-go's request `:uri` is `RequestURI()`, the path **with** the query
  string, and ruuter splits `:uri` into segments, so
  `/api/sites/x/stats?period=7d` would not match `/api/sites/:id/stats`.
  The handler routes on the path and keeps the original as `:request-uri`
  (`routes.lg`, `handler`).
- let-go's http server reads the whole request body (`io.ReadAll`) before
  the handler sees it; the 4 KB event limit is checked after. An upstream
  limit (a reverse proxy's body size) is the real guard.
- let-go core defines `flush!`, `sleep`, `send`, `open` and `close!`;
  defining one in a namespace prints a redefinition warning unless it is in
  `:refer-clojure :exclude`.
- A var named `os` would shadow let-go's `os` namespace inside its file; the
  stats fn is `operating-systems`.
- The routes answer GET only, so `curl -I` (HEAD) gets 404; check headers
  with `curl -s -D - -o /dev/null`.
- Vite's `base: '/app/'` applies to the dev server too, where `/login` then
  404s; `ui/vite.config.ts` sets it for builds only.
- A global `:focus-visible` rule outside a CSS layer beats Tailwind's
  layered utilities (`focus-visible:outline-none`); it lives in
  `@layer base`.

## Countries from the time zone (2026-09-30)

- `src/pagelet/timezones.lg` is generated: `scripts/gen-timezones.sh >
  src/pagelet/timezones.lg`, from the machine's `/usr/share/zoneinfo`
  (tzdata 2026c on the dev box: 542 entries). Every `zone.tab` row names one
  country (418); `zone1970.tab` would not do, it merges neighbours
  (`Europe/Berlin` for DE, DK, NO, SE). Links in `tzdata.zi` (`L target
  name`) add the legacy names browsers report (`Asia/Calcutta`,
  `Europe/Kiev`, `US/Pacific`; 124 of them). The abbreviation-style links
  (`EST`, `CET`, `PST8PDT`, ...) are skipped: `EST` links to
  `America/Panama`. `UTC`, `GMT` and `Etc/*` link outside `zone.tab` and
  drop out. `timezones_test.lg` pins the count; update it on a regeneration.
- let-go 1.13.0 compiles the 542-entry map literal without trouble.
- Playwright's `timezoneId` reaches `Intl.DateTimeFormat()` in the tracker,
  beacons included (`tracker.spec.js`).
- Flags are regional-indicator pairs drawn by the system's emoji font.
  This dev box has none (only DejaVu), and `chromium-headless-shell` did not
  paint Noto Color Emoji even when injected as a web font (the glyphs took
  space but were blank), so flags could not be checked by eye here; the DOM
  text is right. Chrome and Edge on Windows show the two letters instead.

## Deploying on uncloud (2026-09-30)

pagelet deploys to the `personal` cluster (linkboard's) with `uc` 0.20.0;
`compose.yaml` and `.github/workflows/deploy.yml` are the whole setup.

- **Update order.** uncloud v0.20.0 picks the order per container in
  `determineUpdateOrder` (`pkg/client/deploy/strategy.go:425`): an explicit
  `deploy.update_config.order` wins; otherwise stop-first only for host-mode
  port conflicts or for a single replica with Docker *volumes*
  (`MountedDockerVolumes`, `pkg/api/service.go:108`, type `volume`), and
  start-first for everything else, **bind mounts included**. DuckDB locks
  its file to one process, so a start-first update would crash the new
  container on the lock. `compose.yaml` sets `order: stop-first`
  (`pkg/client/compose/service.go:110-119` maps it). linkboard runs
  start-first on a bind mount only because SQLite's WAL tolerates two
  processes.
- **Caddy.** uncloud's Caddy publishes 80/443 in host mode
  (`pkg/client/caddy.go:66-79`) and its generated config has no
  `trusted_proxies`, so it replaces a client-sent `X-Forwarded-For` with the
  connecting address: `TRUST_PROXY=true` is safe behind it, **as long as
  the cluster's `caddy` service has no global `x-caddy` block with
  `servers { trusted_proxies ... }`** (it goes first in the Caddyfile,
  `internal/machine/caddyconfig/caddyfile.go:156-181`, and would apply to
  every service). The `personal` cluster is shared with linkboard: whoever
  adds a CDN or trusted proxy there must check pagelet, or clients can spoof
  its visitor IPs through `X-Forwarded-For`. pagelet's
  `x-caddy` block adds `request_body { max_size 64KB }`.
- **Offline check.** `uc deploy` has no dry run. To check `compose.yaml`,
  put a scratch test in a clone of uncloud v0.20.0 under
  `pkg/client/compose/` that calls `LoadProject`, `ServiceSpecFromCompose`
  and `spec.Validate()` with `APP_DOMAIN` and `ADMIN_PASSWORD` set, and
  print the spec as JSON; run it with `go test ./pkg/client/compose/ -run
  <Name> -v`. On 2026-09-30 it showed `UpdateConfig.Order: stop-first`, a
  `bind` volume `/root/pagelet-data` with `CreateHostPath: true` mounted at
  `/app/data`, `Memory` 256 MiB / `MemoryReservation` 128 MiB,
  `StopGracePeriod` 10 s, the five env vars, and the Caddy block rendered
  with the domain. With `APP_DOMAIN` unset, loading fails ("required variable
  APP_DOMAIN is missing a value"), because the block uses
  `${APP_DOMAIN:?...}`; a bare ` {` would make Caddy drop the block while
  `uc deploy` still reports success.
- **Image tags** are `<service>/<service>:<date>-<time>.<short commit>`
  (e.g. `pagelet/pagelet:2026-09-30-211528.1a16bce`).
- **DuckDB memory.** Unset, DuckDB's `memory_limit` is 80% of the RAM it
  sees (9.1 GiB on the dev box). `SET memory_limit = '128MB'` is global to
  the database, so every pool connection reads `122.0 MiB` back; a bad value
  is a DuckDB parser error. `DUCKDB_MEMORY_LIMIT` sets it when the
  connection opens (`db.lg`).

### The first deploy (2026-09-30)

- `deploy.yml` run 36779409408 on `f6e7730`: the deploy job took 1m17s
  (warm runtime cache). uc built `pagelet/pagelet:2026-09-30-212609.f6e7730`,
  pushed it to machine `personal-1`, and planned
  `+ create service pagelet` / `run container pagelet on personal-1`, then
  "Monitoring (5s)" and "Running". The HTTPS health check passed on its
  first try: DNS already pointed at the server and Caddy had the
  certificate by then.
- Over HTTPS: a 100 KB `POST /api/event` gets 413 from Caddy (the 64 KB
  `request_body` limit); an event for an unknown site gets 202 with
  `Access-Control-Allow-Origin: *`; a wrong password 401. The dashboard
  loads Fraunces and Plex from the binary.
- Signed in with the real password, a throwaway site, and a page on its
  made-up domain loading `https://pagelet.absky.dev/p.js`: a load plus a
  `pushState` counted 2 pageviews from 1 visitor within the flush interval,
  and online-now showed 1.
- The second deploy (run 36782520653, a docs-only commit) planned
  `-/+ replace container pagelet/28e175fac682 on personal-1 (stop-first)`:
  the old container stopped at 22:01:00.4-00.7 UTC, the new one started at
  01.7, was monitored 5 s, then the old one was removed. An outside poll
  of `/api/health` every ~0.66 s saw no failure in 698 samples; the one
  request sent during the switch came back 200 about 1.1 s late. The
  throwaway site and its 2 pageviews were still there afterwards, so the
  bind-mounted DuckDB file survives a replacement.

## Public sites (2026-10-02)

- `alter table sites add column is_public boolean default false` fills the
  default into existing rows; DuckDB takes no `not null` in `add column`.
  The duckdb package returns the column as a real boolean (`true?` and
  `false?` hold), so nothing converts it.
- The column is `is_public` (`public` is a schema name) and is read back
  `as "public"`.
- An insert that lists no columns (`insert into sites values (...)`)
  breaks as soon as a column is added; `db/create-site!` and the ingest
  test fixture name theirs.
- A public site's reports answer 200 without the cookie, so a dashboard
  whose session has run out keeps the owner's chrome until it next asks
  `/api/me` (a reload) or makes a session-only call; then it falls back to
  the visitor's view.
- `browser.newContext()` in a spec does not take the config's `use`
  options; pass `{ baseURL }` from the fixture. Launch args (the user agent
  flag) do carry over, since the browser is shared.
- On 2026-10-02 port 8099 was held by another project's server
  (quickmeet). `E2E_PORT=8098 npx playwright test` (after `lgx build`)
  runs the specs elsewhere; `tracker.spec.js` points its fixture at
  `baseURL` for this.

## Engagement (2026-10-02)

- Headless Chromium delivers the tracker's `pagehide` beacon when the page
  navigates to another site, but aborts it (`net::ERR_ABORTED`) on
  `page.goto('about:blank')`. Order on leaving: `beforeunload`,
  `pagehide` (still "visible"), then `visibilitychange` to hidden. The
  tracker spec leaves for a routed `http://elsewhere.test/`.
- Playwright reports a beacon's body sent during unload as `null`
  (`request.postData()`), though the server receives it.
- `parse-event` gets JSON numbers as let-go numbers that `int` cuts:
  `1500.7` becomes 1500, and `(min 1e300 1800000)` then `int` stays in
  range. A float `e` below 1 (`0.4`) is refused.
- In DuckDB, `/` on integers is float division, so
  `round(sum(engaged_ms) / count(distinct visitor) / 1000)` needs no cast
  before it; `avg` over no rows is null, which reads back as nil.
- The tracker went from 2204 to 3695 bytes; README says "under 4 KB".

## Manual site order (2026-10-02)

- DuckDB takes `update sites set position = r.n from (select id,
  row_number() over (order by domain) as n from sites) r where sites.id =
  r.id` (migration 008's backfill) and `insert ... select ?, ...,
  coalesce(max(position), 0) + 1 from sites returning ...` (a new site
  last; the aggregate yields one row on an empty table).
- ruuter 2.1.1 matches a literal segment before a parameter, so
  `PUT /api/sites/order` and `PUT /api/sites/:id` coexist in any order in
  the table.
- dnd-kit's default screen-reader announcements name an item by its id;
  `Sites.tsx` passes its own with the domain.
- dnd-kit swallows clicks for 50 ms after a drag ends (a capture listener
  on the document), so a script that taps a card right after a touch drag
  sees nothing happen; a person cannot be that fast.
- Playwright drives a dnd-kit drag with `page.mouse` (down, a few small
  moves, then the move to the target in steps, up). A touch drag needs CDP
  `Input.dispatchTouchEvent` (touchStart, touchMove..., touchEnd);
  `touch-action: none` on the handle keeps the page from scrolling.
- The preview browser in T3 Code is not available on a headless box; a
  throwaway script under `e2e/.tmp/` (ignored) importing `chromium` from
  `@playwright/test` does the same job against the built binary.

## Releases (2026-10-02)

- `v0.1.0` (run 37072258841, on `4d77d4c`): test 1m28s, amd64 build 57 s
  (warm runtime cache, shared with `test.yml`), arm64 build 1m56s (cold:
  the first arm64 build of pagelet, on `ubuntu-24.04-arm`), publish 17 s.
  lgx 0.4.2, Go and Node install through mise on arm64 unchanged; the
  DuckDB runtime builds, `lgx test` and the image smoke test pass there.
- `runner.os` is `Linux` on both architectures, so the arm64 runtime cache
  is keyed `runtimes-arm64-Linux-...`; a prefix starting `runtimes-Linux-`
  would be restored by the amd64 fallback (and the other way round).
- The ghcr package came out **public** on the first push from the public
  repository: an anonymous token
  (`https://ghcr.io/token?scope=repository:abogoyavlensky/pagelet:pull`)
  reads `latest`, `0.1` and `0.1.0`, each an index of `linux/amd64` and
  `linux/arm64`. No manual visibility switch was needed.
- The release binary from ubuntu-24.04 needs `GLIBC_2.38` at most
  (`objdump -T`); the README promises 2.39, the build host's, as the safe
  floor. It ran on the dev box (glibc 2.43) from the README's
  `releases/latest/download` URL, and its checksum matched `checksums.txt`.
- The agent's `gh` token cannot dispatch workflows (403 "Resource not
  accessible by personal access token" on `gh workflow run`), so a dry run
  is started by the owner from the Actions tab. Pushing a tag works.
- `test.yml`'s concurrency group is `test-<calling workflow>-<ref>`: a
  dry run of `release` on master and a master `deploy` no longer share one.

## Excluding your own visits (2026-10-03)

- The tracker reads `localStorage.pagelet_ignore` once, into `off`, so a
  page load is either counted whole or not at all. It went from 3695 to
  3925 bytes; README says "under 4 KB", which leaves about 170.
- In Chromium, an init script with
  `Object.defineProperty(window, "localStorage", { get() { throw ... } })`
  makes every `localStorage` access throw: the e2e stand-in for blocked
  storage.

## Clickable pages (2026-10-05)

- `pageUrl` in `ui/src/format.ts` assumes https and appends the stored
  path verbatim; in hash mode the fragment is already in the path, so
  `/#/about` needs no special case.
- `domain` is optional from `Body` down to `Pages` and `LiveCard`: the
  report can render before the site list resolves, and a row without a
  domain stays plain text rather than linking to a placeholder.
- Only the name is the anchor, kept `relative` so it sits above the row's
  absolutely positioned bar. Sources and the other breakdowns pass no
  `href`, so they stay plain text by construction.

## Time zones in DuckDB (2026-10-05)

- The duckdb package's build has ICU: `pg_timezone_names()` lists 638
  zones, legacy browser names included (`Asia/Calcutta`, `Europe/Kiev`,
  `US/Pacific`) and `UTC`, `Etc/UTC`, `GMT`. An unknown zone in a
  conversion throws "Unknown TimeZone".
- `?::timestamp at time zone ?` cannot take a bound zone: DuckDB types the
  second parameter as a timestamp and fails on the string, `?::varchar`
  too. The function form binds: `timezone(?, ts)`.
- naive local to naive UTC is `timezone('UTC', timezone(zone, local))`;
  naive UTC to naive local is `timezone(zone, timezone('UTC', utc))`; the
  zone's day is `timezone(zone, now())::date`. None of them follows
  `set TimeZone`; `now()::timestamp` does, so `stats.lg` never uses it.
- A local time that does not exist (02:30 on 2026-03-29 in Amsterdam)
  converts as if it did (01:30 UTC). On the fall-back day 00:30 and 01:30
  UTC both read 02:30 local, so an hourly chart merges them.
- let-go 1.13.0 has no URL decoder (`http` has none, `string` only
  `escape`); `routes.lg` has a small `percent-decode`. `(read-string
  "0x2F")` is 47; `str/replace` takes a regex and a function.
- Signed in, the overview's cards ask `/stats?period=7d`; a spec that
  navigates from there to a site page must match its own period, or it
  catches a card's request that the navigation aborts ("No resource with
  given identifier found" on `response.json()`).
