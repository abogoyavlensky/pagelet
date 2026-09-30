# pagelet

Self-hosted, cookie-less web analytics from a single binary. A tiny
tracker script (under 2 KB) sends page views and custom events to a
[let-go](https://github.com/nooga/let-go) server that stores them in
[DuckDB](https://duckdb.org) and serves a dashboard for several sites:
visitors, pageviews, a timeseries, top pages, referrers, browsers, OS,
devices, custom events, and who is online now. No cookies on tracked
sites, one admin password for the dashboard. Built with
[lgx](https://github.com/abogoyavlensky/lgx).

What we have learned about the stack is in
[docs/KNOWLEDGE.md](docs/KNOWLEDGE.md).

## Run

Needs lgx 0.4.2 or newer, the Go toolchain, Node, and **a C compiler**
(`.mise.toml` pins lgx 0.4.2, Go 1.27 and Node 24; gcc comes from the
system). The DuckDB driver is cgo over a prebuilt static libduckdb, so:

- the first run builds an `lg` with DuckDB and the user agent parser
  linked in, which takes about 40 s; every run after that is a cache hit
  until `lgx.edn`'s Go coords change;
- builds are native only: `lgx build --target` cannot cross-compile cgo,
  so build each platform on that platform;
- the binary (~90 MB) links glibc and libstdc++ dynamically.

```
lgx run                 # http://localhost:8080, pagelet.duckdb in the cwd
lgx test                # unit, route and whole-system tests
lgx ui-install          # once: the dashboard's npm dependencies
lgx build               # the dashboard, then bin/pagelet
./bin/pagelet
```

Open http://localhost:8080, sign in with the admin password (`admin`
unless `ADMIN_PASSWORD` is set; the server warns at startup), add a site
by its domain, and put the snippet it shows on that site.

`lgx lgx:build` builds the binary without rebuilding the dashboard. Before
the first `lgx ui-build`, the API and the tracker work and the dashboard
pages answer 503 "dashboard not built".

## The dashboard

A React app in `ui/` (Vite, TypeScript, Tailwind, Recharts). `lgx ui-build`
writes it to `resources/public/app/`, which `lgx build` embeds in the
binary; fonts ship with it, nothing loads from a CDN. For work on the UI:

```
lgx run                 # the API on :8080
lgx ui-dev              # Vite on :5173, proxying /api and /p.js to :8080
```

Screens: sign-in, the list of sites (with who is online), and a site's
dashboard: headline numbers, a timeseries (hourly for one day, daily
otherwise), and top-ten lists of pages, referrers, browsers, OS, devices
and custom events, over today, the last 7 or 30 days, or a custom range.
The period is in the URL. Settings rename a site or delete it with its
events.

## Tracking a site

Add the site in the dashboard (its domain, e.g. `example.com`; `www.` is
counted with it), then put this in every page's `<head>`:

```html
<script defer src="https://analytics.example.com/p.js"></script>
```

The script is under 2 KB, sets no cookies, and posts each page view to
`/api/event` on the same host it was loaded from. Single-page apps are
covered: `history.pushState`, `replaceState` and the back button count as
page views when the path changes.

Options, as attributes on the script tag:

| Attribute | Effect |
|---|---|
| `data-hash` | Hash-routed apps: the fragment is part of the page (`/#/about`) and `hashchange` counts |
| `data-manual` | No automatic page views; send them yourself with `pagelet("pageview")` |
| `data-dev` | Track `localhost` and `127.0.0.1` pages too (skipped otherwise; add `localhost` as a site). `file:` pages have no host and are never tracked |

Custom events:

```js
pagelet("signup", { plan: "pro" });
```

A name is 1-64 characters of letters, digits, `_` and `-`; the properties
are an object of up to 2 KB of JSON. To call `pagelet` before the script has
loaded, define the queue first; the script sends what is queued when it
loads:

```html
<script>
  window.pagelet = window.pagelet || function () {
    (window.pagelet.q = window.pagelet.q || []).push(arguments);
  };
</script>
```

## Configuration

Environment variables, each with a development default:

| Variable | Default | |
|---|---|---|
| `PORT` | `8080` | http port |
| `DB_PATH` | `pagelet.duckdb` | the DuckDB file; one process at a time may open it |
| `ADMIN_PASSWORD` | `admin` (warns) | the dashboard password; only its SHA-256 is kept |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy: the client IP is the first `X-Forwarded-For` entry |
| `FLUSH_INTERVAL_MS` | `5000` | how often buffered events are written to DuckDB (sooner at 500 queued) |
| `DUCKDB_MEMORY_LIMIT` | DuckDB's own (80% of RAM) | a cap such as `128MB`; set it in a container with a memory limit, which DuckDB would otherwise overrun |

Events are buffered in memory and written in batches. On `SIGINT` or
`SIGTERM` (Linux) the server stops taking requests, writes what is
buffered, and exits; elsewhere (macOS) a kill loses up to one interval.

## What is collected

Per event: the site, the time (UTC), the event name, the
path (no query string; the fragment only with `data-hash`), the referrer's
host (not when it is the site itself), the browser, OS and device class,
custom event properties, and a visitor id. The visitor id is a SHA-256 of a
random salt that changes every UTC day, the site, the IP address and the
user agent, so the same person is one visitor within a day and cannot be
followed across days or sites; the previous day's salt is deleted once a
new one exists. The IP address and the user agent are never stored. Bots (by user agent) are not counted.

Sessions for the dashboard use one cookie on the analytics host only
(`HttpOnly`, `SameSite=Lax`, `Secure` behind TLS); tracked sites get none.

## Browser tests

The unit tests stop at the handler. The browser tests drive the real
binary: `lgx e2e` builds the dashboard and `bin/pagelet`, starts it on
port 8099 with a throwaway database under `e2e/.tmp`, and runs headless
Chromium through a single-page app with the tracker (page views on load,
`pushState` and Back, a custom event) and through the dashboard (sign-in,
add a site, numbers arriving, periods, delete). Playwright stops the app
when the run ends, so it coexists with an `lgx run` on 8080.

```
lgx e2e-setup           # once: npm ci and the headless Chromium
lgx e2e                 # build, run the specs, stop the app
lgx check               # lgx test, then lgx e2e
```

## Docker

The image (`debian:trixie-slim` plus `libstdc++6`) wraps a `bin/pagelet`
built outside it, as quickmeet does. `lgx docker` builds the binary, then
the image, starts it and checks `/api/health`. The binary must be built on
a glibc no newer than trixie's 2.41 (CI builds on ubuntu-24.04, 2.39, pinned for this reason); see
docs/KNOWLEDGE.md. CI (`.github/workflows/test.yml`) runs the unit tests,
the browser tests and this smoke test on every push.

## Limitations

- Reports are in UTC; there is no local-timezone view.
- No data retention or rollups: events are kept until their site is deleted.
- No bounce rate, time on page or geography.
- One admin password; no accounts.

## Deployment

Every push to `master` deploys to `https://pagelet.absky.dev` on the
`personal` [uncloud](https://uncloud.run/docs) cluster (the one linkboard
runs on). `.github/workflows/deploy.yml` runs the tests (`test.yml`), builds
the dashboard and `bin/pagelet`, smoke-tests the image around that binary,
runs `uc deploy` with `compose.yaml`, and checks `/api/health` over HTTPS.
uncloud builds the image on the runner and ships it over SSH; its Caddy
terminates TLS and limits request bodies to 64 KB.

Only CI builds what ships: the image is `debian:trixie-slim` (glibc 2.41),
and a binary built on a newer system (Ubuntu 26.04 links glibc 2.43) will
not start in it.

The repository needs:

| Kind | Name | Value |
|---|---|---|
| variable | `SERVER_IP` | the `personal` server's address |
| variable | `APP_DOMAIN` | `pagelet.absky.dev` (a deploy fails if unset) |
| secret | `SSH_PRIVATE_KEY` | a key authorized for `root@SERVER_IP` |
| secret | `ADMIN_PASSWORD` | the dashboard password |

plus a DNS A record for `APP_DOMAIN` pointing at the server.

The database lives on the server in `/root/pagelet-data/pagelet.duckdb`,
on a bind mount that survives deploys. It is not backed up yet
(docs/backlog/duckdb-backups.md). DuckDB lets one process open the file, so
updates are stop-first: the old container gets SIGTERM, writes its
buffered events and exits, then the new one starts. A deploy is a few
seconds of downtime; the tracker's requests in that window fail.

Logs and state, from a machine with the SSH key:

```
uc --context personal --connect root@<SERVER_IP> logs pagelet
uc --context personal --connect root@<SERVER_IP> ls
```
