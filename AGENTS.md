# AGENTS.md - Personal Agent Platform

This repository is home for the Personal Agent Platform project.

## Source Of Truth

Read these docs before planning broad changes:

- `docs/01-product-foundation.md`
- `docs/02-product-principles.md`
- `docs/15-architecture-decision-records.md`
- `docs/16-repository-bootstrap-plan.md`
- `docs/17-phase-0-1-backlog.md`

Accepted ADRs win unless a documented revisit trigger applies.

## Current Implementation Scope

The current implemented slice is PAP-001 through PAP-007 only:

- Root repository metadata.
- pnpm workspace configuration.
- Turbo task configuration.
- Biome formatting and linting.
- Strict TypeScript base configuration.
- Shared workspace packages for contracts, utilities, storage interfaces, and testing helpers.
- Generic coding-agent docs under `agents/`.

Do not add application code, concrete database code, Docker, runtime implementation packages,
or capabilities until the corresponding backlog ticket is active.

## Planning Trace

Persist accepted implementation plans in `docs/plans/` before implementation begins.
Use the filename format:

```text
YYYY-MM-DD-ticket-range-short-title.md
```

Each plan should include scope, decisions, files, dependencies, scripts, verification commands,
and explicit out-of-scope items.

## Agent Rules And Skills

Use `agents/rules/` for repository-wide coding-agent rules.
Use `agents/skills/` for generic coding-agent skills that help work on this repository.

Do not use the root `skills/` directory for coding-agent workflow docs. Product runtime skills
will be introduced by later capability/runtime tickets.

## Safety Boundaries

- Preserve private data and secrets.
- Never commit `.env` files.
- Prefer narrow changes tied to active backlog tickets.
- Do not weaken strict TypeScript settings to make early code compile.
- Do not introduce external services, credentials, or side-effecting runtime behavior during
  repository bootstrap tasks.
