// pagelet: page views, custom events and time on page, no cookies.
(function () {
  var w = window, d = document, l = location, s = d.currentScript;
  if (!s) return;
  function has(n) { return s.hasAttribute("data-" + n); }
  // The endpoint sits beside this script: /p.js -> /api/event.
  var url = s.src.replace(/\/p\.js([?#].*)?$/, "/api/event");
  var hash = has("hash"), first = true, last;
  // The owner's flag: localStorage.pagelet_ignore = "true" on the site.
  function ignored() {
    try { return localStorage.getItem("pagelet_ignore") == "true"; } catch (_) { return false; }
  }
  // file: pages have no host; localhost only with data-dev; never when ignored.
  var off = l.protocol == "file:" || !has("dev") && /^(localhost|127\.0\.0\.1)$/.test(l.hostname) || ignored();
  // The time zone; the server names the country from it.
  var zone;
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
  // The open page view: its URL and hash, when its visible stretch began
  // (0 when none runs), and its visible time not yet sent.
  var at, ah, t = 0, ms = 0;

  function post(e) {
    var b = JSON.stringify(e);
    // text/plain needs no CORS preflight; a beacon outlives the page.
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, new Blob([b], { type: "text/plain" }))))
      fetch(url, { method: "POST", body: b, keepalive: true, headers: { "Content-Type": "text/plain" } });
  }

  // Visible time: a stretch runs while the page view is open and the page
  // is visible. performance.now(), so a clock change cannot distort it.
  function start() {
    if (at && !t && d.visibilityState == "visible") t = performance.now();
  }
  function stop() {
    if (t) { ms += performance.now() - t; t = 0; }
  }

  // Send the visible time since the last send, under the page view's URL.
  // Never throws: this runs inside the host's history calls and listeners.
  function flush() {
    try {
      stop();
      if (off || !at || ms < 1) return;
      var e = { d: l.hostname, u: at, e: Math.round(ms) };
      if (hash) e.h = ah;
      post(e);
      ms = 0;
    } catch (_) {}
  }

  // Never throws: the host calls pagelet() and pushState from its own code.
  function send(n, p) {
    try {
      if (off) return;
      // The referrer goes with the first page view of a load only.
      var v = n == "pageview", e = { d: l.hostname, u: l.href, n: n, z: zone };
      e.r = v && first ? d.referrer : "";
      if (p) e.p = p;
      // A page view closes the previous one first, under its own URL.
      if (v) { flush(); first = false; }
      // Hash mode: the route is the fragment; the server keeps it.
      if (hash) e.h = l.hash;
      post(e);
      if (v) { at = l.href; ah = l.hash; ms = 0; start(); }
    } catch (_) {}
  }

  // A page view when the path (plus hash in hash mode) changed.
  function view() {
    var k = l.pathname + (hash ? l.hash : "");
    if (k != last) { last = k; send("pageview"); }
  }

  // Hidden or leaving: send the time so far. pagehide, not unload, keeps
  // the page in the back/forward cache.
  d.addEventListener("visibilitychange", function () { d.visibilityState == "visible" ? start() : flush(); });
  w.addEventListener("pagehide", flush);
  w.addEventListener("pageshow", start);

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
