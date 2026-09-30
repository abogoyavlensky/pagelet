# The runtime image only: bin/pagelet is built outside it by `lgx build`.
# CI already builds the binary on a cached lg runtime; building inside
# Docker would rebuild the Go runtime (and DuckDB) in a layer on every
# dependency change. The cost: this image cannot be built from a bare
# clone without lgx, Go and gcc.
#
# The DuckDB driver is cgo, so the binary links glibc and libstdc++
# dynamically: a glibc base, not Alpine. Trixie, not bookworm: a binary
# built on ubuntu-latest needs glibc 2.39, and bookworm ships 2.36.
FROM debian:trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY bin/pagelet /app/pagelet

CMD ["/app/pagelet"]
