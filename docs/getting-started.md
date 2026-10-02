[Back to README](../README.md)

# Getting started

Pagelet is one process and one DuckDB file. Run the image or the binary,
put it behind HTTPS, and add a site.

## Docker

On `linux/amd64` or `linux/arm64`. Replace `change-me` with your own password:

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

## Linux binary

On Linux x86-64 or arm64 with glibc 2.39 or newer and
`libstdc++6` (Ubuntu 24.04, Debian 13, Fedora 40 or later; on an older
system, use the image):

```
curl -fsSL https://github.com/abogoyavlensky/pagelet/releases/latest/download/pagelet-linux-amd64.tar.gz | tar -xz
ADMIN_PASSWORD=change-me ./pagelet
```

On arm64, take `pagelet-linux-arm64.tar.gz`; `checksums.txt` beside them
has the SHA-256 sums. The database is `pagelet.duckdb` in the current
directory; `DB_PATH` puts it elsewhere, in a directory that must exist.

## Add your first site

Open http://localhost:8080, sign in with `ADMIN_PASSWORD`, add a site
by its domain, and put the snippet it shows on that site (see
[Tracking a site](tracking.md)).

## HTTPS and reverse proxies

In production, serve it over HTTPS from a reverse proxy: the tracker is
loaded by the sites you track, and an HTTPS page will not load it over
plain HTTP. Set `TRUST_PROXY=true` only if the proxy replaces any
`X-Forwarded-For` the client sent (Caddy does by default); otherwise
visitors could choose their own address. Limit request bodies at the
proxy; nothing Pagelet accepts comes near 64 KB. In a container with a
memory limit, set `DUCKDB_MEMORY_LIMIT`. Everything else is under
[Configuration](#configuration).

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
