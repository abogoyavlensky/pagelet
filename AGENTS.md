# Agent notes

Project knowledge lives in `docs/KNOWLEDGE.md` (the stack, verified facts,
gotchas). Implementation plans live in `docs/plans/`. The README introduces Pagelet and links to the user guides in `docs/`.
Commands live in `docs/development.md`, configuration in
`docs/getting-started.md`, and collected data in `docs/tracking.md`.

## Working here

- Run everything through mise (`mise exec -- lgx ...` outside an activated
  shell): lgx, Go and Node come from `.mise.toml`; gcc from the system.
- `lgx test` for the server, `lgx e2e` for the browser tests (it builds the
  dashboard and the binary first), `lgx ui-dev` beside `lgx run` for UI work.
- The request path must not bind dynamic vars and must not run SQL directly:
  `db.lg`, `stats.lg` and `auth.lg` own the queries, `ingest.lg` owns every
  write to `events` and `engagements`.
- The dashboard's types in `ui/src/api.ts` mirror the JSON from `stats.lg`
  and `routes.lg`; change both together.

## Backlog

`docs/backlog/` holds known issues and ideas that are not being worked on yet.

- One file per issue, named after it (`format-selection-column-offset.md`).
- Each file starts with `**Status: open**`. When a plan is written for it,
  change the status to `**Status: planned**` with a `Plan: docs/plans/...`
  line under it; when the work ships, change it to `**Status: done**` with a
  line saying where it landed. Never delete an entry.
- "What's in the backlog?" means the open files — list every file whose status
  is not done, with its title.
- Adding an entry is its own commit (`Backlog: <what>`), never mixed with code.
