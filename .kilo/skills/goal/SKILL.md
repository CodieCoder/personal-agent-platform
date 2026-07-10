---
name: goal
description: PAP-specific tooling, package boundaries, deferred scope, and conventions for the Goal Agent.
---

## Source of Truth

Read before planning broad changes:
- docs/01-product-foundation.md
- docs/02-product-principles.md
- docs/15-architecture-decision-records.md
- docs/16-repository-bootstrap-plan.md
- docs/backlogs/17-phase-0-1-backlog.md
- agents/rules/repository-boundaries.md
- agents/rules/tooling.md
Accepted ADRs win unless a documented revisit trigger applies.

## Repository Boundaries & Package Conventions

- Monorepo with pnpm workspaces under packages/
- Shared packages: @pap/contracts, @pap/shared, @pap/storage, @pap/storage-sqlite,
  @pap/testing, @pap/runtime, @pap/memory
- Capability packages: @pap/capability-echo (pattern for future capabilities)
- Apps: @pap/web (TanStack Start), @pap/worker (standalone)
- Strict TypeScript with noUncheckedIndexedAccess, exactOptionalPropertyTypes,
  useUnknownInCatchVariables
- Biome owns formatting and linting
- Turbo owns task orchestration
- Drizzle + better-sqlite3 for persistence
- Vitest for unit/integration tests, Playwright for e2e, @qutecoder/qa-intel for QA

## Verification Commands

```bash
pnpm format:check     # Biome format check
pnpm lint             # Biome lint
pnpm typecheck        # tsc --noEmit across workspace
pnpm test:unit        # Vitest unit tests
pnpm test:integration # Vitest integration tests
pnpm verify           # Gate: format + lint + typecheck + unit + integration

# Browser/behavior tests:
pnpm test:e2e         # Playwright smoke tests
pnpm test:qa          # QA-Intel feature tests (starts local app with isolated DB)

# Docker/Compose:
pnpm docker:up        # Start local Compose (web, worker, pap-data volume)
pnpm docker:down      # Stop (does not remove volume)
```

## Deferred Scope (Do Not Add)

Do not add these until their backlog ticket is active:
- Dockerized Ollama, SearXNG, reverse proxy
- Real worker scheduling, cron, queues
- Tool registry, skill loader, approval flow (beyond current scope)
- Research, email, document, vector, source-profile capabilities
- Memory Explorer UI, context tools
- External service credentials or integrations
- UI beyond PAP-018–PAP-021 echo and trace screens

## Testing Conventions

- SQLite tests: use temporary databases (no local dev data), no shared writable DB
  files across unrelated tests, no order-dependent tests
- Provider/search/model tests: mock external services unless goal explicitly asks
  for live smoke testing
- Playwright and QA behavior tests: assert visible user behavior, use seeded fixtures,
  keep tests independent, preserve screenshots/traces on failure

## Error Handling

- Use typed error schemas from @pap/contracts. Do not throw raw errors through API
  boundaries.
- For external/provider failures: preserve diagnostics in traces via @pap/runtime
  trace writer, but strip stack traces, secrets, auth headers, raw payloads, and
  hidden model reasoning.

## Git

Before committing, read and follow agents/skills/commit-message/SKILL.md.

## Plan Persistence

Persist accepted implementation plans to docs/plans/ before implementing.
Use filename: YYYY-MM-DD-ticket-range-short-title.md
Include: scope, decisions, files, dependencies, scripts, verification commands,
and explicit out-of-scope items.

## Implementation Order

Prefer: contracts/types → interfaces → storage/repository → service/runtime →
capability/tool → server APIs → UI → tests → docs
