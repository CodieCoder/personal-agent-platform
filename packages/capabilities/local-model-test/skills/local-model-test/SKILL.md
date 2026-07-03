---
name: local-model-test
description: Exercise the configured local model provider with one bounded prompt and validated structured output.
---

# Local Model Test

## Purpose

Run a narrow local model smoke test through the Personal Agent Platform runtime.

## Workflow

1. Validate the input schema.
2. Resolve the fixed provider `provider.ollama`.
3. Check provider health through the runtime.
4. Build the fixed prompt template.
5. Invoke structured generation through the runtime.
6. Validate structured output.
7. Return summary, key points, confidence, provider, and model.

## Rules

- Do not call tools.
- Do not read or write memory.
- Do not browse, search, scrape, send email, upload files, or create UI.
- Do not inject workspace data, prior executions, trace details, or private context.
- Use only the configured healthy model unless the requested model matches that allowlisted model.
- Fail safely when the provider is unavailable or output validation fails.
