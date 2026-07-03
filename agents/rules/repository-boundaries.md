# Repository Boundaries

## Implemented Scope

PAP-001 through PAP-031 currently include:

- Root metadata.
- Workspace tooling.
- Formatting and linting.
- Strict TypeScript configuration.
- Turbo task configuration.
- Shared workspace packages:
  - `@pap/contracts`
  - `@pap/shared`
  - `@pap/storage`
  - `@pap/storage-sqlite`
  - `@pap/testing`
  - `@pap/runtime`
  - `@pap/capability-echo`
  - `@pap/web`
  - `@pap/worker`
- Drizzle and `better-sqlite3` persistence for execution traces and trace steps.
- In-memory runtime capability registry, trace writer, runtime execution service, and
  dependency-injected runtime factory.
- Core echo capability with package-local runtime skill files.
- TanStack Start web app for echo execution and persisted trace inspection.
- Standalone worker startup and health command.
- Vitest unit and integration test baseline.
- Playwright echo smoke test.
- QA-Intel echo feature executed through `@qutecoder/qa-intel` with a local app launcher.
- Production Dockerfiles for `@pap/web` and `@pap/worker`.
- Local-first Compose baseline with `web`, `worker`, and the named `pap-data` volume.
- GitHub Actions CI quality pipeline.
- Documentation and generic coding-agent guidance.

## Active Ticket Rule

Only implement the active backlog ticket range requested by the user.

## Deferred Scope

Do not add these before their backlog tickets are active:

- Application code beyond the active web echo and trace screens and worker bootstrap.
- Workspace packages beyond the active ticket range.
- Database tables, storage adapters, or migrations beyond execution traces and trace steps.
- Docker or Compose scope beyond the current `web`, `worker`, and `pap-data` baseline.
- Dockerized Ollama, SearXNG, reverse proxy, deployment publishing, or hosted-service wiring.
- Real worker scheduling, cron, queues, or recurring jobs.
- Runtime capabilities beyond the active ticket range.
- Tool registry, skill loader, approval flow, memory services, or UI beyond the active ticket range.
- External service credentials or integrations.
- Product runtime skills under root `skills/`.

## Planning Trace

Accepted implementation plans must be committed to `docs/plans/` before execution begins.
Use `YYYY-MM-DD-ticket-range-short-title.md`.
