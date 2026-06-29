---
name: repository-bootstrap
description: Use when changing PAP repository bootstrap files, workspace tooling, root scripts, TypeScript, Biome, Turbo, or generic coding-agent rules.
---

# Repository Bootstrap

## When To Use

Use this skill for PAP bootstrap tickets that affect:

- Root package metadata.
- pnpm workspace configuration.
- Turbo tasks.
- TypeScript configuration.
- Biome configuration.
- README, AGENTS.md, or generic coding-agent rules.

## Workflow

1. Read the active backlog ticket in `docs/17-phase-0-1-backlog.md`.
2. Read accepted architecture decisions in `docs/15-architecture-decision-records.md`.
3. Persist the accepted implementation plan in `docs/plans/` before editing.
4. Keep changes inside the active ticket scope.
5. Run the verification commands named by the active plan.

## Boundaries

For PAP-001 through PAP-003, do not add:

- Application code.
- Workspace packages.
- Database code.
- Docker configuration.
- Runtime capabilities.
- Product runtime skills.

## Expected Output

When done, summarize:

- Files created or changed.
- Verification commands and results.
- Any intentionally deferred scope.
