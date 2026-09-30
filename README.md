# pagelet

Self-hosted, cookie-less web analytics from a single binary. A tiny
tracker script sends page views to a [let-go](https://github.com/nooga/let-go)
server that stores them in [DuckDB](https://duckdb.org) and serves a
dashboard for several sites. Built with
[lgx](https://github.com/abogoyavlensky/lgx).

## Run

```
lgx run                 # http://localhost:8080
```

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

What is collected per event: the site, the time (UTC), the event name, the
path (no query string; the fragment only with `data-hash`), the referrer's
host (not when it is the site itself), the browser, OS and device class,
custom event properties, and a visitor id. The visitor id is a SHA-256 of a
random salt that changes every UTC day, the site, the IP address and the
user agent, so the same person is one visitor within a day and cannot be
followed across days or sites. The IP address and the user agent are never
stored. Bots (by user agent) are not counted.
