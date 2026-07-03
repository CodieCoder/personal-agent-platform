# PAP-058/PAP-059 Model Test UI and Provider Status

Date: 2026-07-02
Status: Accepted for implementation
Tickets: PAP-058, PAP-059

## Scope

- Add `/model-test` as a controlled manual local-model test screen.
- Add a server-only web function that executes `capability.local-model-test` through the existing
  runtime boundary.
- Show prompt input, optional workspace selector, configured provider/model state, provider health,
  safe pending/success/failure states, and an execution detail link.
- Surface provider readiness in the existing status panel without conflating it with PAP app/runtime
  readiness.
- Render safe trace metadata on execution detail so provider, model, health, duration, and token
  evidence are visible when present.

## Decisions

- Keep provider resolution fixed to `provider.ollama`; no provider picker is introduced.
- Do not add free-form model selection UI. The server function accepts the capability input shape,
  but the route submits only prompt and optional workspace. The capability continues enforcing the
  configured-model allowlist.
- Use existing TanStack Start server functions and the web composition root. React route code must
  not import `@pap/ai-ollama`, call Ollama, or know provider URLs.
- Treat provider health as independent status data. Runtime ready means the app/runtime initialized;
  provider health reports `healthy`, `degraded`, `unavailable`, or `disabled`.
- Keep trace metadata rendering allowlisted and primitive-only to avoid exposing prompts, raw model
  responses, provider URLs, stack traces, or schemas.
- Keep the UI operational and compact, matching the existing local control surface.

## Files

- Update `apps/web/src/features/executions/types.ts` for provider status and model-test result
  types.
- Update `apps/web/src/features/executions/server.ts` with provider-status loading and
  `executeLocalModelTest`.
- Add `apps/web/src/routes/model-test.tsx`.
- Update `apps/web/src/routes/__root.tsx` navigation.
- Update `apps/web/src/features/executions/components.tsx` for provider health display and trace
  metadata rendering.
- Regenerate or update `apps/web/src/routeTree.gen.ts` for the new file route.
- Update `apps/web/src/styles/global.css` with narrow route/result styling only where existing
  classes are insufficient.
- Adjust provider disabled health handling if needed so disabled is visibly distinguishable.
- Add focused tests in the existing unit/integration harness where practical.

## Dependencies

- Completed PAP-050 through PAP-057 provider contracts, Ollama adapter, runtime wiring, and
  `capability.local-model-test`.
- Existing workspace list server functions and `WorkspaceSelector`.
- Existing execution trace persistence with trace-step metadata.

## Scripts

- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm lint`
- `pnpm format:check`

## Verification Commands

- Confirm `/model-test` renders with runtime status, provider status, configured provider/model, and
  optional workspace selector.
- Submit a prompt through the server function and verify success/failure states are safe and include
  execution links when available.
- Open execution detail and verify provider/model/duration metadata appears when recorded.
- Confirm no browser-side code imports `@pap/ai-ollama` or calls Ollama endpoints.

## Out Of Scope

- Streaming, chat, prompt history, arbitrary model selection, provider picker, model pulling, tool
  calling, memory write UI, automatic memory writes, research, scraping, SearXNG, embeddings,
  document/email features, browser automation, and Dockerized Ollama.
