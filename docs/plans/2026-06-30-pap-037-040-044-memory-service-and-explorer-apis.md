# PAP-037, PAP-040, and PAP-044 Memory Service and Explorer APIs

Date: 2026-06-30
Status: Accepted for implementation
Tickets: PAP-037, PAP-040, PAP-044

## Summary

Implement a framework-neutral `@pap/memory` package that owns semantic and episodic memory policy,
provenance validation, typed domain errors, and repository access. Wire it into `@pap/runtime` and
TanStack Start server functions, but keep capabilities and web callers away from repositories.

## Key Changes

- Add `packages/memory` with `MemoryService`, `createMemoryService`, memory policy helpers, and
  `MemoryServiceError`.
- Extend memory status contracts/constants with `proposed` and `rejected`; use them only for
  semantic proposal review in this slice.
- Add storage interface/SQLite repository methods for semantic proposal transitions: approve,
  reject, and status-safe mutation helpers. Keep SQLite access inside `@pap/storage-sqlite`.
- Add runtime memory injection: `createRuntime({ memoryService })` exposes service-backed
  `context.memory` methods, checks `memory.read` / `memory.write`, and records `kind: "memory"`
  trace steps.
- Add web Memory Explorer server functions only, no UI:
  `listSemanticMemory`, `listEpisodicMemory`, `getMemoryRecord`, `createManualSemanticMemory`,
  `updateSemanticMemory`, `supersedeSemanticMemory`, `expireMemoryRecord`, `deleteMemoryRecord`,
  `listProposedSemanticMemory`, `approveSemanticMemoryProposal`, and
  `rejectSemanticMemoryProposal`.

## Behavior Rules

- Manual user semantic writes create active records and are treated as reviewed, including sensitive
  records.
- Capability/system semantic writes require provenance. Confidence below `0.4` is rejected;
  `0.4` through `0.89`, sensitive, inferred, or long-lived writes become `proposed`; only
  low/moderate, high-confidence, clearly sourced writes may become active automatically.
- Approving a proposed semantic record marks it `active`. If it supersedes another record, approval
  transactionally marks the old record `superseded` and links both records.
- Rejecting a proposed semantic record marks it `rejected`; rejected, proposed, deleted, expired,
  and superseded records are excluded from default lists.
- Expiry is explicit and query-aware: expired timestamps are excluded by default, and "expire now"
  sets `status: "expired"`.
- Delete is soft delete only: set `status: "deleted"`; no hard delete or bulk delete.
- Episodic writes are active only. Automatic execution episodes require execution ID, event type,
  bounded safe summary, low/moderate sensitivity, confidence, and provenance.
- Any supplied `sourceExecutionId` or episodic `executionId` must exist in
  `ExecutionTraceRepository`; capability, workspace, and thread links must not contradict that
  trace.
- Capability code receives only `context.memory`; no capability imports or receives repositories.

## Tests

- Add isolated-SQLite `@pap/memory` tests for manual semantic create, proposal, approval,
  rejection, supersede-on-approval, expiry, soft delete, provenance enforcement, execution mismatch
  errors, and episodic execution writes.
- Add runtime tests proving memory permission checks, service-backed context methods, no repository
  exposure to capabilities, and memory trace steps.
- Add server-function tests or focused integration coverage for safe validation/error mapping using
  temporary SQLite.
- Run:
  `pnpm --filter @pap/contracts test`
  `pnpm --filter @pap/memory test`
  `pnpm --filter @pap/runtime test`
  `pnpm --filter @pap/storage-sqlite test`
  `pnpm --filter @pap/web typecheck`
  `pnpm test:unit`
  `pnpm test:integration`
  `pnpm typecheck`

## Assumptions

- Memory proposal approval/rejection is memory-local review, not the broader external side-effect
  approval system.
- No Memory Explorer UI, workspace UI, memory tools, vector search, Ollama, SearXNG, scraping,
  external-side-effect approvals, or generative UI are added.
- Server functions may expose memory mutations, but every mutation goes through `MemoryService`.
