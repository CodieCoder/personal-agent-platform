---
name: repository-bootstrap
description: Use when changing PAP repository bootstrap files, workspace tooling, root scripts, TypeScript, Biome, Turbo, Docker, Compose, CI, or generic coding-agent rules.
---

# Repository Bootstrap

## When To Use

Use this skill for PAP bootstrap tickets that affect:

- Root package metadata.
- pnpm workspace configuration.
- Turbo tasks.
- TypeScript configuration.
- Biome configuration.
- Docker, Compose, or CI bootstrap files.
- Vitest, Playwright, or QA-Intel bootstrap commands.
- README, AGENTS.md, or generic coding-agent rules.

## Workflow

1. Read the active backlog ticket in `docs/backlogs/17-phase-0-1-backlog.md`.
2. Read accepted architecture decisions in `docs/15-architecture-decision-records.md`.
3. Persist the accepted implementation plan in `docs/plans/` before editing.
4. Keep changes inside the active ticket scope.
5. Run the verification commands named by the active plan.

## Boundaries

For early bootstrap work, do not add items before their backlog ticket is active:

- Application code beyond the active ticket range.
- Workspace packages outside the active ticket range.
- Database code outside the active ticket range.
- Docker or Compose services beyond the active ticket range.
- Dockerized external services, reverse proxies, deployment publishing, or credentials.
- Runtime capabilities outside the active ticket range.
- Product runtime skills outside their owning capability packages.

## Expected Output

When done, summarize:

- Files created or changed.
- Verification commands and results.
- Any intentionally deferred scope.
