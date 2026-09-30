# Deploy on uncloud Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pagelet runs at `https://pagelet.absky.dev` on the `personal` uncloud cluster (linkboard's), deployed by CI on every push to master, with its DuckDB file surviving deploys.

**Tech Stack:** uncloud (`uc` 0.20.0) with its built-in Caddy, Docker Buildx with the GitHub Actions cache, GitHub Actions, the existing lgx build and `debian:trixie-slim` image, DuckDB's `memory_limit` setting.

**Repos:**
- pagelet: `~/Projects/pagelet`, branch from `master` (v1 is merged, PR #1). Remote `origin` = `github.com/abogoyavlensky/pagelet`.
- Reference deployments: `~/Projects/linkboard` (same cluster: `compose.yaml`, `.github/workflows/deploy.yaml`, `docs/plans/2026-08-26-2213-uncloud-migration.md`) and `~/Projects/quickmeet` (same stack: `compose.yaml`, `.github/workflows/deploy.yml`, "Learned while setting up staging on uncloud" in `docs/KNOWLEDGE.md`).
- uncloud source for checks: `https://github.com/psviderski/uncloud` at tag `v0.20.0` (clone to `/tmp/uncloud` if needed).

---

## Design

### Approach

The shape linkboard and quickmeet already use: a `compose.yaml` describing one service, `pagelet`, with a `build:` section. uncloud builds the image on the CI runner (buildx, GHA cache) and ships it over SSH, and its Caddy terminates TLS for `${APP_DOMAIN}`. A new `deploy.yml` runs on every push to master:
1. calls `test.yml` (unit tests, browser tests, image smoke test);
2. rebuilds the dashboard and binary on ubuntu-latest (a runtime cache hit);
3. smoke-tests the image around that exact binary;
4. runs `uc deploy`;
5. checks `https://${APP_DOMAIN}/api/health`.

What CI already proved (PR #1, run 36772045505): the image built around a binary from ubuntu-latest (glibc 2.39) starts on trixie (glibc 2.41) and answers `{"ok":true}`. A binary built on the Ubuntu 26.04 dev box needs glibc 2.43 and would not start in the image, so **only CI builds what ships**; nobody deploys from a laptop.

### Key decisions

- **Cluster `personal`, the same as linkboard** (the server also runs readx, ppnardstg and linkboard). `compose.yaml` has `x-context: personal`; the deploy runs `uc --context personal --connect root@${SERVER_IP} deploy -f compose.yaml --yes pagelet`.
- **An explicit stop-first update: `deploy.update_config.order: stop-first`.** This is the line the deployment cannot do without. DuckDB takes a single-process lock on its file, so a new container cannot open the database while the old one runs. In uncloud v0.20.0, `determineUpdateOrder` (`pkg/client/deploy/strategy.go:425`) picks stop-first automatically only for host-mode port conflicts or for single-replica services with Docker *volumes* (`MountedDockerVolumes`, `pkg/api/service.go:108`, type `volume`). A bind mount gets start-first: the new container would crash on the lock and the deploy would fail. linkboard gets away with start-first only because SQLite's WAL tolerates two open processes. `compose.LoadProject` maps `deploy.update_config.order: stop-first` to `api.UpdateOrderStopFirst` (`pkg/client/compose/service.go:110-119`).
- **Data on a bind mount, kept, no backups yet.** `/root/pagelet-data:/app/data`, `DB_PATH=/app/data/pagelet.duckdb` (the WAL `pagelet.duckdb.wal` sits beside it). uncloud creates the host directory. Backups go into a backlog entry (linkboard's Litestream plan does not transfer: it tails a SQLite WAL).
- **Caddy through `x-caddy`, with a body limit.** A custom block rather than linkboard's `x-ports: ${APP_DOMAIN}:8080/https`, for one reason: `request_body { max_size 64KB }`. It is the proxy-side mitigation `docs/backlog/letgo-http-reads-whole-request-body.md` calls for; nothing pagelet accepts is near 64 KB. The block (compose interpolates `${APP_DOMAIN}`, uncloud renders `{{upstreams 8080}}`):

  ```caddyfile
  ${APP_DOMAIN} {
    request_body {
      max_size 64KB
    }
    reverse_proxy {{upstreams 8080}}
  }
  ```

- **`TRUST_PROXY=true`.** uncloud's Caddy publishes 80/443 in host mode (`pkg/client/caddy.go:66-79`), so it sees the real client address. Its generated config sets no `trusted_proxies`, so Caddy replaces any client-sent `X-Forwarded-For` with the connecting IP, and pagelet's first-entry rule reads the visitor's real IP.
- **A DuckDB memory cap: new `DUCKDB_MEMORY_LIMIT`.** Unset, DuckDB sizes itself from the RAM it sees; on the dev box that was `9.1 GiB`. Measured on 2026-09-30, pagelet's RSS is 64 MB idle and 128 MB after 20k events plus 20 thirty-day stats queries. The container gets `mem_limit: 256m`, `mem_reservation: 128m` and `DUCKDB_MEMORY_LIMIT=128MB`. Verified on the dev box: `SET memory_limit = '128MB'` is global to the database, so every pool connection reads `122.0 MiB` back from `current_setting('memory_limit')`, and DuckDB itself rejects a malformed value ("Parser Error: Memory must have a number (e.g. 1GB)"). The value is interpolated into SQL, so pagelet also checks it against a strict pattern first.
- **`stop_grace_period: 10s`.** Unlike quickmeet's `lg`, pagelet handles SIGTERM: halt stops the server, flushes the buffer and closes the database. Keep Docker's 10 s explicitly, with the reason in a comment.
- **`ADMIN_PASSWORD` as an uncloud secret:** `secret://admin_password`, filled by `x-command: printenv ADMIN_PASSWORD` from the deploy step's environment, as linkboard does.
- **Workflows, as quickmeet and linkboard split them.** `test.yml` gains `workflow_call` and stops triggering on master pushes (`push: branches-ignore: [master]`), since `deploy.yml` calls it there. Pull requests and other branches run tests as today. A `concurrency` group keeps two master deploys from overlapping, without cancelling one mid-deploy.
- **Repository settings, added by the user** (the agent's token gets 403 on Actions variables and secrets): variables `SERVER_IP` (the `personal` server, the same value as linkboard's) and `APP_DOMAIN` = `pagelet.absky.dev`; secrets `SSH_PRIVATE_KEY` (a key authorized for `root@SERVER_IP`, as linkboard's) and `ADMIN_PASSWORD`. Also a DNS A record `pagelet.absky.dev` → `SERVER_IP`.

### Container environment

| Variable | Value | Why |
|---|---|---|
| `PORT` | `8080` | the app port Caddy proxies to |
| `DB_PATH` | `/app/data/pagelet.duckdb` | on the bind mount |
| `ADMIN_PASSWORD` | `secret://admin_password` | the dashboard password |
| `TRUST_PROXY` | `"true"` | client IP from Caddy's `X-Forwarded-For` |
| `DUCKDB_MEMORY_LIMIT` | `128MB` | keeps DuckDB inside `mem_limit` |

`FLUSH_INTERVAL_MS` keeps its 5000 default. `APP_DOMAIN` is used only by the Caddy block, never in the container.

### Error handling and verification

- The deploy job fails before `uc deploy` if the image smoke test fails (so a binary that cannot start never ships), and after it if `https://${APP_DOMAIN}/api/health` does not answer within about a minute. The retries cover Caddy getting the first certificate.
- `uc deploy` has no dry run. Before the first push, Task 3 loads `compose.yaml` offline through uncloud's own `compose.LoadProject` + `ServiceSpecFromCompose` + `Validate`, as quickmeet's KNOWLEDGE describes, and asserts the stop-first order, the bind mount and the environment.
- The first real deploy is verified by hand in Task 6: health, sign-in, a tracked page view counted, and a second deploy that keeps the data and reports `replace (stop-first)`.

### Non-goals

Backups (backlog entry), a separate staging/production, deploying from a laptop, Litestream, multiple replicas (DuckDB is single-process), and changing the image.

---

## File Structure

```
pagelet/
  .mise.toml                        + uc 0.20.0 and its tool_alias
  compose.yaml                      new: the pagelet service for uncloud
  .github/workflows/test.yml        + workflow_call; push ignores master
  .github/workflows/deploy.yml      new: test -> build -> smoke -> uc deploy -> health
  src/pagelet/db.lg                 ::conn applies :memory-limit
  src/pagelet/system.lg             DUCKDB_MEMORY_LIMIT -> ::db/conn
  test/pagelet/db_test.lg           memory-limit tests
  README.md                         Configuration row; Deployment section written
  docs/KNOWLEDGE.md                 uncloud and DuckDB-in-a-container facts
  docs/backlog/duckdb-backups.md    new: backups are not set up
  docs/backlog/letgo-http-reads-whole-request-body.md   note the Caddy mitigation
```

---

## Tasks

### Task 1: DuckDB memory limit

**Files:**
- Modify: `src/pagelet/db.lg`, `src/pagelet/system.lg`, `README.md` (Configuration table)
- Test: `test/pagelet/db_test.lg`

- [x] **Step 1: Write the failing tests**
  In `db_test.lg`, start `::db/conn` through `ig/init-key` on a temp file under `.tmp/`:
  - with `{:path p :memory-limit "128MB"}`, `(:m (db/execute-one! conn ["select current_setting('memory_limit') as m"]))` is `"122.0 MiB"`;
  - with `{:path p}` (no limit), init succeeds and the setting equals that of a plain `(duckdb/open "")` on the same host (DuckDB's default depends on the machine's RAM, so compare, don't hard-code);
  - `{:path p :memory-limit "128MB'; drop table sites; --"}` and `{:path p :memory-limit "lots"}` both throw from `ig/init-key`.

  Halt and delete the files after each case.
  Run: `mise exec -- lgx test test/pagelet/db_test.lg`. Expected: the new tests FAIL (no limit is applied, bad values pass).

- [x] **Step 2: Implement**
  `db.lg`'s `::conn` init takes `{:keys [path memory-limit]}`. After `duckdb/open`, before `migrate!`, when `memory-limit` is not blank:
  - check it against `#"\d+(\.\d+)?\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)"` with `re-matches`, throwing `ex-info` naming `DUCKDB_MEMORY_LIMIT` if it doesn't match;
  - run `(execute! conn [(str "SET memory_limit = '" memory-limit "'")])`. SET takes no `?` parameter.

  If an exception escapes, close the connection before rethrowing, so a failed init does not hold the file lock. Add a comment saying the setting is global across the pool.
  `system.lg`: `::db/conn {:path ... :memory-limit (env lookup "DUCKDB_MEMORY_LIMIT" nil)}`, and a line in the variable list at the top of the file.
  README Configuration table: a `DUCKDB_MEMORY_LIMIT` row, default "DuckDB's own (80% of RAM)", e.g. `128MB` in a container with a memory limit.

- [x] **Step 3: Run the tests**
  Run: `mise exec -- lgx test`. Expected: every suite PASS.

- [x] **Step 4: Commit**
  `git commit -am "DUCKDB_MEMORY_LIMIT caps DuckDB's memory"`

> Deviation: `main.lg` now catches a failed `system/start!`, prints the exception and each `ex-cause` as `pagelet: <message>`, and exits 1. integrant's wrapper ("Error on key :pagelet.db/conn when building system") was all let-go printed, hiding reasons like a bad `DUCKDB_MEMORY_LIMIT` or a locked database file, which is what `uc logs` would show on a failed deploy. Also tested: an empty `DUCKDB_MEMORY_LIMIT` keeps the default.

### Task 2: uc in mise and the compose file

**Files:**
- Modify: `.mise.toml`
- Create: `compose.yaml`

- [x] **Step 1: Pin uc**
  `.mise.toml`: `uc = "0.20.0"` under `[tools]`, `uc = "github:psviderski/uncloud"` under `[tool_alias]` (as linkboard's). Run: `mise install && mise exec -- uc --version`. Expected: a version line with 0.20.0.

- [x] **Step 2: Write `compose.yaml`**
  Model on linkboard's and quickmeet's, with a comment on each non-obvious key:
  - top-level `x-context: personal`;
  - service `pagelet`: `build:` with `platforms: [linux/amd64]`, `cache_from: [type=gha]`, `cache_to: [type=gha,mode=max]`;
  - the `x-caddy` block from the Design;
  - `volumes: [/root/pagelet-data:/app/data]`;
  - `mem_limit: 256m`, `mem_reservation: 128m`, `stop_grace_period: 10s`;
  - `deploy: {update_config: {order: stop-first}}`, with a comment on why (the DuckDB lock, and the bind mount not triggering uncloud's automatic stop-first);
  - the environment table from the Design;
  - top-level `secrets: admin_password: x-command: printenv ADMIN_PASSWORD`.

  No `scale`/`replicas` key: DuckDB is single-process.

- [x] **Step 3: Commit**
  `git add .mise.toml compose.yaml && git commit -m "compose.yaml for uncloud; pin uc"`

> Deviation: uc has no `--version` flag; `mise which uc` resolves to `installs/uc/0.20.0/uc` (and `uc version` prints a banner).

### Task 3: Validate the compose file offline

**Files:**
- Create: `.tmp/compose-check/` (scratch, not committed)
- Modify: `docs/KNOWLEDGE.md`

- [ ] **Step 1: Load it through uncloud's own code**
  In `/tmp/uncloud` (a clone of `v0.20.0`), write a scratch Go test or `main` that calls `compose.LoadProject` on pagelet's `compose.yaml` with `APP_DOMAIN=pagelet.absky.dev` and `ADMIN_PASSWORD=x` in the environment, then `ServiceSpecFromCompose` for `pagelet` and `spec.Validate()`. Read the real signatures in `pkg/client/compose/` first.
  It must print and assert:
  - `spec.UpdateConfig.Order == "stop-first"`;
  - one bind mount `/root/pagelet-data` → `/app/data`;
  - the five environment variables;
  - the Caddy config text containing `max_size 64KB` and `pagelet.absky.dev`;
  - the memory limit (256 MiB).

  Run it with Go 1.27 (`mise exec -- go run` or `go test` in the clone). Expected: all assertions pass, no validation error.

- [ ] **Step 2: Record**
  A KNOWLEDGE.md section "Deploying on uncloud" with the update-order rule (file:line refs from the Design), what the offline check printed, and how to rerun it. Delete the scratch code from `/tmp/uncloud`.

- [ ] **Step 3: Commit**
  `git commit -am "docs: uncloud update order and the offline compose check"`

### Task 4: Deploy workflow

**Files:**
- Modify: `.github/workflows/test.yml`
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Make `test.yml` callable**
  `on:` becomes `push: {branches-ignore: [master]}`, `pull_request:`, `workflow_call:`, with a comment that master pushes run it through `deploy.yml`. Nothing else changes.

- [ ] **Step 2: Write `deploy.yml`**
  Modelled on quickmeet's `deploy.yml` (minus `CGO_ENABLED` and the `file ... statically linked` check) and linkboard's `deploy.yaml`:
  - `on: push: branches: [master]`;
  - `concurrency: {group: deploy-personal, cancel-in-progress: false}`;
  - jobs `test` (`uses: ./.github/workflows/test.yml`) and `deploy` (`needs: [test]`, `runs-on: ubuntu-latest`, `permissions: contents: read`, `timeout-minutes: 20`).

  Deploy steps, in order:
  1. `actions/checkout@v4`;
  2. `webfactory/ssh-agent@v0.10.0` with `secrets.SSH_PRIVATE_KEY`;
  3. `jdx/mise-action@v3`;
  4. the same `actions/cache@v4` runtime cache as `test.yml` (same key);
  5. `lgx ui-install` then `lgx build`;
  6. `scripts/docker-smoke.sh`, run before buildx is set up so the default docker driver loads the image;
  7. `docker/setup-buildx-action@v4`;
  8. `crazy-max/ghaction-github-runtime@v4`;
  9. "Build and deploy", with env `APP_DOMAIN: ${{ vars.APP_DOMAIN }}` and `ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}`, running `uc --context personal --connect root@${{ vars.SERVER_IP }} deploy -f compose.yaml --yes pagelet`;
  10. "Check the deployed app": `curl -fsS --retry 30 --retry-all-errors --retry-delay 2 "https://${{ vars.APP_DOMAIN }}/api/health"`.

  One comment per step on why, in the repo's style.

- [ ] **Step 3: Lint**
  Run: `mise exec actionlint@1.7.12 -- actionlint`. Expected: no output.

- [ ] **Step 4: Commit**
  `git commit -m "Deploy to uncloud on every push to master"` (add `deploy.yml` first).

### Task 5: Docs and backlog

**Files:**
- Modify: `README.md`, `docs/backlog/letgo-http-reads-whole-request-body.md`
- Create: `docs/backlog/duckdb-backups.md`

- [ ] **Step 1: README Deployment section**
  Replace the "Next: compose.yaml ..." paragraph with what exists:
  - pushes to master deploy to `https://pagelet.absky.dev` on the `personal` cluster through `deploy.yml`;
  - the repository settings (variables `SERVER_IP`, `APP_DOMAIN`; secrets `SSH_PRIVATE_KEY`, `ADMIN_PASSWORD`) and the DNS record;
  - where the data lives (`/root/pagelet-data` on the server) and that updates are stop-first (seconds of downtime per deploy, events in the old container's buffer flushed on SIGTERM);
  - that only CI builds what ships (the glibc note);
  - how to read logs: `uc --context personal --connect root@<SERVER_IP> logs pagelet`.

- [ ] **Step 2: Backlog**
  - `docs/backlog/duckdb-backups.md`, starting `**Status: open**`: the DuckDB file on the server has no backup. Options to weigh:
    - a nightly `EXPORT DATABASE` or `COPY ... TO` Parquet from inside the app;
    - a stop-and-copy on the host;
    - object-storage upload.

    Say why linkboard's Litestream does not apply.
  - In `letgo-http-reads-whole-request-body.md`, add a line that deployments now cap bodies at 64 KB in Caddy (`compose.yaml`); the status stays open (the server itself still reads without a limit).

  Two commits, as AGENTS.md asks: docs first, then `Backlog: DuckDB backups; note the Caddy body limit`.

- [ ] **Step 3: Commit**
  `git commit -am "docs: deployment on uncloud"`, then the backlog commit.

### Task 6: First deploy and verification

**Needs from the user first** (stop and ask if any is missing): the DNS A record `pagelet.absky.dev` → the `personal` server's IP; repository variables `SERVER_IP` and `APP_DOMAIN`; secrets `SSH_PRIVATE_KEY` and `ADMIN_PASSWORD`. Check what the agent can: `dig +short pagelet.absky.dev` returns an address; the variables and secrets can only be confirmed by the user (`gh` gets 403).

- [ ] **Step 1: Open the PR**
  Push the branch, open a PR, link it (link_pull_request), and wait for `test` to pass on it. The deploy runs only after the merge.

- [ ] **Step 2: Merge and watch the deploy**
  After the user merges, `gh run watch` the `deploy` run on master. Expected:
  - every step green;
  - the uc plan output says `run` (first deploy);
  - "Check the deployed app" prints `{"ok":true}`.

  On failure, read the step log first; `uc logs` needs the user's machine or the CI key.

- [ ] **Step 3: Exercise it over HTTPS**
  Against `https://pagelet.absky.dev`, with the Playwright helpers from `.tmp/` (the desktop user-agent launch flag included):
  1. sign in with the admin password (the user provides it, or runs this step);
  2. add a throwaway site `verify-<time>.test`;
  3. serve a page for it with `page.route` that loads `https://pagelet.absky.dev/p.js`, and visit it;
  4. within ~10 s, the site's stats show 1 pageview;
  5. `/api/sites/:id/realtime` shows 1;
  6. delete the site.

  Also: `curl -s -o /dev/null -w '%{http_code}' -H 'content-type: text/plain' --data-binary @<(head -c 100000 /dev/zero | tr '\0' a) https://pagelet.absky.dev/api/event` returns 413 (Caddy's body limit).

- [ ] **Step 4: A second deploy keeps the data**
  With a site present, deploy a **new commit**: the Task 6 Step 5 docs commit, through a PR. Rerunning the same workflow is not enough: uncloud tags the image from the git commit, so an unchanged commit may leave the container as it is and never exercise the replacement.
  While it deploys, poll from outside, e.g. `while true; do date +%T; curl -s -o /dev/null -w '%{http_code}\n' https://pagelet.absky.dev/api/health; sleep 1; done`, started before the merge. The workflow's own health check runs only after the deploy and cannot see the gap. Expected:
  - the uc plan line says `replace (stop-first)`;
  - the site and its counts are still there afterwards;
  - `/api/health` answers again.

  Record the downtime the poll saw.

- [ ] **Step 5: Record and commit**
  Before Step 4: KNOWLEDGE.md, "Deploying on uncloud": the first-deploy facts (the plan lines, the 413, RSS if visible) with the date. `git commit -am "docs: first uncloud deploy verified"` through a PR, like every change to master. Merging it is Step 4's second deploy.
  After Step 4: add the downtime and the `replace (stop-first)` line to KNOWLEDGE.md, mark this plan completed with a short summary, and commit that through a PR too.
