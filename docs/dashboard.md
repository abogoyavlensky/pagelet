[Back to README](../README.md)

# The dashboard

Light or dark with the system, laid out for desktops and phones. `/` is
the websites overview: a card per site with the last 7 days' visitors,
the change against the 7 days before, a sparkline and who is online. The
sites are in your order: drag a card by the handle in its corner to move
it (by mouse, touch or keyboard), and a new site goes last. The site
switcher follows the same order. A
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

Each page in the top pages and in the "Right now" card links to that page
on the site, in a new tab. The link is `https://` plus the site's domain as
entered plus the path, so a site served over plain http, or only on `www`,
may need its address corrected by hand.

A visit is a visitor's day (see [What is collected](tracking.md#what-is-collected)), and a bounce is a
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

## Limitations

- Reports are in UTC; there is no local-timezone view.
- No data retention or rollups: events are kept until their site is deleted.
- Time on page is time visible, not time active: a visible tab left open
  counts, up to 30 minutes per stretch. A visit across UTC midnight counts
  as two, since the visitor id changes. There is no scroll depth.
- Countries are only as accurate as the visitor's time zone setting; there
  is no region or city view.
- One admin password; no accounts.
