# Repository Boundaries

## Active Scope

Only implement the active backlog ticket range. For PAP-001 through PAP-003, that means:

- Root metadata.
- Workspace tooling.
- Formatting and linting.
- Strict TypeScript configuration.
- Turbo task configuration.
- Documentation and generic coding-agent guidance.

## Deferred Scope

Do not add these before their backlog tickets are active:

- Application code.
- Workspace packages.
- Database code or migrations.
- Docker files or Compose services.
- Runtime capabilities.
- External service credentials or integrations.
- Product runtime skills under root `skills/`.

## Planning Trace

Accepted implementation plans must be committed to `docs/plans/` before execution begins.
Use `YYYY-MM-DD-ticket-range-short-title.md`.
