[Back to README](../README.md)

# Tracking a site

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

## Excluding your own visits

To stop counting your own visits, open the tracked site in the browser
you want to exclude, run this in the browser's developer console, and
reload the page:

```js
localStorage.setItem("pagelet_ignore", "true");
```

From the next page load on, that browser sends nothing for that site: no
page views, no custom events, and no time on page. To be counted again,
run this and reload:

```js
localStorage.removeItem("pagelet_ignore");
```

The flag is stored by the site, in one browser:

- Set it on the tracked site, not on the Pagelet dashboard.
- Repeat it for each site and each browser you use.
  `example.com` and `www.example.com` count as different sites here, so
  set it on the one you open.
- Clearing the site's data in the browser removes the flag.

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
