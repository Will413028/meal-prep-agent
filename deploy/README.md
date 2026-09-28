# Deployment and rollback

Native Next.js standalone and Python run in separate containers within a dedicated ARM64-compatible Docker Compose project. Cloudflare Workers provides the public entry point, rate limits and fixed upstream proxies; the Oracle Web service owns identity, persistence APIs and a dedicated SQLite volume. The Web, API and named Tunnel share a project-only network and publish no host ports. Two Workers VPC services point only to `api:14318` and `web:14319`; it has no public Tunnel hostname. Deployment acceptance is tracked in `implementation-plan.md`.

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

## D1 → Oracle SQLite cutover

Keep the existing D1 database and old compatible Worker/Web/API artifacts throughout cutover. The source D1 table can contain active anonymous sessions; never infer that old rows are disposable. Use `scripts/session-db.py` on a private, ignored export and compare its row count, adopted count, revision range, schema versions and full-row SHA-256 digest on both hosts. Its JSON output contains no token hash or snapshot content. [Cloudflare D1 export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) blocks other database requests while it runs.

1. Build the new immutable Web image without replacing the running container. On Oracle create the host `deploy/data` directory as UID/GID 1000 with mode 0700; the Compose mount fails if the path is absent. Confirm the Web image and API image tags and record the currently running Worker version and image digests.
2. Deploy the new Worker bundle with `--env production --var MEAL_PERSISTENCE_PAUSED:1`. It returns 503 for all five persistence paths while pages and non-persistence API remain readable. Verify this at the public origin, then wait for any in-flight write to finish. Only then perform the final D1 export. Restrict the SQL export to `plan_sessions`, use `umask 077`, write under ignored `.artifacts`, and keep the output off Git and logs.
3. Query D1 aggregate counts before and after export. Run `python3 scripts/session-db.py import <export.sql> <candidate.sqlite3>` locally; it requires a new destination and deletes only a failed candidate. Audit it with `python3 scripts/session-db.py audit <candidate.sqlite3>`. Transfer the verified SQLite file first to a private staging path owned by the Oracle operator, then use `sudo install -o 1000 -g 1000 -m 0600` into `deploy/data/plan.sqlite3`; the operator UID differs from the container's node UID. Audit the Oracle file again with `sudo` and require identical full-row digest and counts. Preserve the SQL export and a second SQLite backup in private ignored storage.
4. Start the new Web image with `docker compose up -d --no-deps --wait web` using the recorded API and new Web tags. The storage health check must pass. Re-audit after startup: expired rows may have been purged, so compare the remaining active rows with the pre-start audit. Deploy the same Worker code without the pause variable, then run deployed browser identity/CAS, manual and guided flows, two-round Agent, live preview, restart persistence and Worker CPU acceptance. Keep D1 untouched until the new path and its backup are accepted.

## Backup and rollback

Use `python3 scripts/session-db.py backup <live.sqlite3> <new-backup.sqlite3>` while the Web process runs; SQLite's backup API copies a consistent WAL snapshot to an exclusive mode-0600 file and checks every row's digest. On Oracle, install `deploy/systemd/meal-prep-sqlite-backup.service` and `.timer` under `/etc/systemd/system/`, then run `systemctl daemon-reload` and `systemctl enable --now meal-prep-sqlite-backup.timer`. The timer runs daily at 03:17 UTC, catches up after downtime, and runs as root because the container's UID 1000 owns the volume; inspect it with `systemctl list-timers meal-prep-sqlite-backup.timer` and `journalctl -u meal-prep-sqlite-backup.service`. Retain at least one off-host copy. The host-only copy protects against a bad application release but not VM loss. A backup restore must happen while persistence is paused and the Web container is stopped; audit the restored file before restarting the Web container.

Record the Worker version ID, Web/API image digests/tags, contract version and SQLite audit for each accepted release. After cutover, an application rollback uses a previous Web/Worker version that understands the same SQLite schema; never point an old D1 Worker at stale data after Oracle has accepted writes. If a D1 rollback is unavoidable:

1. Pause persistence in the current Worker and wait for in-flight writes. Back up and audit Oracle SQLite, then export the old D1 `plan_sessions` to a separate private file. Retain both originals.
2. Run `python3 scripts/session-db.py reconcile-d1 <oracle-backup.sqlite3> <new-private-reconcile.sql>`. The generated file replaces every D1 `plan_sessions` row, including deletions, while leaving other D1 tables intact. It contains anonymous token hashes and snapshots; keep it mode 0600 and out of logs and Git. `wrangler d1 execute meal-prep-production --remote --env production --file <new-private-reconcile.sql> --yes` imports it while the public Worker remains paused. Cloudflare's import owns the transaction, so the SQL intentionally has no explicit `BEGIN` or `COMMIT`.
3. Re-export D1 to another private SQL file, import it to a new local SQLite candidate, and require `audit` to match the paused Oracle backup's full-row SHA-256 and aggregate counts. Only then deploy the old D1 Worker. If reconciliation cannot be verified, keep persistence paused and recover on the SQLite-compatible path from the Oracle backup; do not silently lose post-cutover changes.

Do not remove D1, revert its migration, delete the SQLite volume or prune other projects' resources. The archival `D1SessionStore` remains only for the rollback window and its parity tests; retire it after the D1 rollback path is formally closed and the Oracle backup/restore drill has passed.

A healthy container alone does not complete rollback acceptance. Verify Web hydration, existing saved-plan read, adopt/undo, fixture SSE, identity isolation and the same audited database state after restart.
