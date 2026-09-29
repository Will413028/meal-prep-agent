# Deployment and rollback

Native Next.js standalone and Python run in separate containers within a dedicated ARM64-compatible Docker Compose project. Cloudflare Workers provides the public entry point, rate limits and fixed upstream proxies; the Oracle Web service owns identity, persistence APIs and a dedicated SQLite volume. The Web, API and named Tunnel share a project-only network and publish no host ports. Two Workers VPC services point only to `api:14318` and `web:14319`; it has no public Tunnel hostname. Deployment acceptance is tracked in `../docs/verification.md`.

## Configuration

Keep `deploy/secrets/api.env` and `deploy/secrets/tunnel-token` outside Git. The API file contains only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Restrict the directory to its operator, the environment file to mode 0600, and the Tunnel token to its container UID 65532 with mode 0400. Never print resolved Compose configuration or container environment. The Docker build context allowlists source and lockfiles, excluding these secrets.

Use immutable `MEAL_RELEASE` and `MEAL_WEB_RELEASE` tags for API and Web images. The Web runs as the image’s node user with a read-only root, 512 MiB and 1 CPU; its only writable path is the dedicated SQLite bind mount, and it has no model credentials. Create `deploy/data` on the Oracle host with owner UID/GID 1000 and mode 0700 before starting the new Web image. The API runs as UID 10001 with a read-only root, 512 MiB and 0.5 CPU; the connector has 128 MiB and 0.25 CPU. Application access logging is disabled and container logs are rotated. Keep one API process/container because the provider cooldown is process-local. Model calls remain subject to the fixed free model and explicit fixture/live selection.

From the repository root:

```sh
MEAL_RELEASE=<api-release> MEAL_WEB_RELEASE=<web-release> docker compose -f deploy/compose.yaml config --quiet
MEAL_RELEASE=<api-release> MEAL_WEB_RELEASE=<web-release> docker compose -f deploy/compose.yaml build api web
MEAL_RELEASE=<api-release> MEAL_WEB_RELEASE=<web-release> docker compose -f deploy/compose.yaml up -d --wait api web tunnel
MEAL_RELEASE=<api-release> MEAL_WEB_RELEASE=<web-release> docker compose -f deploy/compose.yaml exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:14318/health').status)"
```

The Web opens only an existing version-1 SQLite file, verifies table layout and integrity, and clears expired rows at startup. A missing or empty file fails health instead of creating a fresh identity store. Its frequent health check checks the same file and performs a small database read; it returns 503 if the volume is unavailable. `DatabaseSync` waits at most 250 ms for a competing write lock so a locked database cannot stall Web and SSE for five seconds; a concurrent write may return 503 and needs a caller retry. Sustained lock contention or slow requests are a trigger to move SQLite calls to a worker thread or a separate process. Health does not prove VPC connectivity, model access, stream cancellation, identity isolation or CAS; verify those separately. Do not reuse another application's network, credentials, service IDs or writable volumes.

## Cloudflare

The `production` Wrangler environment has two VPC bindings and rate-limit namespaces, with no D1 binding or scheduled SQL cleanup. The top-level environment remains local. Use the explicit source configuration and production environment; no vinext build or generated Wrangler redirect is used:

```sh
pnpm --filter @meal-prep/web build:worker
pnpm --filter @meal-prep/web deploy:worker
```

`enable_request_signal` is explicit so incoming cancellation is observable. End-to-end release of the Python provider must still pass the deployment drill; this flag alone is not proof. The Python response adds a two-second SSE comment heartbeat after official AG-UI encoding, with a single producer task and bounded queue. This allows the private streaming path to observe disconnection even while the provider is silent; cancellation and slow-consumer cleanup have separate regression tests.

Production Worker has no `MEAL_API_ORIGIN` or `MEAL_WEB_ORIGIN`; requests use private `MEAL_API` and `MEAL_WEB` bindings. The page proxy accepts GET/HEAD only; the separate persistence proxy accepts only five fixed session/plan/agent paths, forwards one validated session Cookie and required Origin/CSRF headers, and preserves `Set-Cookie`. Unknown API paths fail closed. Caller URLs, query strings, cookies and authorization headers never select a Python upstream; Python receives no Cookie. Oracle Web compares writes against its fixed `MEAL_PUBLIC_ORIGIN`. Local tests use explicit loopback origins. VPC is beta and currently free across Workers plans; it is not a permanent pricing guarantee.

## SQLite operations and rollback

Oracle SQLite is the only live persistence authority. `python3 scripts/session-db.py audit deploy/data/plan.sqlite3` checks the existing file without printing session content. The D1-to-SQLite cutover and its historical backups are recorded in `../docs/verification.md`; the D1 rollback window is closed. The old D1 database and private cutover artifacts have not been deleted, but they are not a release rollback path.

At Will's 2026-09-29 direction, no local or off-host backup job is scheduled. The former `meal-prep-sqlite-backup.timer` was disabled and removed from Oracle. Existing backup files were left untouched. Do not re-enable a backup job or claim an RPO/RTO without a new decision and a restore drill.

Record the Worker version ID, Web/API image digests/tags, contract version and SQLite audit for each accepted release. An application rollback may use a previous Web/Worker version only when it understands the current SQLite schema. Before switching versions, verify the target artifact's schema compatibility; if it cannot read the current file, keep the current version rather than initializing or overwriting the database. After a compatible rollback, verify Web hydration, saved-plan read, adopt/undo, fixture SSE and identity isolation through the public origin. Never publish an old D1 Worker against the stale D1 snapshot.
