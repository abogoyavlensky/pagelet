[Back to README](../README.md)

# Development

Run commands through [mise](https://mise.jdx.dev): use an activated shell
or prefix them with `mise exec --`. Install the pinned tools with
`mise install`; install gcc through your system package manager.

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
lgx ui-install          # once: the dashboard's npm dependencies
lgx ui-build            # build the dashboard before the first run
lgx run                 # http://localhost:8080, pagelet.duckdb in the cwd
lgx test                # unit, route and whole-system tests
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

## Dashboard development

A React app in `ui/` (Vite, TypeScript, Tailwind, Recharts). `lgx ui-build`
writes it to `resources/public/app/`, which `lgx build` embeds in the
binary; fonts ship with it, nothing loads from a CDN. For work on the UI:

```
lgx run                 # the API on :8080
lgx ui-dev              # Vite on :5173, proxying /api and /p.js to :8080
```

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

## Stack notes

[KNOWLEDGE.md](KNOWLEDGE.md) records verified stack behavior and gotchas.
See [Operations](operations.md) for image builds, releases and deployment.
