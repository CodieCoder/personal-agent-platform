# PAP-012 to PAP-017 Runtime and Echo Capability

Date: 2026-06-29
Ticket range: PAP-012 to PAP-017
Status: Accepted for implementation

## Summary

Implement the first executable capability slice:

- Capability contracts in `@pap/contracts`.
- In-memory capability registration and lookup in `@pap/runtime`.
- Controlled trace writing through the existing `ExecutionTraceRepository` interface.
- Runtime execution service with request, input, output, and error handling.
- Core echo capability in `@pap/capability-echo`.
- Dependency-injected runtime factory that wires a provided trace repository and provided capabilities.

Build directly on the PAP-008 to PAP-011 SQLite trace repository work. Do not add web, worker, Docker, approval, memory, tool runtime, skill loader, persistent capability registry, or UI behavior in this slice.

## Decisions

- Keep execution statuses limited to `running`, `completed`, `failed`, and `cancelled`; `awaiting_approval` remains deferred.
- Keep `@pap/contracts` dependent on Zod only.
- Keep `@pap/runtime` free of concrete capability imports, Drizzle, `better-sqlite3`, and `@pap/storage-sqlite`.
- Implement PAP-017 as `createRuntime({ traceRepository, capabilities, logger?, clock? })` in `@pap/runtime`, not as a separate `@pap/runtime-bootstrap` package and not as a SQLite-aware composition root.
- Register capabilities in memory for this slice; persistent capability registry tables remain out of scope.
- Generate execution IDs and trace step IDs inside runtime code through `@pap/shared`.
- Trace step sequencing is owned by `TraceWriter` and starts at zero for each execution.
- Runtime-safe errors expose stable platform error codes and messages without raw stack traces.
- Echo is a deterministic core capability with no tools, memory, LLM, network, permissions, or external side effects.
- Echo capability runtime skill files live inside `packages/capabilities/echo/skills/echo/`, not the root `skills/` directory.

## Files

Create:

- `packages/contracts/src/capability.ts`
- `packages/runtime/package.json`
- `packages/runtime/tsconfig.json`
- `packages/runtime/src/capability-registry.ts`
- `packages/runtime/src/errors.ts`
- `packages/runtime/src/execution-service.ts`
- `packages/runtime/src/runtime.ts`
- `packages/runtime/src/trace-writer.ts`
- `packages/runtime/src/index.ts`
- `packages/runtime/test/*.test.mjs`
- `packages/capabilities/echo/package.json`
- `packages/capabilities/echo/tsconfig.json`
- `packages/capabilities/echo/src/manifest.ts`
- `packages/capabilities/echo/src/schemas.ts`
- `packages/capabilities/echo/src/execute.ts`
- `packages/capabilities/echo/src/index.ts`
- `packages/capabilities/echo/skills/echo/SKILL.md`
- `packages/capabilities/echo/skills/echo/skill.manifest.json`
- `packages/capabilities/echo/test/*.test.mjs`

Update:

- `packages/contracts/src/index.ts`
- `packages/contracts/test/contracts.test.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `README.md`
- `AGENTS.md`
- `agents/rules/repository-boundaries.md`
- `agents/skills/repository-bootstrap/SKILL.md`

## Contract Behavior

- `CapabilityManifest` validates id, version, name, description, skill metadata, schema IDs, allowed tools, child capabilities, UI block types, permissions, side effects, approval policy, memory policy, trust level, and tags.
- `CapabilityExecutionRequest` validates capability ID, unknown input payload, optional workspace/thread IDs, source, requested UI flag, and request context.
- `CapabilityExecutionResult` includes execution ID, trace ID, capability ID, status, optional data, UI blocks, approvals, warnings, and optional typed platform error.
- `CapabilityDefinition` includes a manifest, input schema, output schema, and execute function.
- `CapabilityExecutionContext` exposes execution metadata, trace step writing, and explicit no-op-denying surfaces for tools, memory, LLM, UI, and approvals until those subsystems exist.

## Runtime Behavior

- Duplicate registration fails with `CAPABILITY_ALREADY_REGISTERED`.
- Unknown lookup fails with `CAPABILITY_NOT_FOUND`.
- Registry listing returns registered manifests.
- Unknown capability execution fails before trace creation.
- Invalid capability input creates a failed trace.
- Valid capability output completes the trace.
- Invalid output and unhandled errors fail the trace with safe typed errors.
- Trace writer starts traces through `ExecutionTraceRepository`, assigns deterministic sequence numbers, finalizes once, and rejects completion/failure/cancellation after terminal state.

## Echo Behavior

- Manifest id: `capability.echo`.
- Trust level: `core`.
- Allowed tools, child capabilities, UI blocks, and permissions: empty arrays.
- Side effects: `["none"]`.
- Input: `{ message: string }`.
- Output: `{ message: string; echoedAt: string }`.
- Empty or whitespace-only input fails validation.
- Valid input is whitespace-normalized before returning.
- Execution writes one `workflow` trace step.

## Dependencies And Scripts

- Add `@pap/runtime` with dependencies on `@pap/contracts`, `@pap/shared`, and `@pap/storage`.
- Add `@pap/capability-echo` with dependencies on `@pap/contracts` and `@pap/shared`.
- Add package-local scripts: `build`, `typecheck`, `lint`, and `test`.
- Use Node built-in `node --test` against built ESM output, matching current package tests.

## Verification Commands

Run:

```sh
pnpm --filter @pap/contracts test
pnpm --filter @pap/runtime test
pnpm --filter @pap/capability-echo test
pnpm typecheck
pnpm test
pnpm format:check
pnpm lint
```

## Out Of Scope

- No web app, worker app, CLI, standalone API, or UI.
- No Docker or Compose changes.
- No tool registry or tool execution runtime.
- No skill loader.
- No approval flow or `awaiting_approval` status.
- No memory services, memory persistence, vector storage, source profiles, research, email, or document capabilities.
- No persistent capability registry implementation.
- No external services, credentials, network calls, or side-effecting runtime behavior.
