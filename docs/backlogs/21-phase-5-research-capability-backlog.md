# Personal Agent Platform — Phase 5 Research Capability Backlog

**Status:** Draft execution backlog

**Depends on:**
- `01-product-foundation.md`
- `02-product-principles.md`
- `04-runtime-and-contracts.md`
- `05-capability-system.md`
- `06-tool-system.md`
- `07-memory-model.md`
- `08-policy-and-approval-model.md`
- `15-architecture-decision-records.md`
- `19-phase-3-ollama-provider-backlog.md`
- `20-phase-4-search-and-web-extraction-backlog.md`

**Purpose:** Build PAP's first useful end-to-end workflow: a manually run, source-backed research capability that searches, selects, extracts, ranks, analyzes, cites, and reports on public web sources.

---

## 1. Phase Objective

Phase 5 turns PAP's deterministic search/extraction tools and structured Ollama provider into a useful research workflow.

Completed vertical slice:

```text
User submits a research request
→ PAP validates the request and resolves workspace context
→ deterministic query plan is produced
→ SearXNG searches
→ candidate sources are normalized and deduplicated
→ selected sources are fetched and extracted
→ Ollama ranks source relevance
→ Ollama analyzes selected sources with schema-constrained outputs
→ PAP generates a source-backed research report
→ user inspects report, sources, citations, warnings, and trace
→ optional high-confidence memory is proposed, never activated automatically
```

This phase must not add:

- Recurring schedules or watchlists
- Background monitoring
- Email integration
- Document ingestion
- Browser automation
- Crawlee or Firecrawl
- Automated publishing or sending
- Generic chat agent UI
- Automatic active semantic-memory writes
- Vector retrieval or embeddings
- Multi-agent orchestration
- Cloud LLM providers
- Generative UI blocks

---

## 2. Product Rules

- Search, fetch, and extraction remain deterministic tools.
- LLMs may rank, analyze, group, and synthesize only extracted source content.
- Raw search snippets are not sufficient evidence for factual claims in reports.
- Every substantive report claim must cite one or more extracted sources.
- Citations must refer to PAP source/evidence records, not fabricated URLs.
- The model must not invent sources, URLs, titles, publication dates, or quotations.
- Sources remain untrusted input and cannot authorize actions, alter policy, or override system instructions.
- Reports must clearly distinguish sourced facts, model synthesis, and uncertainty.
- Memory created from research is proposed by default and must retain source execution/evidence provenance.
- No research result is published, sent, or externally shared in this phase.

---

## 3. Proposed Package Boundaries

```text
packages/
  contracts/
    research.ts
    citation.ts
    report.ts

  research/
    query-planner.ts
    source-selector.ts
    source-deduplication.ts
    relevance-ranker.ts
    article-analyzer.ts
    report-synthesizer.ts
    citation-validator.ts
    errors.ts
    index.ts

  capabilities/
    research/
      SKILL.md
      schemas.ts
      capability.ts
      prompts.ts
      index.ts

  storage/
    interfaces/
      research-report-repository.ts
      research-source-repository.ts

  storage-sqlite/
    schema/
      research-reports.ts
      research-sources.ts
    repositories/
      research-report-repository.ts
      research-source-repository.ts

apps/
  web/
    src/features/research/
      server.ts
      routes.ts
      components/
```

### Boundary Rules

`@pap/research`

- Orchestrates deterministic research stages and calls abstractions.
- Uses `@pap/ai`, search, fetch/extraction, memory, trace, and storage interfaces.
- Never directly imports Ollama or SearXNG transports.
- Never makes browser-side requests.
- Never writes active semantic memory directly.

`@pap/capability-research`

- Defines user-facing input/output contracts, prompts, and capability behavior.
- Uses `@pap/research` only.
- Does not own persistence or provider transport.

`@pap/storage` and `@pap/storage-sqlite`

- Persist report/source records and their execution/workspace links.
- Do not contain LLM prompts, ranking, synthesis, or policy logic.

---

# Milestone 5.1 — Research Contracts and Persistence

## PAP-078 — Add Research Request, Source, Citation, and Report Contracts

**Goal:** Define provider-neutral, user-facing research contracts in `@pap/contracts`.

### Scope

- Research request schema.
- Research mode/schema.
- Query-plan schema.
- Candidate source schema.
- Selected source schema.
- Source analysis schema.
- Citation schema.
- Research finding schema.
- Research report schema.
- Report status and warning schema.
- Research error schema.

### Required Research Request Fields

```text
question
workspaceId nullable
focus nullable
timeRange nullable
maxSources nullable
maxSearchResults nullable
language nullable
categories nullable
memoryProposalMode nullable
```

### Required Report Fields

```text
id
executionId
workspaceId nullable
question
summary
findings
sources
citations
limitations
warnings
status
createdAt
completedAt nullable
```

### Required Citation Fields

```text
citationId
sourceId
sourceTitle
sourceUrl
evidenceId
claimText
sourceExcerpt nullable
```

### Acceptance Criteria

- All contracts use Zod.
- Source and citation IDs are explicit and stable.
- Claims cannot cite unknown source IDs.
- Limits are bounded.
- Research report schema distinguishes findings, citations, limitations, and warnings.
- No implementation or storage is added.

### Depends On

```text
PAP-050
PAP-063
PAP-068
```

---

## PAP-079 — Add Research Report and Source Persistence

**Goal:** Persist reports, source selection, analysis state, citations, and execution links.

### Scope

- Research reports table and migration.
- Research sources table and migration.
- Repository interfaces.
- SQLite implementations.
- Create/get/list report methods.
- Report status updates.
- Source/evidence/citation linkage.
- Workspace and execution filtering.

### Required Report Fields

```text
id
execution_id
workspace_id nullable
question
summary_json
findings_json
limitations_json
warnings_json
status
created_at
completed_at nullable
```

### Required Source Fields

```text
id
report_id
execution_id
workspace_id nullable
evidence_id nullable
url
final_url nullable
title nullable
published_at nullable
selection_rank nullable
relevance_score nullable
analysis_json nullable
citation_ids_json
status
created_at
updated_at
```

### Constraints

- Preserve execution and workspace isolation.
- Do not persist full raw HTML.
- Persist only bounded normalized extracted content references/evidence IDs.
- Do not persist chain-of-thought or hidden model reasoning.
- Use additive migrations.

### Acceptance Criteria

- Reports can be listed by workspace and execution.
- Sources are linked to report and evidence records.
- Reports persist citations and warnings.
- Missing/invalid source linkage fails safely.
- Repository tests use temporary SQLite databases.

### Depends On

```text
PAP-072
PAP-078
```

---

# Milestone 5.2 — Deterministic Research Preparation

## PAP-080 — Implement Deterministic Query Planning

**Goal:** Convert one research request into a bounded, inspectable query plan without using an LLM.

### Scope

- Query normalization.
- Optional focus/time-range expansion.
- Search query generation rules.
- Duplicate query removal.
- Max-query limit.
- Query-plan warnings.

### Initial Query Planning Rules

```text
1. Normalize whitespace and punctuation.
2. Use the user question as the primary query.
3. Add deterministic variants for declared focus/time range only.
4. Add category/time parameters where supported.
5. Remove duplicate normalized queries.
6. Enforce a small maximum query count.
7. Return the plan as trace-visible data.
```

### Acceptance Criteria

- Same request produces the same plan.
- No model call occurs.
- Query plan is bounded.
- Empty or unsafe input fails safely.
- Plan is visible in trace metadata.

### Depends On

```text
PAP-078
PAP-065
```

---

## PAP-081 — Implement Candidate Source Normalization and Deduplication

**Goal:** Produce a clean candidate pool from search outputs.

### Scope

- URL canonicalization.
- Duplicate URL detection.
- Normalized-hostname grouping.
- Title/snippet cleanup.
- Result provenance preservation.
- Candidate source limits.
- Basic source-quality warnings.

### Acceptance Criteria

- Duplicate canonical URLs are collapsed deterministically.
- Search engine provenance remains attached.
- Candidate order is stable.
- Duplicate handling is visible in trace metadata.
- No model call occurs.

### Depends On

```text
PAP-080
PAP-065
```

---

## PAP-082 — Implement Deterministic Source Selection and Extraction Budget

**Goal:** Select a bounded initial set of candidates to fetch/extract before LLM relevance ranking.

### Scope

- Source-count limit.
- Domain diversity preference.
- URL uniqueness.
- Optional recency preference when publication date exists.
- Extraction budget.
- Failed-source continuation behavior.

### Initial Selection Policy

```text
1. Start from normalized candidate order.
2. Prefer unique canonical URLs.
3. Prefer a minimum domain diversity where candidates permit.
4. Respect max source/extraction budget.
5. Continue when individual extraction fails.
6. Persist source status and warnings.
```

### Acceptance Criteria

- Selection is deterministic.
- No model call occurs.
- A single failed source does not fail the whole research request.
- Selection and exclusion reasons are trace-visible.

### Depends On

```text
PAP-081
PAP-074
```

---

# Milestone 5.3 — Model-Guided Relevance and Analysis

## PAP-083 — Add Structured Source Relevance Ranking

**Goal:** Use local Ollama to score extracted sources against the research question.

### Scope

- Ranking prompt template.
- Structured ranking output schema.
- Per-source relevance score and reason.
- Relevance threshold.
- Source ranking/final-selection policy.
- Provider failure behavior.

### Required Ranking Output Fields

```text
sourceId
relevanceScore
relevanceLabel
reason
recommendedForSynthesis
```

### Constraints

- Ranking only sees the research question and bounded extracted source metadata/content.
- Ranking does not choose arbitrary URLs.
- Ranking may only rank sources already extracted.
- Ranking output is schema-validated.
- Ranking reasons are short and not treated as factual evidence.

### Acceptance Criteria

- Model output is constrained and independently validated.
- Invalid ranking output produces safe typed failure or source-level warning.
- Selected sources remain traceable to extracted evidence.
- Ranking score/reason is persisted with the source.
- No report generation occurs in this ticket.

### Depends On

```text
PAP-054
PAP-082
```

---

## PAP-084 — Add Structured Article Analysis

**Goal:** Extract report-ready facts and caveats from each selected source.

### Scope

- Article-analysis prompt template.
- Structured source analysis schema.
- Key points.
- Claims with evidence excerpts.
- Publication/date confidence.
- Caveats and source limitations.
- Bounded quote/excerpt capture.

### Required Analysis Output Fields

```text
sourceId
summary
keyPoints
claims
caveats
publicationDateConfidence nullable
```

### Required Claim Fields

```text
claimText
evidenceExcerpt
confidence
```

### Constraints

- Claims must remain linked to the source ID.
- Evidence excerpts are bounded.
- The model may not cite another source from inside one source analysis.
- Analysis may not create memory.
- Hidden reasoning is not stored.

### Acceptance Criteria

- Analysis output is schema-validated.
- Every extracted claim contains source-local evidence.
- Low-confidence/insufficient evidence is represented as caveat or warning.
- Provider failure does not expose raw model output by default.
- Source analysis is persisted.

### Depends On

```text
PAP-083
```

---

## PAP-085 — Implement Citation Validation and Report Synthesis

**Goal:** Build a source-backed report with validated citations.

### Scope

- Report synthesis prompt template.
- Structured report output schema.
- Citation validator.
- Citation/source consistency checks.
- Unsupported-claim rejection or downgrade.
- Report limitation/warning generation.

### Report Rules

```text
- Every substantive finding must include one or more source citation IDs.
- Citation IDs must exist in selected analyzed sources.
- Citation claim text must be consistent with cited source analysis.
- If a claim has no valid evidence, omit it or add it only as clearly labeled uncertainty.
- Report must include limitations and source coverage notes.
- Do not present model judgment as a verified fact without citation.
```

### Acceptance Criteria

- Report output is schema-validated.
- Citation validator rejects unknown source IDs.
- Report cannot include uncited substantive findings.
- Report persists summary, findings, citations, limitations, warnings, and completion status.
- Report includes source count and failed-source information where applicable.
- No automatic memory activation is added.

### Depends On

```text
PAP-079
PAP-084
```

---

# Milestone 5.4 — Capability and Proposed Memory

## PAP-086 — Implement `capability.research`

**Goal:** Run the full manual research pipeline through PAP's runtime.

### Capability ID

```text
capability.research
```

### Input

```text
question
workspaceId nullable
focus nullable
timeRange nullable
maxSources nullable
language nullable
categories nullable
memoryProposalMode nullable
```

### Required Trace Steps

```text
validate input
resolve workspace context
plan queries
search web
normalize candidates
select extraction budget
fetch and extract sources
rank relevance
analyze selected sources
validate citations
synthesize report
persist report
propose memory if eligible
finalize execution
```

### Failure Behavior

```text
- Search unavailable: fail safely with provider evidence.
- Some source fetches fail: continue if sufficient usable sources remain.
- Model ranking/analysis fails: fail safely or produce clearly scoped partial report only if report-contract rules are met.
- Citation validation failure: report must not complete as successful.
- No usable sources: fail safely with source/extraction diagnostics.
```

### Acceptance Criteria

- Capability runs through RuntimeExecutionService.
- All external/tool/model stages are trace-visible.
- Partial source failures are recorded as warnings.
- Final report is persisted and execution-linked.
- No generic chat or autonomous loop is added.
- No direct transport/provider imports exist in capability package.

### Depends On

```text
PAP-085
```

---

## PAP-087 — Add Proposed Research Memory Policy

**Goal:** Allow high-confidence, attributable research outcomes to be proposed for review.

### Scope

- Research memory proposal eligibility.
- Proposal schema.
- Source execution/evidence provenance attachment.
- Workspace-scoped proposal creation.
- Duplicate/proposal suppression rules.
- User-visible rationale fields.

### Initial Rules

```text
A research result may create proposed semantic memory only when:
- memoryProposalMode is enabled,
- report completed successfully,
- proposed fact has at least one valid citation,
- source execution and evidence IDs are attached,
- sensitivity is low or moderate,
- confidence meets configured threshold,
- no conflicting active fact is detected.
```

### Constraints

- Proposed memory must not become active automatically.
- No episodic memory should be created solely to duplicate report persistence.
- Existing MemoryService remains the only memory write boundary.

### Acceptance Criteria

- Proposal failure does not fail a completed report.
- Proposed memory is linked to report, execution, workspace, and citation/evidence.
- Duplicate/conflict conditions create warning, not unsafe overwrite.
- No active memory is written automatically.

### Depends On

```text
PAP-037
PAP-085
PAP-086
```

---

# Milestone 5.5 — Research Web Experience and Validation

## PAP-088 — Add Research Request and Report UI

**Goal:** Provide a manual research workflow in the web app.

### Routes

```text
/research
/research/$reportId
```

### Required UI

- Research question form.
- Optional workspace selector.
- Focus, time-range, source-count, category controls.
- Explicit “propose memory” option.
- Running/pending/error states.
- Report summary.
- Findings with source citations.
- Source list with extraction status, relevance, and warnings.
- Limitations and coverage notes.
- Report trace link.
- Memory proposal status when enabled.

### Constraints

- No chat interface.
- No auto-run schedules.
- No report editing/publishing/export in this phase.
- No browser-side calls to Ollama, SearXNG, or public websites.
- Do not expose hidden model reasoning.

### Acceptance Criteria

- User can submit a manual research request.
- User can inspect report, citations, sources, warnings, limitations, and trace.
- Failed/partial work has clear safe status.
- Proposed memory state is visible without auto-approval.
- UI preserves current trace-first style.

### Depends On

```text
PAP-086
PAP-087
```

---

## PAP-089 — Add Research Unit and Integration Tests

**Goal:** Validate deterministic stages, model schema boundaries, citation integrity, persistence, and memory proposal behavior.

### Required Unit Tests

- Deterministic query plan.
- Query deduplication.
- Candidate URL canonicalization/deduplication.
- Extraction-budget and domain-diversity selection.
- Ranking schema validation.
- Article analysis schema validation.
- Citation validator rejects unknown/mismatched source IDs.
- Report validator rejects uncited substantive findings.
- Memory proposal eligibility and suppression.
- Safe handling of partial source failures.

### Required Integration Tests

- Successful research execution with fake search/fetch/AI providers.
- Search unavailable failure trace.
- Partial fetch failure with successful bounded report.
- No usable source failure.
- Citation-validation failure.
- Report/source/evidence persistence.
- Workspace isolation.
- Proposed-memory creation with provenance.
- No automatic active memory write.

### Acceptance Criteria

- Tests use fake/mocked providers and isolated SQLite databases.
- No test requires live SearXNG, Ollama, or public sites.
- No test depends on previous test data.
- Trace ordering and safe error mapping are asserted.

### Depends On

```text
PAP-087
```

---

## PAP-090 — Add Playwright and QA-Intel Research Coverage

**Goal:** Validate visible research behavior end-to-end.

### Required Playwright Flows

- User submits a research request with mocked providers.
- User sees report summary and cited findings.
- User opens source information and execution trace.
- Partial source failure displays warning while report remains usable.
- Provider unavailable state displays safe error.
- Research report is workspace-isolated.
- Proposed memory state appears and remains pending review.

### Required QA-Intel Feature

```gherkin
Feature: Source-backed research

  Scenario: User runs research and reviews cited findings
    Given the Personal Agent Platform web app is running
    And local search and model providers are available
    When the user requests research about "local AI engineering opportunities"
    Then the user should see a completed research report
    And each substantive finding should show a source citation
    And the report should show source coverage and limitations
    And the execution trace should include search, extraction, ranking, analysis, and citation validation

  Scenario: Research continues after one source fails
    Given the Personal Agent Platform web app is running
    And one selected source cannot be fetched
    When the user requests research about "local AI engineering opportunities"
    Then the user should see a completed or partial report with a source warning
    And the failed source should be visible in report diagnostics

  Scenario: Research proposes, but does not activate, memory
    Given a successful workspace-scoped research report with valid citations
    When the user enables memory proposals
    Then the user should see a pending memory proposal
    And no active semantic memory should be created automatically
```

### Acceptance Criteria

- Browser and QA tests use mocked/fake providers.
- Tests do not require live SearXNG, Ollama, or public URLs.
- User-visible behavior and trace evidence are asserted.
- Failure artifacts include screenshots and traces.
- Fixture databases are isolated.

### Depends On

```text
PAP-088
PAP-089
```

---

## 4. Recommended Execution Order

```text
PAP-078
PAP-079

PAP-080
PAP-081
PAP-082

PAP-083
PAP-084
PAP-085

PAP-086
PAP-087

PAP-088
PAP-089
PAP-090
```

---

## 5. Suggested Codex Goal Batches

```text
Goal A:
PAP-078 to PAP-079
Research/report/citation contracts and persistence.

Goal B:
PAP-080 to PAP-082
Deterministic query planning, candidate normalization, source selection and extraction budget.

Goal C:
PAP-083 to PAP-085
Structured relevance ranking, article analysis, citation validation, and report synthesis.

Goal D:
PAP-086 to PAP-087
Research capability and policy-governed proposed-memory creation.

Goal E:
PAP-088 to PAP-090
Research UI, unit/integration tests, Playwright, and QA-Intel validation.
```

---

## 6. Phase 5 Definition of Done

Phase 5 is complete when:

- A user can run a manual workspace-scoped research request.
- PAP deterministically plans queries, searches local SearXNG, normalizes results, and extracts a bounded source set.
- Ollama ranks and analyzes only extracted source material using schema-constrained outputs.
- PAP produces a persisted report with source-backed findings, valid citations, source diagnostics, limitations, and warnings.
- Every substantive report finding is citation-validated against selected analyzed sources.
- Reports, sources, evidence, and execution traces are linked and workspace-isolated.
- Partial source failures are visible and handled safely.
- Eligible research outcomes can create proposed, never automatically active, semantic memory with report/execution/evidence provenance.
- No scheduling, browser automation, external publishing, email, generic chat UI, vector retrieval, or automatic active-memory writes exist.
- Unit, integration, Playwright, QA-Intel, lint, format, and typecheck validation pass.
