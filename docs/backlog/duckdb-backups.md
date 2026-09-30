**Status: open**

# The DuckDB file is not backed up

Production data lives in `/root/pagelet-data/pagelet.duckdb` on the
`personal` server (a bind mount, `compose.yaml`). Nothing copies it
anywhere: losing the server or the file loses every site's history.

linkboard's answer, Litestream, does not transfer: it tails SQLite's WAL,
and DuckDB's WAL is its own format. Options to weigh:

- a nightly export from inside the app (`EXPORT DATABASE` or `COPY ... TO`
  Parquet) to the bind mount, then off the host;
- stop the container, copy the file, start it, on the host from a systemd
  timer (a few seconds of downtime per copy);
- upload either of the above to object storage (R2, as linkboard uses).

Whatever the choice, write down the restore procedure and try it once.
Noted while planning the uncloud deployment
(docs/plans/2026-09-30-2048-deploy-on-uncloud.md).
