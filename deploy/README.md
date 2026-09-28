# Deployment and rollback

Native Next.js standalone and Python run in separate containers within a dedicated ARM64-compatible Docker Compose project. Cloudflare Workers provides the public entry point, identity and persistence APIs, and fixed upstream proxies. D1 is the only meal persistence store. The Web, API and named Tunnel share a project-only network and publish no host ports. Two Workers VPC services point only to `api:14318` and `web:14319`; it has no public Tunnel hostname. Deployment acceptance is tracked in `implementation-plan.md`.

## Configuration

Keep `deploy/secrets/api.env` and `deploy/secrets/tunnel-token` outside Git. The API file contains only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Restrict the directory to its operator, the environment file to mode 0600, and the Tunnel token to its container UID 65532 with mode 0400. Never print resolved Compose configuration or container environment. The Docker build context allowlists source and lockfiles, excluding these secrets.

Use immutable `MEAL_RELEASE` and `MEAL_WEB_RELEASE` tags for API and Web images. The Web runs as the image’s node user with a read-only root, 512 MiB and 1 CPU; it has no model credentials. The API runs as UID 10001 with a read-only root, 512 MiB and 0.5 CPU; the connector has 128 MiB and 0.25 CPU. Application access logging is disabled and container logs are rotated. Keep one API process/container because the provider cooldown is process-local. Model calls remain subject to the fixed free model and explicit fixture/live selection.

From the repository root:

```sh
MEAL_RELEASE=<api-release> MEAL_WEB_RELEASE=<web-release> docker compose -f deploy/compose.yaml config --quiet
MEAL_RELEASE=<api-release> MEAL_WEB_RELEASE=<web-release> docker compose -f deploy/compose.yaml build api web
MEAL_RELEASE=<api-release> MEAL_WEB_RELEASE=<web-release> docker compose -f deploy/compose.yaml up -d --wait api web tunnel
MEAL_RELEASE=<api-release> MEAL_WEB_RELEASE=<web-release> docker compose -f deploy/compose.yaml exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:14318/health').status)"
```

Liveness does not prove VPC connectivity, model access, stream cancellation, D1 identity or CAS. Verify each separately. Do not reuse another application's network, credentials, service IDs or writable volumes.

## Cloudflare

The `production` Wrangler environment has dedicated D1 and VPC bindings and rate-limit namespaces. The top-level environment remains local. Use the explicit source configuration and production environment; no vinext build or generated Wrangler redirect is used:

```sh
pnpm --filter @meal-prep/web exec wrangler d1 migrations apply meal-prep-production --config wrangler.jsonc --env production --remote
pnpm --filter @meal-prep/web build:worker
pnpm --filter @meal-prep/web deploy:worker
```

`enable_request_signal` is explicit so incoming cancellation is observable. End-to-end release of the Python provider must still pass the deployment drill; this flag alone is not proof. The Python response adds a two-second SSE comment heartbeat after official AG-UI encoding, with a single producer task and bounded queue. This allows the private streaming path to observe disconnection even while the provider is silent; cancellation and slow-consumer cleanup have separate regression tests.

Production has no `MEAL_API_ORIGIN` or `MEAL_WEB_ORIGIN`; requests use private `MEAL_API` and `MEAL_WEB` bindings. The Web proxy accepts GET/HEAD only and never receives API routes. Missing bindings fail closed. Caller URLs, query strings, cookies and authorization headers are not used to route to Python. Local tests use an explicit loopback origin. VPC is beta and currently free across Workers plans; it is not a permanent pricing guarantee.

## Rollback

Record the Worker version ID, Web and API image digests/tags, contract version and D1 migration for every accepted release. Keep the previous compatible images and Worker version. Roll back the Web to its recorded image and verify hydration and static assets through the public Worker. Stop this project's API before replacing its image, then start the selected compatible image without process overlap. Roll back the Worker to its recorded compatible version with Wrangler. Do not remove the D1 database, revert migrations, prune host Docker resources or modify other projects. For this initial additive migration, rollback preserves `plan_sessions` and all existing rows.

An unavailable candidate can be stopped without deleting data. A successful build or health check alone does not complete the rollback exercise; verify Web hydration, session read/adopt, fixture SSE and an existing saved plan after the rollback.
