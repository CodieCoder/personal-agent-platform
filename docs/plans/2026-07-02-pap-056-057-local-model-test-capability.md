# PAP-056/PAP-057 Local Model Test Capability

## Summary

- First persist this accepted plan as `docs/plans/2026-07-02-pap-056-057-local-model-test-capability.md`.
- Add `@pap/capability-local-model-test` with package-local schemas, manifest, `SKILL.md`, fixed prompt template, execute function, and tests.
- Run only through provider-neutral `@pap/ai` runtime services. The capability must not import `@pap/ai-ollama`, call Ollama directly, use tools, use memory, stream, or add UI.
- Register the capability in existing web/worker runtime composition roots, but add no route, form, server function, or web UI.

## Interfaces And Schemas

- Capability manifest:
  - `id: "capability.local-model-test"`
  - `skill.id: "skill.local-model-test"`
  - `inputSchemaId: "capability.local-model-test.input.v1"`
  - `outputSchemaId: "capability.local-model-test.output.v1"`
  - `allowedTools: []`, `allowedChildCapabilities: []`, `supportedUiBlocks: []`
  - `permissions: ["llm.generate"]`
  - `sideEffects: ["none"]`
  - `approvalPolicyId: "approval.none"`, `memoryPolicyId: "memory.none"`, `trustLevel: "core"`
- Input schema:
  ```ts
  z.object({
    prompt: z.string().trim().min(1).max(4_000),
    workspaceId: workspaceIdSchema.nullable().optional(),
    model: modelNameSchema.nullable().optional(),
  }).strict();
  ```
- Model structured-output schema sent to `@pap/ai`:
  ```ts
  z.object({
    summary: z.string().trim().min(1).max(600),
    keyPoints: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
    confidence: z.number().min(0).max(1),
  }).strict();
  ```
- Final capability output schema adds deterministic provider metadata:
  ```ts
  modelOutput
    .extend({
      model: modelNameSchema,
      provider: providerIdSchema,
    })
    .strict();
  ```
- Extend `CapabilityExecutionContext.llm` with `getProviderHealth(providerId)` and wire it through `RuntimeExecutionService` using the existing provider registry. Gate it with `llm.generate` permission and trace safe provider-health metadata only.

## Runtime And Prompt Behavior

- Provider resolution is fixed to `provider.ollama`; no provider picker is added.
- Model selection is `input.model ?? health.model`; explicit `input.model` is allowed only when it matches the configured model reported by provider health. Otherwise fail with a safe validation error.
- Invocation request uses `temperature: 0`, `maxTokens: 512`, `timeoutMs: 60_000`, `keepAlive: null`, and response schema id `capability.local-model-test.model-output.v1`.
- Fixed prompt template:
  - System prompt says this is a PAP local-model test, return only valid JSON matching the schema, do not browse, call tools, use memory, infer private context, or add extra keys.
  - User prompt wraps only the submitted prompt text plus concise instructions for `summary`, `keyPoints`, and `confidence`.
  - Do not inject workspace data, memory, trace data, provider URLs, raw schemas beyond the structured-output schema reference, or prior executions.

## Trace Structure And Failures

- Expected success trace shape:
  - Runtime `validation / validate input`
  - Capability `workflow / local-model-test.resolve-provider` with `{ providerId }`
  - Runtime `llm / llm.getProviderHealth` with `{ providerId, providerKind, healthStatus, model, checkedAt, modelPresent, modelCount, ollamaVersion }` when present
  - Capability `workflow / local-model-test.build-prompt` with `{ promptTemplateId, responseSchemaId, promptLength }`
  - Runtime `llm / llm.generateStructured` with provider/model/timing/token metadata
  - Runtime or capability `validation / llm.validateStructuredOutput` with `{ responseSchemaId }`
  - Runtime `validation / validate output`
  - Runtime `workflow / finalize execution`
- Safe error mapping:
  - Unknown provider -> `AI_PROVIDER_NOT_FOUND`, failed execution, no model call.
  - Health unavailable/unknown/degraded-for-readiness -> `AI_PROVIDER_UNAVAILABLE`, failed execution, health evidence in trace.
  - Provider timeout/overload/http/invalid response/schema invalid from generation -> existing runtime `AI_PROVIDER_*` codes.
  - Explicit unconfigured model -> `CAPABILITY_INPUT_INVALID`.
  - Capability output envelope invalid -> `CAPABILITY_OUTPUT_INVALID`.
- Never trace raw prompts, raw model output, local provider URLs, stack traces, full validation issue payloads, or secrets.

## Test Plan

- Package unit tests for schemas, manifest boundaries, prompt construction, no tool/memory/UI/approval calls, successful fake LLM output, model mismatch failure, and health-not-ready failure.
- Runtime integration tests use a fake `AIProvider`/provider registry, not live Ollama:
  - completed local-model-test execution
  - provider health trace metadata
  - generation trace provider/model/duration metadata
  - provider unavailable failure
  - schema-invalid model output failure
  - no memory reads or writes
  - request-level `workspaceId` persists on the execution trace
- Verification commands:
  - `pnpm --filter @pap/capability-local-model-test test`
  - `pnpm --filter @pap/runtime test`
  - `pnpm typecheck`
  - `pnpm test:unit`
  - `pnpm test:integration`
  - `pnpm lint`
  - `pnpm format:check`

## Assumptions

- `CapabilityExecutionRequest.workspaceId` remains the source of truth for workspace propagation. Input `workspaceId` is accepted as nullable metadata for the PAP-056 contract, but implementation/tests pass and assert request-level workspace propagation.
- No web UI, streaming, tools, memory access, search, scraping, vectors, email, documents, browser automation, approval UX, or direct Ollama transport imports are included in PAP-056/PAP-057.
