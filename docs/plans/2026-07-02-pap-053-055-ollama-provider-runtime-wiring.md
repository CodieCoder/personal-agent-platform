# PAP-053 to PAP-055 Ollama Provider Adapter and Runtime Wiring

Date: 2026-07-02
Status: Accepted for implementation
Tickets: PAP-053, PAP-054, PAP-055

## Scope

Implement the provider-only Phase 3 slice:

- Typed non-streaming Ollama HTTP client.
- JSON-schema structured-output requests.
- AbortController timeout handling.
- Typed HTTP, connection, timeout, and response error normalization.
- `OllamaProvider` implementing `AIProvider`.
- Provider health behavior.
- Provider registry and composition-root wiring.
- Runtime-safe provider generation and health access.
- Safe trace metadata fields that later capability work can record.

## Decisions

- Use `POST /api/generate`, not `POST /api/chat`, for this slice. The current PAP request shape is
  one optional system prompt plus one prompt, and `/api/generate` supports `stream: false` and
  JSON Schema in `format` without introducing chat history or tool-call surfaces.
- Request mapping:
  - `model` from `StructuredGenerationRequest.model`.
  - `system` from `systemPrompt` when non-null.
  - `prompt` from the bounded request prompt plus a short JSON-only instruction.
  - `format` from JSON Schema converted from `responseSchema.schema`.
  - `stream` fixed to `false`.
  - `keep_alive` from request `keepAlive` or validated Ollama config default.
  - `options.temperature` from request `temperature` when non-null.
  - `options.num_predict` from request `maxTokens` when non-null.
  - Do not send request metadata, tools, images, context, raw mode, pull/create fields, or any CLI
    command behavior.
- Response mapping:
  - Validate the Ollama HTTP response shape with Zod before use.
  - Parse Ollama `response` as JSON into `StructuredGenerationResult.output`.
  - Set `rawText` to the response string, but never trace it by default.
  - Use client wall-clock `startedAt`, `completedAt`, and `durationMs`.
  - Map `prompt_eval_count` to `promptTokenCount`.
  - Map `eval_count` to `completionTokenCount`.
  - Set `totalTokenCount` to the prompt plus completion counts when both are available.
  - Let `@pap/ai` perform the second validation against the requested Zod output schema.
- Health design:
  - Disabled config returns `status: "unavailable"` and generation throws `provider_disabled`.
  - Enabled health calls `GET /api/version` to prove reachability, then `GET /api/tags` to confirm
    the configured model.
  - Configured model present returns `healthy`.
  - Endpoint reachable but model unconfirmed, missing, or tags response invalid returns `degraded`.
  - Connection or timeout on version check returns `unavailable`.
  - Health checks must not load, pull, create, or auto-install models.
- Composition-root ownership:
  - Only `apps/web/src/features/executions/runtime.server.ts` and
    `apps/worker/src/runtime-bootstrap.ts` construct Ollama provider instances.
  - Capabilities, web routes, React components, and browser-side code must not import
    `@pap/ai-ollama` or call Ollama directly.
  - Runtime receives only provider-neutral `@pap/ai` registry/service access.
- Test and mock transport strategy:
  - `@pap/ai-ollama` tests use an injected mock fetch transport and do not require a live Ollama
    process or installed model.
  - Runtime tests use fake `AIProvider` instances and the existing in-memory trace repository
    pattern.

## Error Mapping

| Condition | AI error code | Retryable |
| --- | --- | --- |
| `OLLAMA_ENABLED=false` generation | `provider_disabled` | false |
| AbortController timeout | `provider_timeout` | true |
| Connection refused, reset, DNS, or fetch network failure | `provider_unavailable` | true |
| HTTP 429 or 503 | `provider_overloaded` | true |
| HTTP 404 model missing | `provider_unavailable` | false |
| HTTP 400 | `provider_http_error` | false |
| Other HTTP 5xx | `provider_http_error` | true |
| Non-JSON HTTP body | `provider_invalid_response` | false |
| Invalid Ollama response shape | `provider_invalid_response` | false |
| Missing response text or `done: false` in non-streaming response | `provider_invalid_response` | false |
| Malformed JSON model output | `provider_invalid_response` | false |
| Output fails requested Zod schema | `provider_schema_invalid` | false |
| Unknown provider id | existing `provider_not_found` | false |

No raw fetch, AbortController, or Ollama errors should leak to callers.

## Files

- Add Ollama client/provider implementation in `packages/ai-ollama/src/`.
- Export the client/provider from `packages/ai-ollama/src/index.ts`.
- Add or update `packages/ai-ollama/test/` coverage for client, provider, and health behavior.
- Add runtime provider registry/service wiring in `packages/runtime/src/runtime.ts` and
  `packages/runtime/src/execution-service.ts`.
- Update runtime tests in `packages/runtime/test/runtime.test.mjs`.
- Add bounded trace-step metadata contracts in `packages/contracts/src/execution.ts` and
  `packages/contracts/src/capability.ts`.
- Update storage interfaces and SQLite trace-step persistence in `packages/storage/` and
  `packages/storage-sqlite/`, including a committed migration.
- Update web and worker composition roots to construct and register the Ollama provider.
- Update package dependency manifests and TypeScript build references if needed.

## Trace Metadata

Trace metadata is for safe summaries only. It must not include prompts, raw model responses, full
schemas, local URLs, stack traces, or private data.

Fields prepared for later capability work:

- `providerId`
- `providerKind`
- `model`
- `responseSchemaId`
- `timeoutMs`
- `keepAlive`
- `temperature`
- `maxTokens`
- `durationMs`
- `promptTokenCount`
- `completionTokenCount`
- `totalTokenCount`
- `healthStatus`
- `checkedAt`
- `httpStatus`
- `errorKind`
- `retryable`
- `modelPresent`
- `modelCount`
- `ollamaVersion`

## Dependencies

- Completed PAP-050 through PAP-052 baseline:
  - `@pap/contracts` provider contracts.
  - `@pap/ai` provider-neutral registry, service, and error helpers.
  - `@pap/ai-ollama` safe local config parsing and disabled health helper.
- Existing runtime, trace writer, memory service, web composition root, and worker composition root.
- Node.js LTS fetch and AbortController APIs.
- Zod for contracts, HTTP response validation, structured output validation, and JSON Schema export.

## Verification Commands

- `pnpm --filter @pap/ai-ollama test`
- `pnpm --filter @pap/ai test`
- `pnpm --filter @pap/runtime test`
- `pnpm --filter @pap/contracts test`
- `pnpm --filter @pap/storage-sqlite test`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm lint`
- `pnpm format:check`

## Out Of Scope

- Capability implementation.
- Web UI.
- Runtime model-test route.
- Browser-side Ollama access.
- Dockerized Ollama.
- Model auto-pull, create, copy, delete, or unload behavior.
- Shelling out to the Ollama CLI.
- Retry workers, queues, or background polling.
- Model tool calling.
- Automatic memory writes.
- Prompt history, chat mode, streaming, embeddings, vector search, research, SearXNG, scraping,
  email, documents, or external cloud LLM providers.

## Assumptions

- `OLLAMA_ENABLED=false` remains the recommended bootstrap default for environments without a
  configured model.
- Enabling Ollama without `OLLAMA_DEFAULT_MODEL` remains a startup or provider-construction
  configuration error from PAP-052.
- Zod 4 JSON Schema export is sufficient for the response schemas used in this phase. If the local
  Zod version cannot export a needed schema, add the smallest provider-local conversion helper
  rather than introducing broad new dependencies.
- Provider errors remain safe summaries. Raw prompts, raw responses, fetch internals, local
  infrastructure details, and stack traces are not exposed in traces or browser-safe environment
  output.
