[Back to README](../README.md)

# Operations

Maintainer reference for image builds, releases and the hosted instance.
For your own installation, start with [Getting started](getting-started.md).

## Docker

The image (`debian:trixie-slim` plus `libstdc++6`) wraps a `bin/pagelet`
built outside it, using the Dockerfile in the repository. Its `DB_PATH` is
`/app/data/pagelet.duckdb`; mount a volume on `/app/data` to keep the
database. The published image is this Dockerfile around each
architecture's CI binary (see [Releases](#releases)). `lgx docker` builds the binary, then
the image, starts it and checks `/api/health`. The binary must be built on
a glibc no newer than trixie's 2.41 (CI builds on ubuntu-24.04, 2.39, pinned for this reason); see
[KNOWLEDGE.md](KNOWLEDGE.md). CI (`.github/workflows/test.yml`) runs the unit tests,
the dashboard's unit tests, the browser tests and this smoke test on every
push.

## Releases

Pushing a tag `vX.Y.Z` runs `.github/workflows/release.yml`: the tests
(`test.yml`), then on `ubuntu-24.04` and `ubuntu-24.04-arm` a native build
with the unit tests and the image smoke test. Each architecture's image is
pushed to `ghcr.io/abogoyavlensky/pagelet` as `X.Y.Z-amd64` or
`X.Y.Z-arm64`, then joined into one multi-arch image tagged `X.Y.Z`, `X.Y`
and `latest`. Last comes a GitHub release with
`pagelet-linux-amd64.tar.gz`, `pagelet-linux-arm64.tar.gz` and
`checksums.txt`.

```
git tag v0.2.0
git push origin v0.2.0
```

Running the workflow by hand (Actions, or `gh workflow run release.yml`)
is a dry run: the tests and both builds, nothing pushed, no release.
Releases and the master deploy are independent of each other.

## Deployment

Every push to `master` deploys to `https://pagelet.absky.dev` on the
`personal` [uncloud](https://uncloud.run/docs) cluster (the one linkboard
runs on). `.github/workflows/deploy.yml` runs the tests (`test.yml`), builds
the dashboard and `bin/pagelet`, smoke-tests the image around that binary,
runs `uc deploy` with `compose.yaml`, and checks `/api/health` over HTTPS.
uncloud builds the image on the runner and ships it over SSH; its Caddy
terminates TLS and limits request bodies to 64 KB.

Only CI builds what ships: the image is `debian:trixie-slim` (glibc 2.41),
and a binary built on a newer system (Ubuntu 26.04 links glibc 2.43) will
not start in it.

The repository needs:

| Kind | Name | Value |
|---|---|---|
| variable | `SERVER_IP` | the `personal` server's address |
| variable | `APP_DOMAIN` | `pagelet.absky.dev` (a deploy fails if unset) |
| secret | `SSH_PRIVATE_KEY` | a key authorized for `root@SERVER_IP` |
| secret | `ADMIN_PASSWORD` | the dashboard password |

plus a DNS A record for `APP_DOMAIN` pointing at the server.

The database lives on the server in `/root/pagelet-data/pagelet.duckdb`,
on a bind mount that survives deploys. It is not backed up yet
([backup backlog](backlog/duckdb-backups.md)). DuckDB lets one process open the file, so
updates are stop-first: the old container gets SIGTERM, writes its
buffered events and exits, then the new one starts. A deploy is a few
seconds of downtime; the tracker's requests in that window fail.

Logs and state, from a machine with the SSH key:

```
uc --context personal --connect root@<SERVER_IP> logs pagelet
uc --context personal --connect root@<SERVER_IP> ls
```
