Personal Agent Platform — Phase 2 Storage, Memory, and Trace Backlog

Status: Execution Backlog
Depends on:

- 01-product-foundation.md
- 02-product-principles.md
- 04-runtime-and-contracts.md
- 07-memory-model.md
- 14-roadmap.md
- 15-architecture-decision-records.md
- 16-repository-bootstrap-plan.md
- backlogs/17-phase-0-1-backlog.md

Purpose: Add workspace records, semantic memory, episodic memory, memory policy, trace filtering, and a visible Memory Explorer before introducing Ollama, vector search, SearXNG, scraping, or research capability workflows.

⸻

1. Phase Objective

Phase 2 makes the platform capable of storing and inspecting useful personal/project context.

The completed vertical slice should be:

Workspace
→ semantic memory
→ episodic memory
→ provenance and confidence
→ memory service
→ Memory Explorer API
→ Memory Explorer UI
→ trace filtering/history

The phase must not add:

Ollama
Embeddings
Vector database
SearXNG
Scraping
Research capability
Email
Document upload
Approval workflow
Generative UI blocks
External APIs

⸻

2. Phase Exit Criteria

Phase 2 is complete when the user can:

Create and view a workspace.
Create and inspect semantic memory.
Create and inspect episodic memory.
View provenance, confidence, scope, status, and expiry.
Edit or delete memory records.
Filter memory by scope, workspace, type, status, and capability.
View execution history and filter traces by capability/status/date.
See a memory record linked to its source execution where applicable.

⸻

Milestone 2.1 — Workspace Foundation

PAP-032 — Add Workspace Contracts

Goal: Define workspace contracts in @pap/contracts.

Scope

Workspace schema
Workspace status schema
Workspace type/schema
Workspace create/update request schemas
Workspace summary schema

Required Fields

id
name
description
status
createdAt
updatedAt
archivedAt nullable

Acceptance Criteria

Workspace IDs are validated.
Name is required and bounded.
Status supports active and archived.
Contracts remain framework-independent.
No storage implementation is added in this ticket.

Validation

pnpm --filter @pap/contracts test
pnpm --filter @pap/contracts typecheck

Depends On

PAP-004
PAP-012

⸻

PAP-033 — Add Workspace SQLite Schema and Repository

Goal: Persist workspaces.

Scope

Add workspaces table.
Create Drizzle schema.
Generate migration.
Add WorkspaceRepository interface.
Add SQLite implementation.
Add create/get/list/update/archive methods.

Required Table Fields

id
name
description
status
created_at
updated_at
archived_at nullable

Acceptance Criteria

Migration creates workspaces table.
Workspace can be created and retrieved.
Archived workspaces are excluded from default list.
Workspace repository does not leak Drizzle types.
Workspace tests use temporary SQLite database.

Validation

pnpm db:generate
pnpm db:migrate
pnpm --filter @pap/storage-sqlite test

Depends On

PAP-006
PAP-008
PAP-032

⸻

PAP-034 — Add Workspace Management UI

Goal: Provide minimal workspace creation and selection.

Scope

Workspace list screen.
Create workspace form.
Workspace detail route.
Archive workspace action.
Workspace selector reusable component.

Constraints

No team/org support.
No complex permissions.
No workspace settings engine.
No project knowledge retrieval yet.

Acceptance Criteria

User can create workspace.
User can select active workspace.
Archived workspace is visually distinct.
Workspace survives page refresh.
Invalid workspace ID shows safe not-found state.

Depends On

PAP-018
PAP-033

⸻

Milestone 2.2 — Semantic Memory

PAP-035 — Add Semantic Memory Contracts

Goal: Define durable fact records.

Scope

SemanticMemoryRecord schema.
Memory scope schema.
Memory status schema.
Sensitivity schema.
Confidence schema.
Semantic memory create/update request schemas.

Required Memory Scopes

personal
workspace
capability
thread

Required Statuses

active
superseded
expired
deleted

Required Provenance Fields

sourceType
sourceRef nullable
sourceExecutionId nullable
evidenceRefs
confidence
sensitivity
createdAt
updatedAt
expiresAt nullable

Acceptance Criteria

Semantic memory must include subject, predicate, and value.
Confidence is restricted to 0 through 1.
Scope rules are validated.
Deleted memory remains auditable in storage contract.
No vector search is added.

Depends On

PAP-004
PAP-012

⸻

PAP-036 — Add Semantic Memory SQLite Schema and Repository

Goal: Persist semantic memory.

Scope

Add semantic_memory table.
Add indexes for scope, workspace, capability, status, and subject.
Add repository interface.
Add SQLite implementation.
Add create/get/list/update/supersede/delete methods.

Required Table Fields

id
scope
workspace_id nullable
capability_id nullable
thread_id nullable
subject
predicate
value_json
confidence
sensitivity
source_type
source_ref nullable
source_execution_id nullable
evidence_refs_json
status
created_at
updated_at
expires_at nullable

Acceptance Criteria

Semantic memory supports personal and workspace scope.
Superseding a record preserves the old record.
Soft deletion marks status deleted.
Expired records are excluded from default active retrieval.
Repository returns typed domain records, not raw SQL rows.

Depends On

PAP-006
PAP-035

⸻

PAP-037 — Add Semantic Memory Service and Policy

Goal: Centralize semantic memory writes and reads.

Scope

MemoryService interface.
Semantic read API.
Create semantic record.
Propose semantic record.
Update semantic record.
Supersede semantic record.
Delete semantic record.
Basic policy evaluator.

Initial Policy Rules

Manual writes are allowed.
System-proposed long-term facts are stored as proposed records.
Low-confidence inferred facts cannot become active automatically.
Sensitive semantic memory requires proposal/review state.
Capabilities cannot write directly to repositories.

Acceptance Criteria

All writes pass through MemoryService.
Low-confidence automatic writes are rejected.
Semantic record can be proposed without being active.
Memory service records source execution ID when supplied.
Repository access remains behind memory service in runtime-facing code.

Depends On

PAP-036
PAP-015

⸻

Milestone 2.3 — Episodic Memory

PAP-038 — Add Episodic Memory Contracts

Goal: Define event/outcome records.

Scope

EpisodicMemoryRecord schema.
Event type schema.
Outcome schema.
Related entity schema.
Episode create request schema.
Episode query schema.

Required Fields

id
scope
workspaceId nullable
capabilityId nullable
threadId nullable
executionId nullable
eventType
summary
outcome nullable
relatedEntities
evidenceRefs
confidence
sensitivity
createdAt
expiresAt nullable

Acceptance Criteria

Episode can be tied to an execution.
Episode can be tied to a workspace.
Episode accepts related entity IDs.
Episode stores evidence references.
No automatic semantic consolidation is added.

Depends On

PAP-004
PAP-012

⸻

PAP-039 — Add Episodic Memory SQLite Schema and Repository

Goal: Persist task events and outcomes.

Scope

Add episodic_memory table.
Add indexes for execution, workspace, capability, event type, created time.
Add repository interface.
Add SQLite implementation.
Add create/get/list/delete methods.

Acceptance Criteria

Episode can link to execution trace.
Episodes list in descending created time.
Workspace filter works.
Capability filter works.
Deleted records are excluded by default.

Depends On

PAP-006
PAP-038

⸻

PAP-040 — Add Episodic Memory Service

Goal: Add policy-aware episode writes.

Scope

Create episode write method.
Create episode query method.
Create execution-linked episode helper.
Add safe summary validation.
Add evidence/source validation.

Initial Automatic Write Rule

A completed capability may write low-risk episodic memory only when:

- it has an execution ID,
- the record has a clear event type,
- the summary is safe and bounded,
- sensitivity is low or moderate,
- source/provenance is supplied.

Acceptance Criteria

Echo capability can optionally write a low-risk execution episode in a test-only scenario.
Episode writes appear in trace.
Invalid episode write is rejected safely.
Episode repository is not called directly by capability code.

Depends On

PAP-037
PAP-039

⸻

Milestone 2.4 — Memory Retrieval and Context Tools

PAP-041 — Add Memory Query Contracts

Goal: Define typed filtering and retrieval requests.

Scope

Memory list query schema.
Memory scope filter.
Workspace filter.
Capability filter.
Thread filter.
Status filter.
Sensitivity filter.
Confidence range filter.
Date range filter.
Pagination schema.

Acceptance Criteria

Semantic and episodic queries remain separate.
All filters are optional and bounded.
Default query excludes deleted and expired records.
No full-text or vector search is added.

Depends On

PAP-035
PAP-038

⸻

PAP-042 — Add tool.workspace.context

Goal: Retrieve bounded workspace context for future capabilities.

Scope

Tool manifest.
Input schema.
Output schema.
Workspace lookup.
Pinned active semantic memory retrieval.
Recent related episodes retrieval.
Trace event integration.

Output Must Include

Workspace metadata.
Active workspace facts.
Recent relevant episodes.
No raw deleted/expired records.

Constraints

No LLM.
No vector retrieval.
No broad memory dump.
Maximum record limits required.

Acceptance Criteria

Tool only reads declared workspace scope.
Tool returns bounded context.
Missing workspace produces typed error.
Tool call appears in trace.

Depends On

PAP-033
PAP-036
PAP-039
PAP-041

⸻

PAP-043 — Add tool.memory.search

Goal: Add structured memory search without embeddings.

Scope

Tool manifest.
Typed query input.
Semantic memory filters.
Episodic memory filters.
SQLite FTS preparation only if required.
Result ranking by scope, status, confidence, and recency.

Initial Search Behavior

1. Exact subject/predicate match where applicable.
2. Workspace and capability filtering.
3. Optional SQLite FTS for summary/title fields.
4. Confidence and recency ordering.
5. Return bounded result set.

Constraints

No embeddings.
No vector DB.
No Supabase.
No Python service.

Acceptance Criteria

Tool returns only active non-expired records by default.
Workspace-scoped query cannot return unrelated workspace records.
Result limits are enforced.
Search trace is recorded.

Depends On

PAP-041
PAP-042

⸻

Milestone 2.5 — Memory Explorer and Trace History

PAP-044 — Add Memory Explorer Server APIs

Goal: Expose safe server-side memory queries and mutations.

Scope

List semantic memory.
List episodic memory.
Get memory record by ID.
Create manual semantic memory.
Edit semantic memory.
Supersede semantic memory.
Delete memory record.
List proposed memory records.
Approve/reject proposed semantic memory.

Constraints

Server functions/routes only.
No client-side direct database access.
No auth model beyond local single-user mode.
No bulk destructive actions.

Acceptance Criteria

All mutations use MemoryService.
Deleted records are not shown by default.
Invalid IDs return safe errors.
Proposed memory can be approved/rejected.

Depends On

PAP-037
PAP-040
PAP-041

⸻

PAP-045 — Build Memory Explorer UI

Goal: Make memory inspectable and reversible.

Screens

/memory
/memory/semantic
/memory/episodes
/memory/$memoryId

Required UI Features

Memory type tabs.
Scope filter.
Workspace filter.
Status filter.
Confidence display.
Sensitivity display.
Provenance display.
Source execution link.
Edit semantic memory.
Delete memory.
Approve/reject proposed memory.

Acceptance Criteria

User can browse semantic and episodic memory.
User can open a record and inspect provenance.
User can edit semantic memory.
User can delete a memory record.
User can follow execution link where one exists.
No raw sensitive payload is exposed by default.

Depends On

PAP-044

⸻

PAP-046 — Add Trace History Filtering

Goal: Make executions useful as historical evidence.

Scope

Filter executions by capability.
Filter executions by status.
Filter executions by date range.
Filter executions by workspace.
Paginate execution history.
Add execution list UI filters.

Constraints

No advanced observability dashboard.
No analytics aggregation.
No external logging provider.

Acceptance Criteria

User can filter echo executions by completed/failed status.
Execution list remains ordered by most recent.
Filter state is reflected in URL query parameters.
Execution detail remains accessible from filtered list.

Depends On

PAP-011
PAP-034
PAP-045

⸻

Milestone 2.6 — Tests and Behavior Validation

PAP-047 — Add Memory Unit and Integration Tests

Goal: Verify memory rules, persistence, and scope boundaries.

Required Tests

Create semantic memory.
Create episodic memory.
Reject confidence outside 0–1.
Exclude deleted memory by default.
Exclude expired memory by default.
Supersede semantic record.
Workspace filter isolation.
Proposed semantic memory approval.
Execution-linked episode retrieval.

Acceptance Criteria

Tests use isolated temporary SQLite database.
No test depends on existing local pap.db.
Memory repositories and services are covered.

Depends On

PAP-036
PAP-037
PAP-039
PAP-040

⸻

PAP-048 — Add Playwright Memory Explorer Tests

Goal: Validate real browser memory behavior.

Required Scenarios

Create workspace.
Create semantic memory.
View semantic memory.
Edit semantic memory.
View episodic memory.
Open source execution from episode.
Delete semantic memory.
Filter memory by workspace.

Acceptance Criteria

Tests run against isolated database.
No test relies on echo seed data from another test.
Screenshots/traces are captured on failure.

Depends On

PAP-045
PAP-046

⸻

PAP-049 — Add QA-Intel Memory Behavior Features

Goal: Validate memory behavior through user-visible evidence.

Required Feature Scenarios

Feature: Memory Explorer
Scenario: User stores and inspects project context
Given the Personal Agent Platform web app is running
And a workspace named "QA Intel" exists
When the user creates semantic memory for "QA Intel"
Then the memory should appear in the workspace memory list
And the memory should show provenance and confidence
Scenario: User reviews an execution-linked episode
Given an echo execution has completed
And an episodic memory record exists for that execution
When the user opens the episode
Then the user should see the linked execution trace

Acceptance Criteria

QA-Intel scenarios pass locally.
Failures include screenshots and fix hints.
Scenarios verify UI-visible behavior, not implementation internals.

Depends On

PAP-048

⸻

3. Recommended Execution Order

PAP-032
PAP-033
PAP-034
PAP-035
PAP-036
PAP-037
PAP-038
PAP-039
PAP-040
PAP-041
PAP-042
PAP-043
PAP-044
PAP-045
PAP-046
PAP-047
PAP-048
PAP-049

⸻

4. Suggested Codex Goal Batches

Goal A:
PAP-032 to PAP-034
Workspace contracts, persistence, and basic UI.
Goal B:
PAP-035 to PAP-037
Semantic memory contracts, storage, and memory service.
Goal C:
PAP-038 to PAP-040
Episodic memory contracts, storage, and memory service.
Goal D:
PAP-041 to PAP-043
Memory query contracts and bounded context/search tools.
Goal E:
PAP-044 to PAP-046
Memory Explorer and trace history filters.
Goal F:
PAP-047 to PAP-049
Tests, Playwright, and QA-Intel behavior validation.

⸻

5. Phase 2 Definition of Done

Phase 2 is complete when:

Workspaces exist and can be selected.
Semantic and episodic memory are stored separately.
Every memory record has scope, provenance, confidence, status, and timestamps.
Deleted and expired records are excluded by default.
Semantic memory can be edited, superseded, proposed, approved, and deleted.
Episodes can link to executions.
Memory Explorer provides visible inspection and controls.
Trace history can be filtered.
Context and memory-search tools return bounded, scoped results.
Unit, integration, browser, and QA-Intel tests pass.
No vectors, embeddings, Ollama, SearXNG, scraping, email, document analysis, or approval flows are introduced.
