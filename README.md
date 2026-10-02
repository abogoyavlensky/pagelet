# pagelet

Self-hosted, cookie-less web analytics from a single binary. A tiny
tracker script (under 4 KB) sends page views, custom events and time on
page to a [let-go](https://github.com/nooga/let-go) server that stores
them in [DuckDB](https://duckdb.org) and serves a dashboard for several
sites: visitors, pageviews, bounce rate, visit duration, a timeseries, top
pages with time on page, sources, countries, devices, browsers, OS,
custom events, and who is online now. No cookies on tracked
sites, one admin password for the dashboard. Built with
[lgx](https://github.com/abogoyavlensky/lgx).

What we have learned about the stack is in
[docs/KNOWLEDGE.md](docs/KNOWLEDGE.md).

## Quickstart

pagelet is one process and one DuckDB file. Run the image or the binary,
put it behind HTTPS, and add a site.

With Docker, on `linux/amd64` or `linux/arm64`:

```
docker run -d --name pagelet --restart unless-stopped \
  -p 8080:8080 \
  -v pagelet-data:/app/data \
  -e ADMIN_PASSWORD=change-me \
  ghcr.io/abogoyavlensky/pagelet:latest
```

The database is `/app/data/pagelet.duckdb`, in the `pagelet-data` volume.
The tags are `latest`, `X.Y` and `X.Y.Z`. To update, pull the new image,
stop and remove the old container, and run the command above again. Stop
it with `docker stop`, not `docker rm -f`: the server writes its buffered
events on SIGTERM, and only one process at a time may open the database.

```
docker pull ghcr.io/abogoyavlensky/pagelet:latest
docker stop pagelet && docker rm pagelet
```

With the binary, on Linux x86-64 or arm64 with glibc 2.39 or newer and
`libstdc++6` (Ubuntu 24.04, Debian 13, Fedora 40 or later; on an older
system, use the image):

```
curl -fsSL https://github.com/abogoyavlensky/pagelet/releases/latest/download/pagelet-linux-amd64.tar.gz | tar -xz
ADMIN_PASSWORD=change-me ./pagelet
```

On arm64, take `pagelet-linux-arm64.tar.gz`; `checksums.txt` beside them
has the SHA-256 sums. The database is `pagelet.duckdb` in the current
directory; `DB_PATH` puts it elsewhere, in a directory that must exist.

Then open http://localhost:8080, sign in with `ADMIN_PASSWORD`, add a site
by its domain, and put the snippet it shows on that site (see
[Tracking a site](#tracking-a-site)).

In production, serve it over HTTPS from a reverse proxy: the tracker is
loaded by the sites you track, and an HTTPS page will not load it over
plain HTTP. Set `TRUST_PROXY=true` only if the proxy replaces any
`X-Forwarded-For` the client sent (Caddy does by default); otherwise
visitors could choose their own address. Limit request bodies at the
proxy; nothing pagelet accepts comes near 64 KB. In a container with a
memory limit, set `DUCKDB_MEMORY_LIMIT`. Everything else is under
[Configuration](#configuration).

## Run from source

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
lgx ui-test             # the dashboard's unit tests (labels and badges)
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

Light or dark with the system, laid out for desktops and phones. `/` is
the websites overview: a card per site with the last 7 days' visitors,
the change against the 7 days before, a sparkline and who is online. A
site's page has one top bar (the logo back to the overview, the site as a
button that switches sites, the period as tabs: today, 7 or 30 days, or a
custom range of UTC days kept in the URL, then Refresh, Settings and
sign-out) over a grid of cards:

- visitors, pageviews, views per visit, bounce rate and visit duration,
  each with the change against the span just before (cut at the same time
  of day while today runs);
- the traffic chart (hourly for one day, daily otherwise), switchable
  between visitors and pageviews, beside who is online now and on which
  pages;
- top pages (visitors, views and time on page) and sources (visitors and
  views), countries, and devices,
  browsers or systems (visitors and share), and custom events.

A visit is a visitor's day (see What is collected), and a bounce is a
visitor whose only event in the period is one page view. Visit duration
is the average time the site's pages were visible to a visit, and time on
page the time a page was visible per visitor who saw it; both count only
the visits the tracker measured, and show "–" when none was. Settings hold the
tracking code, the domain, whether the dashboard is public, and deleting
the site with its events. A site
is added by its domain alone; until its first event arrives, its page
shows the tracking code and waits, and the first visit turns that into
"You're live".

A site is private until its Settings make it public. Then anyone with its
link (`/sites/<id>`, shown in Settings) can read the whole dashboard
without signing in: every number and list, the custom events, and who is
online. They cannot change anything, and the site list and every other
site stay private. Turning it off closes the page at once; a visitor who
then reloads lands on the login page. The overview marks public sites.

An open dashboard keeps itself current: while it is visible, the overview
and a site's page ask for their numbers again every minute, and at once
when you come back to the tab or the app. A range that ended before today
is left alone. Refresh in the top bar asks right away. A site's "Right
now" card keeps its own pace, every 15 seconds.

The dashboard installs as an app: "Install" in Chrome or Edge, or "Add to
Home Screen" on a phone, opens it in its own window. It has no offline
mode. On iOS the installed app keeps its own sign-in, so you may need to
sign in once more there.

## Tracking a site

Add the site in the dashboard (its domain, e.g. `example.com`; `www.` is
counted with it), then put this in every page's `<head>`:

```html
<script defer src="https://analytics.example.com/p.js"></script>
```

The script is under 4 KB, sets no cookies, and posts each page view to
`/api/event` on the same host it was loaded from. When a page view ends or
the tab is hidden, it also posts how long the page was visible. It adds no
scroll or timer listeners, keeps the page in the back/forward cache, and
never throws into the page: a tracker failure cannot break the site's
navigation or its `pagelet()` calls. Single-page apps are
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
| `DB_PATH` | `pagelet.duckdb` (`/app/data/pagelet.duckdb` in the image) | the DuckDB file; one process at a time may open it; its directory must exist |
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
the browser's time zone and the country it belongs to, custom event
properties, and a visitor id. The visitor id is a SHA-256 of a
random salt that changes every UTC day, the site, the IP address and the
user agent, so the same person is one visitor within a day and cannot be
followed across days or sites; the previous day's salt is deleted once a
new one exists. The IP address and the user agent are never stored. Bots (by user agent) are not counted.

The country comes from the time zone the browser reports
(`Europe/Amsterdam` is the Netherlands), never from the IP address. A
browser that reports `UTC`, or a zone that names no country, has none.

Per engagement (the time a page was visible): the site, the time (UTC),
the visitor id, the path, and the visible milliseconds; nothing else.

Sessions for the dashboard use one cookie on the analytics host only
(`HttpOnly`, `SameSite=Lax`, `Secure` behind TLS); tracked sites get none.

## Browser tests

The unit tests stop at the handler. The browser tests drive the real
binary: `lgx e2e` builds the dashboard and `bin/pagelet`, starts it on
port 8099 (or `E2E_PORT`) with a throwaway database under `e2e/.tmp`, and runs headless
Chromium through a single-page app with the tracker (page views on load,
`pushState` and Back, a custom event, time on page through a navigation
and leaving the page, and a failing tracker that must not break the page)
and through the dashboard (sign-in,
add a site, its first visit, the numbers and lists, the metric and period
switches, who is online, delete; a public site read without a session,
and closed again; refreshing by button, by the minute, on return to the
tab and after a failed request). Playwright stops the app
when the run ends, so it coexists with an `lgx run` on 8080.

```
lgx e2e-setup           # once: npm ci and the headless Chromium
lgx e2e                 # build, run the specs, stop the app
lgx check               # lgx test, lgx ui-test, then lgx e2e
```

## Docker

The image (`debian:trixie-slim` plus `libstdc++6`) wraps a `bin/pagelet`
built outside it, as quickmeet does. Its `DB_PATH` is
`/app/data/pagelet.duckdb`; mount a volume on `/app/data` to keep the
database. The published image is this Dockerfile around each
architecture's CI binary (see Releases). `lgx docker` builds the binary, then
the image, starts it and checks `/api/health`. The binary must be built on
a glibc no newer than trixie's 2.41 (CI builds on ubuntu-24.04, 2.39, pinned for this reason); see
docs/KNOWLEDGE.md. CI (`.github/workflows/test.yml`) runs the unit tests,
the dashboard's unit tests, the browser tests and this smoke test on every
push.

## Releases

Pushing a tag `vX.Y.Z` runs `.github/workflows/release.yml`: the tests
(`test.yml`), then on `ubuntu-24.04` and `ubuntu-24.04-arm` a native build
with the unit tests and the image smoke test. Each architecture's image is
pushed to `ghcr.io/abogoyavlensky/pagelet` as `X.Y.Z-amd64` or
`X.Y.Z-arm64`, then joined into one multi-arch image tagged `X.Y.Z`, `X.Y`
and `latest`. Last comes a GitHub release with
`pagelet-linux-amd64.tar.gz`, `pagelet-linux-arm64.tar.gz` and
`checksums.txt`.

```
git tag v0.2.0
git push origin v0.2.0
```

Running the workflow by hand (Actions, or `gh workflow run release.yml`)
is a dry run: the tests and both builds, nothing pushed, no release.
Releases and the master deploy are independent of each other.

## Limitations

- Reports are in UTC; there is no local-timezone view.
- No data retention or rollups: events are kept until their site is deleted.
- Time on page is time visible, not time active: a visible tab left open
  counts, up to 30 minutes per stretch. A visit across UTC midnight counts
  as two, since the visitor id changes. There is no scroll depth.
- Countries are only as accurate as the visitor's time zone setting; there
  is no region or city view.
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

## License

MIT, see [LICENSE](LICENSE).
