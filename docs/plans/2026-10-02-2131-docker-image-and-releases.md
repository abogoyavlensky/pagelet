# Docker Image on ghcr.io and GitHub Releases Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A version tag publishes an official multi-arch image to `ghcr.io/abogoyavlensky/pagelet` and Linux binaries to a GitHub release, and the README opens with a quickstart for self-hosting with either.

**Tech Stack:** GitHub Actions (`ubuntu-24.04` and `ubuntu-24.04-arm` runners), Docker and `docker buildx imagetools`, `gh release`, lgx 0.4.2 through mise. No server or dashboard change.

**Repo:** `~/Projects/pagelet`. Work on a branch `releases` off `master` and open a PR, as the earlier work did. Run every command through mise (`mise exec -- lgx ...`).

---

## Design

### The problem

pagelet can only be run by building it (lgx, Go, Node, gcc) or by the author's own uncloud deploy. There is no published image, no release, no tag, and the README starts with the build instructions. Someone who wants to self-host has nothing to pull.

### Approach

One new workflow, `.github/workflows/release.yml`, triggered by a pushed tag `vX.Y.Z`:

1. **test**: the existing `test.yml` (unit, dashboard, browser, image smoke test), through `workflow_call`, as `deploy.yml` does.
2. **build** (matrix: `amd64` on `ubuntu-24.04`, `arm64` on `ubuntu-24.04-arm`): each runner builds the dashboard and `bin/pagelet` natively (cgo cannot cross-compile), runs `lgx test`, smoke-tests the image around its binary with the existing `scripts/docker-smoke.sh`, packs `pagelet-linux-<arch>.tar.gz`, uploads it as a workflow artifact, and pushes the smoke-tested image as `ghcr.io/abogoyavlensky/pagelet:<version>-<arch>`.
3. **publish**: joins the two arch images into one multi-arch manifest tagged `<version>`, `<major>.<minor>` and `latest`, then creates the GitHub release with both tarballs, `checksums.txt` and generated notes.

The same workflow also runs on `workflow_dispatch` as a **dry run**: test and build run on both architectures, nothing is pushed and no release is made. That is how the workflow is checked before the first tag, and how the arm64 build (never built so far) is proven.

`deploy.yml` and `compose.yaml` are untouched: master still deploys to uncloud from a build on the runner. The published image and the deployed one come from the same `Dockerfile`.

### Decisions

- **Releases are tags, not master pushes.** `on.push.tags: ['v[0-9]+.[0-9]+.[0-9]+']`. No `edge` image per master push: nobody asked for it, and `latest` should mean a release. No pre-release tags (`-rc1`) either; the pattern does not match them.
- **Linux amd64 and arm64 only.** No macOS binary: the server's graceful shutdown is Linux-only (`signal-notify`), macOS is not a hosting target, and a macOS user has Docker. Not in the backlog; add it when someone asks.
- **Native per-arch jobs, joined by `imagetools create`**, rather than one QEMU build. The Dockerfile stays `COPY bin/pagelet` (the deploy and the smoke script depend on it), each arch image is started and health-checked on its own hardware before it is pushed, and there is no emulation. The cost: the arch-suffixed tags (`0.1.0-amd64`) stay visible in the registry.
- **Release binaries are the CI binaries**, built on ubuntu-24.04, so they need **glibc 2.39 or newer** and `libstdc++6` (Ubuntu 24.04+, Debian 13+, Fedora 40+). Building on an older base for a lower floor is real work with an unknown (whether the prebuilt static libduckdb links against an older libstdc++), so it goes to the backlog and the README says: older system, use Docker.
- **Asset names carry no version** (`pagelet-linux-amd64.tar.gz`, `pagelet-linux-arm64.tar.gz`, `checksums.txt`), so the README can use the stable `releases/latest/download/...` URL. Each tarball holds one file, `pagelet`.
- **The image gets a data directory and a default `DB_PATH`.** Today the image's default `DB_PATH` is `pagelet.duckdb` in `/app`, so a quickstart would need both `-v` and `-e DB_PATH`. The Dockerfile gains `ENV DB_PATH=/app/data/pagelet.duckdb`, `RUN mkdir -p /app/data`, `EXPOSE 8080` and a `LABEL org.opencontainers.image.source` (which links the ghcr package to the repository). `/app/data` is the path `compose.yaml` already mounts, and compose sets `DB_PATH` to the same value, so the deploy does not change. No `VOLUME` instruction: it would leave an anonymous volume behind every smoke test and adds nothing to an explicit `-v`. The image keeps running as root: the deploy's bind mount (`/root/pagelet-data`) is root-owned, and a non-root user would break it.
- **Version = the tag without `v`.** The binary has no `--version` and gets none here.
- **Runtime cache key carries the architecture on arm64.** `test.yml`'s key is `runtimes-${{ runner.os }}-<hash>`, and `runner.os` is `Linux` on both architectures; `~/.lgx/runtimes` restored from the other architecture would be a wrong-arch `lg`. The amd64 job uses the same key as `test.yml` (a cache hit from master's runs); the arm64 job uses a `runtimes-arm64-Linux-` prefix. The prefix must not begin with `runtimes-Linux-`: that is the restore-key fallback of `test.yml`, `deploy.yml` and the amd64 job, and it would match an arm64 cache after an `lgx.edn` change.
- **Package visibility is a one-time manual step.** A user-owned ghcr package may be created private even from a public repository. After the first release, anonymous `docker pull` is checked; if it is denied, the owner sets the package to public at `https://github.com/users/abogoyavlensky/packages/container/pagelet/settings`. The workflow cannot do this with `GITHUB_TOKEN`.
- **MIT license.** The repository has no license, and an official image needs one. `LICENSE` at the root: the standard MIT text, `Copyright (c) 2026 Andrey Bogoyavlenskiy`. The image carries `org.opencontainers.image.licenses="MIT"`, and the README ends with a `## License` section of one line linking to the file.
- **Cutting the first release is the user's call.** Pushing `v0.1.0` publishes an image and a release. The executor asks before pushing the tag.

### `release.yml` in detail

```yaml
name: release

on:
  push:
    tags: ['v[0-9]+.[0-9]+.[0-9]+']
  # A dry run: tests and both builds, nothing pushed, no release.
  workflow_dispatch:

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

env:
  IMAGE: ghcr.io/abogoyavlensky/pagelet
```

Top-level `permissions: contents: read`. Job-level permissions replace the top-level map rather than add to it, so `build` states both `contents: read` and `packages: write`, and `publish` states `contents: write` and `packages: write`. The `test` job passes nothing extra.

Every publishing step is guarded by `if: github.event_name == 'push' && github.ref_type == 'tag'` (written `PUBLISH` below); the `publish` job carries the same guard on the job. The event check matters: a manual dispatch can target a tag, and a dry run must never publish.

**`test`**: `uses: ./.github/workflows/test.yml`.

**`build`**: `needs: [test]`, `timeout-minutes: 30`, `strategy.fail-fast: true`, matrix:

| `arch` | `runner` | `cache` |
|---|---|---|
| `amd64` | `ubuntu-24.04` | `runtimes-Linux` |
| `arm64` | `ubuntu-24.04-arm` | `runtimes-arm64-Linux` |

Steps, in order:

1. `actions/checkout@v4`
2. `jdx/mise-action@v3`
3. `actions/cache@v4` on `~/.cache/go-build`, `~/go/pkg/mod`, `~/.lgx/runtimes`; key `${{ matrix.cache }}-${{ hashFiles('lgx.edn') }}`, restore-keys `${{ matrix.cache }}-`
4. `lgx test` (on amd64 it repeats the `test` job's unit tests in seconds; on arm64 it is the only run of them)
5. `lgx ui-install`, then `lgx build`
6. `scripts/docker-smoke.sh` (builds `pagelet:local` around `bin/pagelet`, starts it, checks `/api/health`)
7. `tar -czf pagelet-linux-${{ matrix.arch }}.tar.gz -C bin pagelet`
8. `actions/upload-artifact@v4`, name `pagelet-linux-${{ matrix.arch }}`, the tarball, `if-no-files-found: error`, `retention-days: 7`
9. PUBLISH: log in with `echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin`
10. PUBLISH: `docker tag pagelet:local "$IMAGE:${GITHUB_REF_NAME#v}-${{ matrix.arch }}"` and `docker push` it. This is the image step 6 started, not a rebuild.

Comment the job the way `test.yml` and `deploy.yml` are commented: why the runners are pinned (glibc), why the cache key differs on arm64, why the pushed image is the smoke-tested one.

**`publish`**: `needs: [build]`, the PUBLISH guard as its `if`, `runs-on: ubuntu-24.04`, `timeout-minutes: 10`:

1. `actions/checkout@v4` (`gh release` needs the repository; `--generate-notes` needs nothing more)
2. `actions/download-artifact@v4` with `pattern: pagelet-linux-*`, `merge-multiple: true`, into `dist/`
3. `cd dist && sha256sum pagelet-linux-*.tar.gz > checksums.txt`
4. `docker login ghcr.io` as above
5. The manifest, with `VERSION=${GITHUB_REF_NAME#v}` and `MINOR=${VERSION%.*}`:
   ```
   docker buildx imagetools create \
     -t "$IMAGE:$VERSION" -t "$IMAGE:$MINOR" -t "$IMAGE:latest" \
     "$IMAGE:$VERSION-amd64" "$IMAGE:$VERSION-arm64"
   docker buildx imagetools inspect "$IMAGE:$VERSION"
   ```
   The runner's Docker has buildx; no `setup-buildx-action` is needed for `imagetools`.
6. The release, last, so a release never exists without its image:
   ```
   gh release create "$GITHUB_REF_NAME" dist/* --title "$GITHUB_REF_NAME" --generate-notes --verify-tag
   ```
   with `GH_TOKEN: ${{ github.token }}`.

A failed run is repaired by fixing the cause and re-running the failed run (`gh run rerun <id>`, which keeps the `push` event; a manual dispatch on the tag would be a dry run): pushing an image tag again overwrites it, and `gh release create` only runs once everything before it passed. If the release step itself half-succeeded, delete the release in the UI and re-run.

### The Dockerfile

After the `apt-get` layer:

```dockerfile
LABEL org.opencontainers.image.source="https://github.com/abogoyavlensky/pagelet" \
      org.opencontainers.image.description="Self-hosted, cookie-less web analytics from a single binary" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
# The database lives in /app/data; mount a volume there to keep it.
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/pagelet.duckdb
COPY bin/pagelet /app/pagelet

EXPOSE 8080
CMD ["/app/pagelet"]
```

`scripts/docker-smoke.sh` keeps passing `-e DB_PATH=/tmp/p.duckdb`, which still overrides the default. Extend the header comment at the top of the Dockerfile with one sentence: the image is also published by `release.yml`.

### The README

The README currently opens with the description, then `## Run` (the build). New order:

1. description (unchanged)
2. **`## Quickstart`** (new)
3. `## Run from source` (the present `## Run`, retitled; text unchanged)
4. everything else as it is, with `## Docker` and `## Deployment` touched up, and a new **`## Releases`** after `## Docker`.

`## Quickstart` content (write it in the README's voice: short declarative sentences, no marketing):

- One sentence: pagelet is one process and one DuckDB file; run the image or the binary, put it behind HTTPS, add a site.
- **Docker**:
  ```
  docker run -d --name pagelet --restart unless-stopped \
    -p 8080:8080 \
    -v pagelet-data:/app/data \
    -e ADMIN_PASSWORD=change-me \
    ghcr.io/abogoyavlensky/pagelet:latest
  ```
  The image is for `linux/amd64` and `linux/arm64`; tags are `latest`, `X.Y` and `X.Y.Z`. The database is `/app/data/pagelet.duckdb` in the `pagelet-data` volume. To update: `docker pull`, then remove and re-create the container with the same command (one process at a time may open the database, so stop the old container first).
- **Binary** (Linux x86-64 or arm64, glibc 2.39 or newer with `libstdc++6`: Ubuntu 24.04, Debian 13, Fedora 40 or later; on an older system use the image):
  ```
  curl -fsSL https://github.com/abogoyavlensky/pagelet/releases/latest/download/pagelet-linux-amd64.tar.gz | tar -xz
  ADMIN_PASSWORD=change-me DB_PATH=/var/lib/pagelet/pagelet.duckdb ./pagelet
  ```
  `pagelet-linux-arm64.tar.gz` for arm64; `checksums.txt` beside them holds the SHA-256 sums. The directory in `DB_PATH` must exist (verify this in Task 4 against the binary; if the server creates it, drop the sentence). No systemd unit in the README: YAGNI.
- **Then**: open `http://localhost:8080`, sign in with `ADMIN_PASSWORD`, add a site by its domain, put the snippet on it (link to "Tracking a site").
- **In production**: put it behind a reverse proxy that terminates TLS, since the tracker must be loaded over HTTPS from HTTPS sites; set `TRUST_PROXY=true` only when the proxy replaces a client-sent `X-Forwarded-For`; limit request bodies at the proxy (64 KB is plenty); in a container with a memory limit set `DUCKDB_MEMORY_LIMIT`. Link to "Configuration". Two or three sentences plus a pointer, not a proxy tutorial.

`## Docker`: add that the image has `DB_PATH=/app/data/pagelet.duckdb` by default and that the same Dockerfile produces the published image.

`## Releases` (new, short): pushing a tag `vX.Y.Z` runs `release.yml`: the tests, a native build per architecture, the image smoke test, then the multi-arch image on ghcr.io (`X.Y.Z`, `X.Y`, `latest`) and a GitHub release with the two tarballs and `checksums.txt`. Running the workflow by hand (`workflow_dispatch`) is a dry run. `git tag v0.2.0 && git push origin v0.2.0` as the example. Releases and the master deploy are independent.

`## Configuration` table: the `DB_PATH` row's default stays `pagelet.duckdb`; add "(`/app/data/pagelet.duckdb` in the image)".

### Testing

There is no unit-testable code here. The checks are:

- locally: `lgx test` still passes (nothing it covers changed); the workflow file parses (`mise exec -- npx --yes yaml-lint` is not in the project, so use `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))"`; if `actionlint` is on the PATH, run it too);
- the image change cannot be run on the dev box (no Docker socket access, and a locally built binary needs glibc 2.43; see `docs/KNOWLEDGE.md`), so CI on the PR is its test: `test.yml`'s "Smoke-test the image" step;
- the release workflow: a `workflow_dispatch` dry run on the PR branch (`gh workflow run release.yml --ref releases` works only once the workflow file exists on the default branch; before the merge, GitHub does not list it. So the dry run happens right **after** the merge, on master, before any tag);
- the first real release (`v0.1.0`), followed by the README's own commands run verbatim against it.

## File Structure

| File | Change |
|---|---|
| `.github/workflows/release.yml` | Create: test, build (amd64, arm64), publish |
| `Dockerfile` | Modify: label, `/app/data`, default `DB_PATH`, `EXPOSE` |
| `LICENSE` | Create: MIT, Copyright (c) 2026 Andrey Bogoyavlenskiy |
| `README.md` | Modify: Quickstart, "Run from source", Docker, Releases, Configuration, License |
| `docs/backlog/release-binaries-need-glibc-2-39.md` | Create: the glibc floor of the release binaries |
| `docs/KNOWLEDGE.md` | Modify: a "Releases" section with what the first release verified |

---

### Task 1: Backlog entry for the glibc floor

**Files:**
- Create: `docs/backlog/release-binaries-need-glibc-2-39.md`

- [x] **Step 1: Branch**
  `git switch -c releases`

- [x] **Step 2: Write the entry**
  Follow the existing entries' shape (read `docs/backlog/duckdb-backups.md` first). Starts with `**Status: open**`. Content: release binaries are built on ubuntu-24.04 and need glibc 2.39+, which leaves out Debian 12 (2.36), Ubuntu 22.04 (2.35) and RHEL 9 (2.34); those users must use the image. Possible fix: build the release binaries in an older container (for example `debian:11`, glibc 2.31) and check with `objdump -T bin/pagelet | grep GLIBC_` what the floor becomes; unknown: whether the prebuilt static libduckdb links against that base's libstdc++. The image would then also be free to move to an older base.

- [x] **Step 3: Commit (its own commit, per AGENTS.md)**
  `git add docs/backlog && git commit -m "Backlog: release binaries need glibc 2.39"`

> Deviation: Step 1 (the branch) was done before the plan commit, so the plan itself lives on `releases`.

### Task 1b: The license

**Files:**
- Create: `LICENSE`

- [x] **Step 1: Write `LICENSE`**: the standard MIT License text, unmodified, with the line `Copyright (c) 2026 Andrey Bogoyavlenskiy`.

- [x] **Step 2: Commit**
  `git add LICENSE && git commit -m "MIT license"`

### Task 2: The image: data directory, default DB_PATH, label

**Files:**
- Modify: `Dockerfile`

- [x] **Step 1: Edit the Dockerfile** as in "The Dockerfile" above. Keep the existing header comment and add the sentence about `release.yml`.

- [x] **Step 2: Check what can be checked locally**
  Run: `grep -n "DB_PATH\|/app/data" Dockerfile compose.yaml scripts/docker-smoke.sh`
  Expected: the Dockerfile's default equals compose's `DB_PATH` (`/app/data/pagelet.duckdb`); the smoke script still overrides it with `/tmp/p.duckdb`. Docker itself cannot run on the dev box; CI's smoke test covers the image in Task 5.

- [x] **Step 3: Commit**
  `git commit -am "Image: a data directory and a default DB_PATH"`

### Task 3: The release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [x] **Step 1: Write the workflow** as in "`release.yml` in detail". Match the comment style of `test.yml` and `deploy.yml`.

- [x] **Step 2: Check it parses**
  Run: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/release.yml')); print(list(d['jobs']))"`
  Expected: `['test', 'build', 'publish']`
  If `actionlint` is installed (`command -v actionlint`), run `actionlint .github/workflows/release.yml`; expected: no output.

- [x] **Step 3: Read it once against these traps**
  - every push/login/publish step or job has the full guard, `github.event_name == 'push' && github.ref_type == 'tag'`;
  - the arm64 cache prefix is `runtimes-arm64-Linux`, which `runtimes-Linux-` does not match;
  - `publish` has `contents: write` and `packages: write`, `build` has `contents: read` and `packages: write`;
  - `${GITHUB_REF_NAME#v}` is used inside `run:` (shell), never inside `${{ }}`.

- [x] **Step 4: Commit**
  `git add .github/workflows/release.yml && git commit -m "Release workflow: image on ghcr.io, binaries on a GitHub release"`

> Deviation: `actionlint` is a mise shim with no version set; ran it as `mise exec actionlint@1.7.12 -- actionlint` (clean on all three workflows). Codex (round 1, Tasks 2-3 together) flagged a concurrency clash with `test.yml`. Its premise was wrong (a `branches-ignore`-only filter does not fire on tag pushes), but a dry run on master did share `test-refs/heads/master` with a deploy's tests. Fixed by making `test.yml`'s group `test-${{ github.workflow }}-${{ github.ref }}` (commit "Tests: a concurrency group per calling workflow").

### Task 4: README

**Files:**
- Modify: `README.md`

- [x] **Step 1: Find out whether the server creates `DB_PATH`'s directory**
  Run: `mise exec -- lgx lgx:build && mkdir -p .tmp && PORT=8097 DB_PATH=.tmp/nodir-$$/p.duckdb ADMIN_PASSWORD=x timeout 5 ./bin/pagelet; echo "exit $?"`
  Expected: either it serves until the timeout (exit 124: the directory is created, drop the "must exist" sentence and the `mkdir`) or it fails at startup (keep the sentence and put `mkdir -p /var/lib/pagelet` in the quickstart's command block). Remove `.tmp/nodir-*` afterwards.

- [x] **Step 2: Write the sections** as in "The README" above: `## Quickstart`, retitle `## Run` to `## Run from source`, touch up `## Docker` and `## Configuration`, add `## Releases`, and end the file with `## License` ("MIT, see [LICENSE](LICENSE)."). Use /writing-clearly.

- [x] **Step 3: Check the links and names**
  Run: `grep -n "ghcr.io\|releases/latest\|pagelet-linux" README.md .github/workflows/release.yml`
  Expected: the image name and the asset names in the README are exactly those the workflow produces (`ghcr.io/abogoyavlensky/pagelet`, `pagelet-linux-amd64.tar.gz`, `pagelet-linux-arm64.tar.gz`, `checksums.txt`).

- [x] **Step 4: Commit**
  `git commit -am "README: quickstart for self-hosting with Docker or the binary"`

> Deviation: the server does not create `DB_PATH`'s directory ("IO Error: Cannot open file ... No such file or directory"). The binary quickstart uses the default `pagelet.duckdb` in the current directory instead of `/var/lib/pagelet/...`, which needs no `mkdir` or root. The Configuration table says the directory must exist. The Docker update steps use `docker stop` (SIGTERM, flushes the buffer), not `docker rm -f`.
### Task 5: PR, merge, dry run

- [x] **Step 1: Unit tests still pass**
  Run: `mise exec -- lgx test`
  Expected: PASS

- [ ] **Step 2: Push and open the PR**
  `git push -u origin releases`, then `gh pr create` with a title like `Releases: image on ghcr.io, binaries, quickstart`. Link the PR to the thread (`link_pull_request`) if the tool is available.

- [ ] **Step 3: Wait for CI on the PR**
  Run: `gh pr checks --watch`
  Expected: `test` passes, including "Smoke-test the image" with the changed Dockerfile.

- [ ] **Step 4: Merge when the user approves the PR**, as earlier PRs were merged (squash). The master deploy runs; check it stays green (`gh run watch` on the deploy run): the deployed container now gets `DB_PATH` from both the image and compose, same value.

- [ ] **Step 5: Dry run on master**
  Run: `gh workflow run release.yml --ref master`, then `gh run watch` on it.
  Expected: `test` and both `build` jobs pass; the push steps and `publish` are skipped. This is the first arm64 build of pagelet: if the arm64 job fails (the runtime build, `lgx test`, or the smoke test), fix it in a follow-up PR before tagging. Note the arm64 job's cold build time for KNOWLEDGE.md.

### Task 6: The first release

- [ ] **Step 1: Ask the user** whether to cut `v0.1.0` now (it publishes an image and a release). Stop here if not; Tasks 6 and 7 wait.

- [ ] **Step 2: Tag and push**
  `git switch master && git pull && git tag v0.1.0 && git push origin v0.1.0`

- [ ] **Step 3: Watch the release run**
  Run: `gh run watch` on the `release` run.
  Expected: all three jobs pass; `imagetools inspect` in the log lists `linux/amd64` and `linux/arm64`.

- [ ] **Step 4: Verify what was published, as a stranger would**
  - `gh release view v0.1.0 --json assets -q '.assets[].name'` → `checksums.txt`, `pagelet-linux-amd64.tar.gz`, `pagelet-linux-arm64.tar.gz`
  - in a scratch directory under `.tmp/`: the README's `curl ... | tar -xz` line, then `sha256sum pagelet-linux-amd64.tar.gz` of a separate download against `checksums.txt`. The dev box has glibc 2.43, so the binary must start: `PORT=8097 DB_PATH=<scratch>/p.duckdb ADMIN_PASSWORD=x ./pagelet &`, `curl -fsS localhost:8097/api/health`, then kill it.
  - anonymous pull, without Docker: `curl -fsS "https://ghcr.io/token?scope=repository:abogoyavlensky/pagelet:pull"` returns a token, and with it `curl -fsS -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.oci.image.index.v1+json" https://ghcr.io/v2/abogoyavlensky/pagelet/manifests/latest` returns an index with both platforms. If it answers 401/403/404, the package is private: ask the user to set it to public at `https://github.com/users/abogoyavlensky/packages/container/pagelet/settings`, then check again.

### Task 7: Record what was learned

**Files:**
- Modify: `docs/KNOWLEDGE.md`
- Modify: `docs/plans/2026-10-02-2131-docker-image-and-releases.md`

- [ ] **Step 1: Add a "Releases (2026-10-…)" section to `docs/KNOWLEDGE.md`** with only what was verified: the arm64 build works on `ubuntu-24.04-arm` (and its cold build time), the cache key must carry the architecture, whether the ghcr package came out public or needed the manual switch, how a release is cut and dry-run, the image tags.

- [ ] **Step 2: Mark this plan completed** the way earlier plans are (a `**Status: completed <date>.**` line under the title and a short summary at the end), ticking the checkboxes.

- [ ] **Step 3: Commit and PR**
  On a branch `releases-notes`: `git commit -am "Releases: what the first release verified"`, push, open a PR.
