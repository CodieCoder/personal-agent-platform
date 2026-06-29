# Repository Boundaries

## Implemented Scope

PAP-001 through PAP-011 currently include:

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
- Drizzle and `better-sqlite3` persistence for execution traces and trace steps.
- Documentation and generic coding-agent guidance.

## Active Ticket Rule

Only implement the active backlog ticket range requested by the user.

## Deferred Scope

Do not add these before their backlog tickets are active:

- Application code.
- Workspace packages beyond the active ticket range.
- Database tables, storage adapters, or migrations beyond execution traces and trace steps.
- Docker files or Compose services.
- Runtime implementation packages.
- Runtime capabilities.
- External service credentials or integrations.
- Product runtime skills under root `skills/`.

## Planning Trace

Accepted implementation plans must be committed to `docs/plans/` before execution begins.
Use `YYYY-MM-DD-ticket-range-short-title.md`.
