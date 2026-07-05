# PAP-091-093 Live QA And Research Hardening

## Scope

- Change QA-Intel local runs to exercise real local providers by default while retaining isolated SQLite state.
- Keep deterministic QA fixture mode available as an explicit opt-in for CI or narrow fixture debugging.
- Update QA feature contracts so live-provider runs assert stable product behavior instead of fixture-only source names and URLs.
- Harden research behavior around observed live failures:
  - extraction failures should remain partial-source warnings when any other source can succeed;
  - model schema failures should be traceable and should not hide persisted search/fetch/extraction evidence.

## Decisions

- `pnpm test:qa` defaults to a live-provider mode: local SearXNG and Ollama configuration come from `.env`, `.env.local`, and process env.
- QA still creates a temporary `PAP_DATABASE_URL` and `PAP_DATA_DIR`; production-like provider behavior must not write to the developer app DB.
- Fixture mode remains available through `PAP_QA_PROVIDER_MODE=fixture pnpm test:qa`.
- Live feature assertions avoid exact external titles, URLs, snippets, and source counts unless the UI state is produced by seeded local QA data.

## Files

- `qa/runner/src/index.ts`
- `qa/features/search-web-extraction.feature`
- `qa/features/source-backed-research.feature`
- `README.md`
- Targeted tests under `qa/runner` or existing test suites if the runner surface allows it.

## Dependencies

- Local SearXNG reachable through `SEARXNG_BASE_URL`.
- Local Ollama reachable through `OLLAMA_BASE_URL` with `OLLAMA_DEFAULT_MODEL` configured for live research.
- Existing `@qutecoder/qa-intel`, Playwright, SQLite, and repo workspace packages.

## Verification Commands

- `pnpm --filter @pap/qa-runner typecheck`
- `pnpm test:qa`
- `PAP_QA_PROVIDER_MODE=fixture pnpm test:qa`

## Out Of Scope

- Adding Dockerized SearXNG or Ollama.
- Adding browser-rendered extraction, Crawlee, Firecrawl, or external cloud LLM/search providers.
- Reworking the research UI beyond stable test hooks if needed.
- Automatic active memory writes.
