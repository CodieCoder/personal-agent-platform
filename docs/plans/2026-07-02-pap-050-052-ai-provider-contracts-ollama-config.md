# PAP-050 to PAP-052 AI Provider Contracts and Ollama Config

Date: 2026-07-02
Status: Accepted for implementation
Tickets: PAP-050, PAP-051, PAP-052

## Scope

Add the contracts-first Phase 3 provider slice without invoking a model or wiring provider
execution into the runtime.

- Add provider/model Zod contracts to `@pap/contracts` for the initial Ollama-only provider kind.
- Add provider-neutral `@pap/ai` interfaces, provider registry helpers, selection helpers,
  normalized provider errors, and structured Zod output validation.
- Add `@pap/ai-ollama` config parsing only, including safe local URL validation and disabled-provider
  health shape.
- Keep Ollama config server-only and out of browser-safe environment output.
- Add focused unit tests for contracts, provider-neutral helpers, and Ollama config validation.

## Decisions

- Use `@pap/ai` from the Phase 3 backlog and implementation prompt for the provider-neutral
  package name.
- Treat `responseSchema` as an in-process Zod schema reference plus bounded metadata. Provider-specific
  JSON Schema conversion remains out until PAP-053.
- Restrict the first provider kind to `ollama`.
- Normalize provider failures through typed `AIProviderError` codes, including validation failures.
- Allow Ollama base URLs only for loopback, localhost, private LAN IPs, `.local` hosts, and
  single-label local service names by default.
- Keep `@pap/ai` free of runtime, web, database, HTTP, and Ollama-specific imports.
- Keep `@pap/ai-ollama` free of Ollama HTTP calls and runtime provider wiring for this ticket range.

## Files

- Add provider/model contracts in `packages/contracts/src/provider.ts` and export them from
  `packages/contracts/src/index.ts`.
- Update contract tests in `packages/contracts/test/contracts.test.mjs`.
- Create `packages/ai/` with package manifest, TypeScript config, source files, and unit tests.
- Create `packages/ai-ollama/` with package manifest, TypeScript config, source files, and unit
  tests.
- Update root TypeScript project references in `tsconfig.json`.
- Update `vitest.workspace.ts` so the new unit tests run in the unit project.
- Update `.env.example` with server-only `OLLAMA_*` configuration values.
- Update workspace lockfile metadata if required by pnpm.

## Dependencies

- Existing PAP-001 through PAP-031 repository, contracts, runtime, web, worker, test, Docker, and CI
  baseline.
- Existing PAP-037, PAP-040, and PAP-044 memory service/server-function baseline.
- `zod` for public contracts and structured output validation.
- Root scripts and package-local scripts for build, typecheck, lint, and unit tests.

## Verification Commands

- `pnpm --filter @pap/contracts test`
- `pnpm --filter @pap/ai test`
- `pnpm --filter @pap/ai-ollama test`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm lint`
- `pnpm format:check`

## Out Of Scope

- Ollama HTTP calls, fetch usage, or provider adapter implementation.
- Runtime provider registry/composition wiring or `context.llm.generateStructured` availability.
- Model-test capability, UI, provider-health status page, or trace metadata changes.
- Dockerized Ollama, SearXNG, research workflows, embeddings, vector search, or memory writes.
- External cloud LLM provider contracts or implementations.
- Provider-specific JSON Schema conversion.
