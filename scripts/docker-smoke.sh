#!/usr/bin/env bash
# Build the image around bin/pagelet, start it, and check /api/health.
# `lgx docker` builds the binary first. The server can accept a connection
# and reset it while it starts, which curl does not count as retryable,
# hence --retry-all-errors. No --rm, so a container that crashed still has
# its logs to print.
set -u
docker build -t pagelet:local . || exit 1
docker rm -f pagelet-smoke > /dev/null 2>&1
docker run -d --name pagelet-smoke -p 8080:8080 \
  -e DB_PATH=/tmp/p.duckdb -e ADMIN_PASSWORD=x pagelet:local > /dev/null || exit 1
status=0
curl -fsS --retry 15 --retry-all-errors --retry-delay 1 localhost:8080/api/health || status=$?
echo
docker ps -a --filter name=pagelet-smoke
docker logs pagelet-smoke
docker rm -f pagelet-smoke > /dev/null
exit $status
