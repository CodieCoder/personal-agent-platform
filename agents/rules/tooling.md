# Tooling Rules

## Runtime

- Node.js 24.15.0 is the local development baseline.
- Package engines allow Node `>=22.13 <25`.
- Use pnpm through Corepack.

## TypeScript

Do not weaken strict TypeScript settings to make early implementation easier.

Required strictness includes:

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `useUnknownInCatchVariables`
- `forceConsistentCasingInFileNames`

## Formatting And Linting

Biome owns repository formatting and linting during bootstrap.

Run these before claiming a bootstrap task is done:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Browser and QA behavior checks are available as explicit commands:

```sh
pnpm test:e2e
pnpm test:qa
```

`pnpm test:qa` starts the local web app with an isolated SQLite database, runs
`qa/features/runtime-echo.feature` through `@qutecoder/qa-intel`, writes the latest JSON summary
under `qa/results/`, and stores QA-Intel artifacts/history under `.qa-results/`.

The baseline `pnpm verify` gate covers format, lint, typecheck, unit tests, and integration tests.

## Turbo

Turbo owns package task orchestration once packages exist.
Do not cache persistent development tasks.
Do not configure remote caching during Phase 0.
