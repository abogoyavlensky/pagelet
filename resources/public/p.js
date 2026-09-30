// pagelet: page views and custom events, no cookies.
(function () {
  var w = window, d = document, l = location, s = d.currentScript;
  if (!s) return;
  function has(n) { return s.hasAttribute("data-" + n); }
  // The endpoint sits beside this script: /p.js -> /api/event.
  var url = s.src.replace(/\/p\.js([?#].*)?$/, "/api/event");
  var hash = has("hash"), first = true, last;
  // file: pages have no host; localhost only with data-dev.
  var off = l.protocol == "file:" || !has("dev") && /^(localhost|127\.0\.0\.1)$/.test(l.hostname);
  // The time zone; the server names the country from it.
  var zone;
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}

  function send(n, p) {
    if (off) return;
    // The referrer goes with the first page view of a load only.
    var v = n == "pageview", e = { d: l.hostname, u: l.href, n: n, z: zone };
    e.r = v && first ? d.referrer : "";
    if (v) first = false;
    if (p) e.p = p;
    // Hash mode: the route is the fragment; the server keeps it.
    if (hash) e.h = l.hash;
    var b = JSON.stringify(e);
    // text/plain needs no CORS preflight; a beacon outlives the page.
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, new Blob([b], { type: "text/plain" }))))
      fetch(url, { method: "POST", body: b, keepalive: true, headers: { "Content-Type": "text/plain" } });
  }

  // A page view when the path (plus hash in hash mode) changed.
  function view() {
    var k = l.pathname + (hash ? l.hash : "");
    if (k != last) { last = k; send("pageview"); }
  }

  // data-manual: no automatic page views; call pagelet("pageview").
  if (!has("manual")) {
    // Single-page apps: history changes and the back button.
    ["pushState", "replaceState"].forEach(function (m) {
      var o = history[m];
      history[m] = function () { var r = o.apply(this, arguments); view(); return r };
    });
    w.addEventListener("popstate", view);
    if (hash) w.addEventListener("hashchange", view);
    view();
  }

  // pagelet("signup", {plan: "pro"}); earlier calls wait in pagelet.q.
  var q = (w.pagelet && w.pagelet.q) || [];
  w.pagelet = send;
  q.forEach(function (a) { send(a[0], a[1]); });
})();
