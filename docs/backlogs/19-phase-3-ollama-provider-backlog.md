# Personal Agent Platform — Phase 3 Ollama Provider Backlog

**Status:** Draft execution backlog

**Depends on:**
- `01-product-foundation.md`
- `02-product-principles.md`
- `04-runtime-and-contracts.md`
- `06-tool-system.md`
- `08-policy-and-approval-model.md`
- `15-architecture-decision-records.md`
- `18-phase-2-storage-memory-trace-backlog.md`

**Purpose:** Add a local Ollama provider adapter and one constrained model capability without introducing search, scraping, automatic memory extraction, model tool-calling, or research workflows.

---

## 1. Phase Objective

Phase 3 proves PAP can invoke a local model through the runtime while preserving typed contracts, provider isolation, traceability, and safe failures.

Completed vertical slice:

```text
User runs local-model test
→ runtime invokes Ollama
→ Ollama returns structured JSON
→ PAP validates the result against Zod schema
→ execution trace records provider/model/timing
→ UI shows result and trace
→ unavailable/timeout/schema failures are safe and inspectable
```

This phase must not add:

- SearXNG
- Scraping
- Crawlee
- Firecrawl
- Research capability
- Model tool calling
- Automatic semantic memory writes
- Vector search
- Embeddings
- Email
- Document upload
- Browser automation
- External cloud LLM providers
- Approval-rule UX
- Generative UI

---

## 2. Product Rules

- Ollama is a provider, not the runtime authority.
- All model output must be validated after receipt.
- Model output never bypasses policy checks.
- Provider details must appear in execution traces.
- Unavailable Ollama must fail safely and visibly.
- No automatic long-term memory writes in this phase.
- Prompts and outputs must be bounded in size.
- The provider must be replaceable later by another local or cloud adapter.
- The local provider must default to loopback-only access.

---

## 3. Proposed Package Boundaries

```text
packages/
  contracts/
    provider.ts
    model.ts

  ai/
    provider.ts
    structured-output.ts
    errors.ts
    registry.ts
    index.ts

  ai-ollama/
    config.ts
    ollama-client.ts
    ollama-provider.ts
    health.ts
    index.ts

  capabilities/
    local-model-test/
      SKILL.md
      schemas.ts
      capability.ts
      index.ts
```

### Boundary Rules

`@pap/ai`

- Provider-neutral interfaces.
- Provider-neutral error contracts.
- Structured-output validation helpers.
- No HTTP or Ollama-specific behavior.

`@pap/ai-ollama`

- Ollama HTTP transport.
- Health check.
- Config parsing.
- Timeout and error normalization.
- No capability-specific prompts.

`@pap/capability-local-model-test`

- Declares input/output contracts.
- Owns prompt template.
- Invokes `@pap/ai` abstraction only.
- Never imports Ollama transport directly.

---

# Milestone 3.1 — Provider Contracts and Configuration

## PAP-050 — Add AI Provider Contracts

**Goal:** Define framework-neutral model/provider contracts in `@pap/contracts`.

### Scope

- Provider identifier.
- Provider kind.
- Provider health status.
- Model request schema.
- Model response schema.
- Structured output request schema.
- Model usage/timing schema.
- Provider error schema.

### Required Provider Kinds

```text
ollama
```

Do not add OpenAI, Anthropic, Groq, or generic cloud provider implementations yet.

### Required Request Fields

```text
providerId
model
systemPrompt nullable
prompt
responseSchema
temperature nullable
maxTokens nullable
timeoutMs
keepAlive nullable
metadata nullable
```

### Required Response Fields

```text
providerId
model
output
rawText nullable
startedAt
completedAt
durationMs
promptTokenCount nullable
completionTokenCount nullable
totalTokenCount nullable
```

### Acceptance Criteria

- All contracts use Zod.
- Provider response output is unknown before capability validation.
- Timeout must be bounded.
- Prompt and response-schema fields are bounded.
- No Ollama HTTP code is added.

### Depends On

```text
PAP-004
PAP-012
```

---

## PAP-051 — Add Provider-Neutral AI Package

**Goal:** Create `@pap/ai` as the runtime-facing abstraction.

### Scope

- AIProvider interface.
- StructuredGenerationService interface.
- Provider registry.
- Provider selection helper.
- Normalized provider errors.
- Zod structured-output validation helper.

### Required Interface Shape

```ts
interface AIProvider {
  readonly id: string;

  health(): Promise<ProviderHealth>;

  generateStructured<TOutput>(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<TOutput>>;
}
```

### Constraints

- No Ollama imports.
- No runtime imports.
- No web-app imports.
- No direct database access.
- No provider credential/config parsing.

### Acceptance Criteria

- A capability can request a named provider through the interface.
- Invalid provider ID produces a typed error.
- Provider result is validated against a supplied Zod schema.
- Schema validation failure produces a typed provider/model-output failure.

### Depends On

```text
PAP-050
```

---

## PAP-052 — Add Ollama Configuration Contract

**Goal:** Define safe local-provider configuration.

### Scope

```text
OLLAMA_BASE_URL
OLLAMA_DEFAULT_MODEL
OLLAMA_TIMEOUT_MS
OLLAMA_KEEP_ALIVE
OLLAMA_ENABLED
```

### Default Values

```text
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TIMEOUT_MS=60000
OLLAMA_KEEP_ALIVE=5m
OLLAMA_ENABLED=true
```

### Constraints

- Base URL defaults to loopback only.
- Do not silently allow arbitrary public Ollama endpoints.
- Environment parsing validates all values.
- Config is server-only.
- Config must not expose secrets or local infrastructure details to browser code.

### Acceptance Criteria

- Invalid URL/config fails at startup or provider construction.
- Timeout values are bounded.
- Disabled provider returns typed unavailable state.
- Default model is required when provider is enabled.

### Depends On

```text
PAP-050
```

---

# Milestone 3.2 — Ollama Adapter

## PAP-053 — Implement Ollama HTTP Client

**Goal:** Add a minimal typed HTTP client for local Ollama.

### Scope

- `POST /api/generate` or `POST /api/chat`.
- Non-streaming request support.
- JSON-schema format support.
- AbortController timeout support.
- Response parsing.
- HTTP error normalization.
- Connection failure normalization.

### Request Behavior

- Use non-streaming responses for Phase 3.
- Use schema-constrained JSON output.
- Use explicit model name.
- Use explicit timeout.
- Use `keep_alive` from validated config.

### Failure Categories

```text
provider_unavailable
provider_timeout
provider_overloaded
provider_http_error
provider_invalid_response
provider_schema_invalid
provider_disabled
```

### Acceptance Criteria

- Connection refused becomes `provider_unavailable`.
- Timeout becomes `provider_timeout`.
- HTTP 503 becomes `provider_overloaded`.
- Invalid JSON/shape becomes `provider_invalid_response`.
- Returned output failing Zod validation becomes `provider_schema_invalid`.
- No raw fetch or Ollama errors leak to callers.

### Depends On

```text
PAP-051
PAP-052
```

---

## PAP-054 — Implement Ollama Provider Adapter

**Goal:** Make Ollama conform to `AIProvider`.

### Scope

- `OllamaProvider` class.
- `health()` implementation.
- `generateStructured()` implementation.
- Model/provider metadata extraction.
- Duration measurement.
- Structured-output parse and validation.

### Health Behavior

Healthy:

- Ollama endpoint responds.
- Configured model is present or usable.

Degraded:

- Endpoint responds but configured model cannot be confirmed.

Unavailable:

- Endpoint unreachable.
- Provider disabled.
- Invalid local configuration.

### Constraints

- Do not auto-pull models.
- Do not shell out to Ollama CLI.
- Do not add queueing/retry workers.
- Do not add model tool calling.

### Acceptance Criteria

- Provider can run against local Ollama.
- Health check produces typed state.
- Structured output is validated twice:
  1. response JSON parse
  2. Zod output-schema validation
- Provider exposes model and duration metadata.

### Depends On

```text
PAP-053
```

---

## PAP-055 — Add Provider Registry and Composition Root Wiring

**Goal:** Register Ollama through one runtime composition point.

### Scope

- Provider registry construction.
- Environment-based Ollama registration.
- Provider health status available to runtime.
- Runtime context provider accessor.

### Constraints

- Capabilities cannot instantiate Ollama directly.
- Web routes cannot instantiate Ollama directly.
- All provider use goes through runtime/composition root.

### Acceptance Criteria

- Ollama can be enabled/disabled by config.
- Unknown provider fails safely.
- Runtime can request provider health.
- No circular dependency between runtime and provider packages.

### Depends On

```text
PAP-054
PAP-015
```

---

# Milestone 3.3 — Local Model Test Capability

## PAP-056 — Add Local Model Test Capability Contracts

**Goal:** Define a deliberately narrow model-exercise capability.

### Capability ID

```text
capability.local-model-test
```

### Input

```text
prompt
workspaceId nullable
model nullable
```

### Output

```text
summary
keyPoints
confidence
model
provider
```

### Required Output Constraints

Summary:

- Required.
- Bounded length.

Key points:

- Array.
- 1 to 5 entries.
- Bounded entry length.

Confidence:

- Number from 0 to 1.

### Acceptance Criteria

- Input and output schemas are Zod validated.
- No tool calls.
- No memory writes.
- No external side effects.
- No arbitrary provider/model selection unless allowlisted by config.

### Depends On

```text
PAP-050
```

---

## PAP-057 — Implement `capability.local-model-test`

**Goal:** Run one structured local-model request through the runtime.

### Trace Steps

```text
validate input
resolve provider
provider health check
build prompt
invoke model
validate structured output
finalize execution
```

### Prompt Rules

- Use a fixed system instruction.
- Use a simple user prompt.
- Explicitly request JSON matching the supplied schema.
- Do not inject memory.
- Do not invoke tools.
- Do not create memory.

### Failure Behavior

If Ollama is unavailable:

- Execution fails safely.
- Trace includes provider-health/unavailable evidence.
- UI receives safe actionable message.

If schema invalid:

- Execution fails safely.
- Trace includes validation failure.
- Raw provider response is not exposed by default.

### Acceptance Criteria

- Capability runs through `RuntimeExecutionService`.
- Provider/model/timing are visible in trace metadata.
- Success result is persisted as execution output.
- No memory records are created.
- No direct Ollama import exists in capability package.

### Depends On

```text
PAP-055
PAP-056
```

---

# Milestone 3.4 — Web Experience

## PAP-058 — Add Local Model Test UI

**Goal:** Provide a controlled manual-test screen.

### Routes

```text
/model-test
```

### Required UI

- Prompt textarea.
- Optional workspace selector.
- Configured model display.
- Provider health badge.
- Run local model button.
- Result panel.
- Execution trace link.
- Safe unavailable/error state.

### Constraints

- No chat interface yet.
- No streaming UI.
- No prompt history.
- No model picker unless explicitly allowlisted.
- No generic agent prompt box.

### Acceptance Criteria

- User can submit a model test.
- Success shows validated summary, key points, and confidence.
- Failure shows safe provider error.
- Execution detail page shows provider/model/timing trace evidence.
- No browser-side Ollama calls.

### Depends On

```text
PAP-057
PAP-019
```

---

## PAP-059 — Add Runtime Status Provider-Health Display

**Goal:** Surface Ollama availability in existing status UI.

### Scope

- Provider health indicator.
- Configured model name.
- Disabled/unavailable state.
- Last checked time nullable.

### Acceptance Criteria

- Status page distinguishes runtime-ready from model-provider-ready.
- Unavailable Ollama does not make the whole PAP web app appear broken.
- No repeated health polling loop is added.

### Depends On

```text
PAP-055
PAP-058
```

---

# Milestone 3.5 — Tests and Behavior Validation

## PAP-060 — Add Provider Unit Tests

**Goal:** Test Ollama adapter behavior without requiring a live Ollama instance.

### Required Tests

- Valid structured response.
- Malformed JSON response.
- Schema-invalid response.
- Connection refused.
- Timeout/AbortController path.
- HTTP 503 overloaded response.
- Disabled provider.
- Invalid base URL/config.
- Health healthy/degraded/unavailable states.

### Acceptance Criteria

- Tests mock HTTP transport.
- No unit test requires real Ollama.
- Provider errors are typed and safe.

### Depends On

```text
PAP-053
PAP-054
```

---

## PAP-061 — Add Runtime Integration Tests

**Goal:** Verify runtime/provider/trace behavior.

### Required Tests

- Successful local-model-test execution.
- Provider-unavailable failure trace.
- Schema-invalid model-output failure trace.
- Provider/model/duration trace metadata.
- No memory write from capability.
- Workspace ID propagates to execution.

### Acceptance Criteria

- Tests use isolated SQLite.
- Tests use fake AIProvider or mocked Ollama transport.
- No test depends on a local installed model.

### Depends On

```text
PAP-057
```

---

## PAP-062 — Add Playwright and QA-Intel Coverage

**Goal:** Validate user-visible model-test behavior.

### Required Playwright Flows

- Provider healthy state renders.
- User runs local-model test with mocked/fake provider.
- User sees validated result.
- User opens trace detail.
- Provider unavailable state shows safe message.

### Required QA-Intel Feature

```gherkin
Feature: Local model execution

  Scenario: User runs a structured local model test
    Given the Personal Agent Platform web app is running
    And the local model provider is available
    When the user submits a local model test prompt
    Then the user should see a validated summary
    And the execution status should be "completed"
    And the trace should include the provider model and duration

  Scenario: Local provider is unavailable
    Given the Personal Agent Platform web app is running
    And the local model provider is unavailable
    When the user submits a local model test prompt
    Then the user should see a safe provider unavailable message
    And the execution status should be "failed"
    And the trace should include provider health evidence
```

### Acceptance Criteria

- Browser tests do not require a real Ollama instance.
- QA-Intel validates visible behavior.
- Failure artifacts include screenshots and traces.

### Depends On

```text
PAP-058
PAP-059
PAP-061
```

---

## 4. Recommended Execution Order

```text
PAP-050
PAP-051
PAP-052

PAP-053
PAP-054
PAP-055

PAP-056
PAP-057

PAP-058
PAP-059

PAP-060
PAP-061
PAP-062
```

---

## 5. Suggested Codex Goal Batches

```text
Goal A:
PAP-050 to PAP-052
Provider contracts, provider-neutral AI package, validated Ollama configuration.

Goal B:
PAP-053 to PAP-055
Ollama HTTP client, provider adapter, provider registry/composition wiring.

Goal C:
PAP-056 to PAP-057
Local-model-test contracts and runtime capability.

Goal D:
PAP-058 to PAP-059
Model-test UI and provider-health status.

Goal E:
PAP-060 to PAP-062
Unit, integration, Playwright, and QA-Intel validation.
```

---

## 6. Phase 3 Definition of Done

Phase 3 is complete when:

- A local Ollama model can be invoked through PAP's runtime.
- The response is requested as schema-constrained JSON.
- PAP independently validates model output with Zod.
- Provider/model/duration/health evidence appears in execution traces.
- Unavailable, overloaded, timed-out, malformed, and schema-invalid responses fail safely.
- The user can manually run a local-model test from the web UI.
- No automatic memory writes occur.
- No SearXNG, scraping, research workflows, browser automation, vector search, email, or document work exists.
- Unit, integration, browser, and QA-Intel tests pass.
