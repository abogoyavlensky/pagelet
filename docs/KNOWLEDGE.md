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
