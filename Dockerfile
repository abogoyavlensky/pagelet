# The runtime image only: bin/pagelet is built outside it by `lgx build`.
# CI already builds the binary on a cached lg runtime; building inside
# Docker would rebuild the Go runtime (and DuckDB) in a layer on every
# dependency change. The cost: this image cannot be built from a bare
# clone without lgx, Go and gcc.
#
# The DuckDB driver is cgo, so the binary links glibc and libstdc++
# dynamically: a glibc base, not Alpine. Trixie, not bookworm: a binary
# built on ubuntu-24.04 (the CI runner) needs glibc 2.39, and bookworm ships 2.36.
#
# The same file makes the published image: .github/workflows/release.yml
# builds it around each architecture's CI binary and pushes it to ghcr.io.
FROM debian:trixie-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

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
