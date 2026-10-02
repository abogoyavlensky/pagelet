**Status: open**

# The release binaries need glibc 2.39

The release workflow builds `pagelet-linux-amd64` and `-arm64` on
ubuntu-24.04 runners, and the binary links glibc dynamically (the DuckDB
driver is cgo), so it needs glibc 2.39 or newer and `libstdc++6`. That
leaves out Debian 12 (2.36), Ubuntu 22.04 (2.35) and RHEL 9 (2.34); there
the image is the only way to run pagelet.

A possible fix: build the release binaries inside an older container (for
example `debian:11`, glibc 2.31) and check the new floor with
`objdump -T bin/pagelet | grep GLIBC_`. Unknown: whether the prebuilt
static libduckdb links against that base's libstdc++. A lower floor would
also let the image move to an older base. Noted while planning releases
(docs/plans/2026-10-02-2131-docker-image-and-releases.md).
