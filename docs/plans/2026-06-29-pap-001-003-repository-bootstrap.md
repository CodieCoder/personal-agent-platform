# PAP-001 to PAP-003 Repository Bootstrap Plan

Date: 2026-06-29
Status: Accepted for implementation

## Summary

Bootstrap `/paOS` as its own isolated repository with only
root metadata, documentation and agent guidance, workspace tooling, Biome, strict TypeScript,
and Turbo task wiring.

Do not add app code, database code, Docker files, runtime packages, capabilities, UI, tests,
or CI in this slice.

## Files To Create Or Change

- Initialize local Git repository at `/paOS/.git`.
- Create root metadata: `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `tsconfig.base.json`, `tsconfig.json`, `biome.json`, `.nvmrc`, `.npmrc`,
  `.gitignore`, `.env.example`, and `README.md`.
- Add docs navigation without moving existing numbered docs: `docs/README.md`, plus
  category placeholders under `docs/product/`, `docs/architecture/`, `docs/decisions/`,
  `docs/capabilities/`, `docs/runbooks/`, `docs/implementation/`, and `docs/plans/`.
- Add generic coding-agent guidance under `AGENTS.md` and `agents/`.
- Save this plan under `docs/plans/`.

## Tooling Configuration

- Use Node `24.15.0` in `.nvmrc`.
- Set engines to `node >=22.13 <25` and `pnpm >=11 <12`.
- Pin `packageManager` to `pnpm@11.9.0`.
- Add dev dependencies:
  - `@biomejs/biome@2.5.1`
  - `@types/node@24.13.2`
  - `turbo@2.10.0`
  - `typescript@6.0.3`
- Configure pnpm workspaces for future package locations only:
  - `apps/*`
  - `packages/*`
  - `packages/capabilities/*`

## Root Scripts And Tasks

- `format`: format files with Biome.
- `format:check`: check formatting without writing.
- `lint`: run Biome linting and future Turbo package lint tasks.
- `typecheck`: check the root TypeScript config and future Turbo package typecheck tasks.
- `test`: run the empty root Node test baseline and future Turbo package tests.
- `build`: run future Turbo build tasks.
- `verify`: run format check, lint, typecheck, and test.
- `ci`: alias `verify`; run it as `pnpm run ci` because `pnpm ci` is a pnpm install
  command.

Turbo defines `build`, `dev`, `lint`, `typecheck`, and `test`.
`dev` is persistent and uncached. No remote cache is configured.

## TypeScript And Biome

TypeScript is strict by default:

- `module` and `moduleResolution`: `NodeNext`
- `target`: `ES2023`
- `strict`: `true`
- `noUncheckedIndexedAccess`: `true`
- `exactOptionalPropertyTypes`: `true`
- `useUnknownInCatchVariables`: `true`
- `verbatimModuleSyntax`: `true`

Biome owns formatting and linting for the bootstrap repository.

## Verification Commands

Run:

```sh
git rev-parse --show-toplevel
corepack enable
pnpm install
pnpm -r list
pnpm format:check
pnpm lint
pnpm typecheck
pnpm turbo run lint
pnpm turbo run typecheck
pnpm turbo run test
pnpm test
pnpm verify
git status --short
```

Also verify Biome writes formatting by running it against a temporary malformed file under
`/private/tmp`, not a tracked project file.

## Assumptions And Boundaries

- The local Git repository already exists by the time implementation begins.
- Existing numbered docs remain in place.
- `agents/` is for generic coding-agent rules and skills.
- Future product runtime skills are not introduced in this ticket range.
- Real packages, app directories, database configuration, Docker, and capabilities are deferred
  to later PAP tickets.
