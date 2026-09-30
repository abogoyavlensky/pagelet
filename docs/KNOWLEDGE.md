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
| Fraunces, IBM Plex Sans | fontsource 5.3 | the dashboard's fonts, shipped as files in the binary |
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
  The cached browser still runs. CI (ubuntu-latest) installs normally.
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

## Docker image (2026-09-30)

- `bin/pagelet` links glibc and libstdc++ dynamically (`ldd`: libstdc++.so.6,
  libm, libgcc_s, libc), so the image is `debian:trixie-slim` plus
  `libstdc++6`.
- The glibc floor comes from the build host. Built on this dev box (Ubuntu
  26.04, glibc 2.43) the binary needs `GLIBC_2.43` (`objdump -T`), newer
  than trixie's 2.41, so a locally built binary will **not** start in the
  image. CI builds on ubuntu-latest (glibc 2.39), which trixie satisfies.
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
- **No response streaming**: online-now is polled every 15 s by the UI.
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
