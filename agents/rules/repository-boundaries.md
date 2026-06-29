# Repository Boundaries

## Implemented Scope

PAP-001 through PAP-007 currently include:

- Root metadata.
- Workspace tooling.
- Formatting and linting.
- Strict TypeScript configuration.
- Turbo task configuration.
- Shared workspace packages:
  - `@pap/contracts`
  - `@pap/shared`
  - `@pap/storage`
  - `@pap/testing`
- Documentation and generic coding-agent guidance.

## Active Ticket Rule

Only implement the active backlog ticket range requested by the user.

## Deferred Scope

Do not add these before their backlog tickets are active:

- Application code.
- Workspace packages beyond the active ticket range.
- Concrete database code, storage adapters, or migrations.
- Docker files or Compose services.
- Runtime implementation packages.
- Runtime capabilities.
- External service credentials or integrations.
- Product runtime skills under root `skills/`.

## Planning Trace

Accepted implementation plans must be committed to `docs/plans/` before execution begins.
Use `YYYY-MM-DD-ticket-range-short-title.md`.
