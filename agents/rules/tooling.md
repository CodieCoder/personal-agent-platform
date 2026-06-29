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

## Turbo

Turbo owns package task orchestration once packages exist.
Do not cache persistent development tasks.
Do not configure remote caching during Phase 0.
