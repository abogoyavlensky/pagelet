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
