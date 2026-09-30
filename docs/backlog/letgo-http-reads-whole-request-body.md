**Status: open**

# let-go's http server reads the whole request body

let-go 1.13.0's handler (`pkg/rt/http.go`, `ServeHTTP`) calls
`io.ReadAll(request.Body)` before the let-go handler runs, with no size
limit. `POST /api/event` rejects bodies over 4 KB, but only after the whole
body is in memory, so one client can make the server buffer an arbitrarily
large upload.

Mitigation today: a reverse proxy in front with a small body limit (the
public endpoint only needs a few KB). Fix options: an upstream let-go change
(`http.MaxBytesReader`, or a per-server limit option to `http/start`), or a
Go shim server for pagelet. Found while writing the ingest route (v1 plan,
Task 6).
