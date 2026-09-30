**Status: open**

# The dashboard login has no rate limit

`POST /api/login` compares a SHA-256 of the submitted password with the
admin password's, as often as a client likes. With one shared password and
no accounts, a weak `ADMIN_PASSWORD` can be guessed online.

Options: a per-IP attempt counter with backoff in memory (the IP is already
derived for ingest, `visitor/client-ip`), a slow hash (bcrypt, as quickmeet
uses) so each guess costs server time, or both. Until then, use a long
random `ADMIN_PASSWORD`. Noticed while writing auth (v1 plan, Task 6).
