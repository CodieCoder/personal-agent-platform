# Personal Agent Platform — Phase 6 Research Workspace Experience Backlog

**Status:** Draft execution backlog

**Depends on:**
- `01-product-foundation.md`
- `02-product-principles.md`
- `07-memory-model.md`
- `08-policy-and-approval-model.md`
- `15-architecture-decision-records.md`
- `20-phase-4-search-and-web-extraction-backlog.md`
- `21-phase-5-research-capability-backlog.md`

**Purpose:** Turn manually generated research reports into a useful day-to-day workspace experience: report history, source review, feedback, memory-proposal review, and safe export/copy workflows.

---

## 1. Phase Objective

Phase 5 proves PAP can produce a source-backed report. Phase 6 makes that output durable, reviewable, comparable, and useful in normal work.

Completed vertical slice:

```text
User opens a workspace
→ sees saved research reports
→ filters and reviews reports
→ opens report sources and evidence
→ gives relevance/source-quality feedback
→ reviews proposed memory from research
→ copies or exports a safe report artifact
→ all changes remain traceable and workspace-scoped
```

This phase must not add:

- Schedules or watchlists
- Background monitoring
- Automatic report delivery
- Email integration
- Browser automation
- Crawlee or Firecrawl
- Generic chat UI
- Active-memory auto-approval
- Research report editing by an LLM
- External publishing
- Cloud collaboration or multi-user roles
- Vector retrieval or embeddings

---

## 2. Product Rules

- Research reports remain immutable evidence records after completion.
- User feedback is stored separately from original report content.
- Reports, sources, feedback, and memory proposals must remain workspace-scoped.
- Export/copy is a user-initiated, non-automated action.
- Exported reports must preserve citations and limitations.
- Source-quality feedback does not silently alter provider ranking behavior yet.
- Memory proposals remain pending until explicitly approved through the existing Memory Explorer flow.
- No external sharing, sending, or publishing occurs in this phase.

---

## 3. Proposed Package Boundaries

```text
packages/
  contracts/
    research-feedback.ts
    research-export.ts

  research/
    report-history.ts
    source-feedback.ts
    report-export.ts
    report-comparison.ts
    index.ts

  storage/
    interfaces/
      research-feedback-repository.ts

  storage-sqlite/
    schema/
      research-feedback.ts
    repositories/
      research-feedback-repository.ts

apps/
  web/
    src/features/research/
      history-server.ts
      feedback-server.ts
      export-server.ts
      components/
        report-list.tsx
        report-filters.tsx
        source-review.tsx
        report-feedback.tsx
        memory-proposal-review.tsx
        report-export.tsx
```

### Boundary Rules

`@pap/research`

- Owns report-history queries, comparison helpers, feedback rules, and export shaping.
- Does not mutate original report findings, citations, or source evidence.
- Does not call Ollama, SearXNG, or external web tools.

`@pap/storage` and `@pap/storage-sqlite`

- Persist user feedback records and return typed workspace-scoped data.
- Do not contain UI logic or ranking behavior.

`apps/web`

- Uses server-only APIs for report history, feedback, memory-proposal review, and export.
- Never exposes direct database access in browser code.

---

# Milestone 6.1 — Report History and Workspace Dashboard

## PAP-091 — Add Research Report History Contracts and Queries

**Goal:** Define typed report history, filtering, pagination, and dashboard summary contracts.

### Scope

- Research report list query schema.
- Report history summary schema.
- Workspace report dashboard schema.
- Date/status/source-count/filter contracts.
- Pagination and sorting contracts.

### Required Filters

```text
workspaceId
status
dateFrom nullable
dateTo nullable
question nullable
hasWarnings nullable
hasPendingMemoryProposal nullable
page
pageSize
```

### Acceptance Criteria

- All contracts use Zod.
- Filter values are bounded and normalized safely.
- Default ordering is newest completed/updated report first.
- Queries exclude records from unrelated workspaces.
- No UI or repository changes are added.

### Depends On

```text
PAP-078
PAP-079
```

---

## PAP-092 — Build Workspace Research Dashboard and Report History UI

**Goal:** Let users browse and filter saved reports inside a workspace.

### Routes

```text
/workspaces/$workspaceId/research
/research/history
```

### Required UI

- Workspace research dashboard.
- Report count/status summary.
- Date/status/warnings/pending-memory filters.
- Search by question text.
- Paginated report list.
- Report cards with question, status, source count, warnings, completion time, and workspace.
- Clear empty, loading, and not-found states.
- Navigation to report detail.

### Constraints

- No report content mutation.
- No automatic refresh/polling loop.
- No schedule controls.
- No direct browser database access.

### Acceptance Criteria

- User can browse workspace-scoped reports.
- URL query parameters preserve active filter state.
- Pagination retains filters.
- Report detail remains reachable from filtered lists.
- Unrelated workspace reports are never shown.

### Depends On

```text
PAP-091
PAP-088
```

---

# Milestone 6.2 — Source Review and Feedback

## PAP-093 — Add Source Review and Source-Quality Feedback

**Goal:** Let users inspect selected sources and provide structured quality feedback.

### Scope

- Source review contracts.
- Source feedback schema.
- Feedback repository, additive migration, and SQLite implementation.
- Source review server APIs.
- Feedback create/update/delete operations.

### Required Feedback Fields

```text
id
workspaceId
reportId
sourceId
rating
helpful
reason nullable
notes nullable
createdAt
updatedAt
```

### Allowed Ratings

```text
useful
neutral
poor
```

### Constraints

- Feedback never mutates source evidence or report citations.
- Feedback is user-authored only.
- No model retraining or automatic source blacklist.
- Notes are bounded and sanitized.
- Feedback must remain workspace/report/source scoped.

### Acceptance Criteria

- User can inspect source title, URL, extraction method, relevance score, analysis summary, warnings, and citation usage.
- User can mark a source useful, neutral, or poor.
- User can add bounded optional feedback notes.
- Feedback can be updated or removed.
- Feedback is isolated by workspace and report.

### Depends On

```text
PAP-079
PAP-085
```

---

## PAP-094 — Add Research Report Feedback and Relevance Controls

**Goal:** Let users rate the usefulness of a report and capture future improvement signals.

### Scope

- Report feedback contracts.
- Report-level rating/relevance fields.
- Server-only API.
- UI controls on report detail and history.
- Feedback status display.

### Required Report Feedback Fields

```text
reportId
workspaceId
rating
useful
reason nullable
notes nullable
createdAt
updatedAt
```

### Constraints

- Feedback does not rewrite report text.
- Feedback does not trigger LLM calls.
- Feedback does not alter search provider behavior automatically.
- No “thumbs down” must expose hidden reasoning or raw prompt details.

### Acceptance Criteria

- User can mark a report useful or not useful.
- User can add bounded notes/reason.
- Existing feedback is visible when revisiting a report.
- Feedback is traceable and workspace-scoped.
- No ranking/model changes happen automatically.

### Depends On

```text
PAP-093
PAP-088
```

---

# Milestone 6.3 — Proposed Memory Review

## PAP-095 — Add Research Memory Proposal Review Experience

**Goal:** Make research-created memory proposals easy to inspect and resolve from report context.

### Scope

- Report-to-memory-proposal query contract.
- Server-only report memory proposal APIs.
- Proposal panel in report detail.
- Source citation/evidence linkage display.
- Approve/reject navigation through existing MemoryService APIs.
- Proposal status history display.

### Required UI

- Pending proposal list for a report.
- Proposed fact content.
- Confidence and sensitivity.
- Report/source/citation provenance.
- Existing conflicting active memory notice when available.
- Approve and reject actions.
- Link to full memory detail.

### Constraints

- Use existing MemoryService approval/rejection boundary.
- No direct repository writes from UI.
- Approval/rejection remains explicit user action.
- No automatic activation.
- No bulk approve action in Phase 6.

### Acceptance Criteria

- User can inspect pending research memory proposals from report detail.
- User can see supporting citations and evidence provenance.
- User can approve or reject one proposal.
- Status updates immediately and is persisted.
- Report completion remains unchanged if no proposal exists or proposal is rejected.

### Depends On

```text
PAP-087
PAP-045
```

---

# Milestone 6.4 — Safe Export and Copy

## PAP-096 — Add Research Report Export and Copy-Safe Output

**Goal:** Let users copy or export reports without losing source attribution or limitations.

### Scope

- Export format contracts.
- Report export service.
- Markdown export.
- Plain-text copy format.
- Optional JSON export for personal backup/debugging.
- Server-only export route/function.
- UI copy/export actions.

### Required Export Content

```text
report title/question
workspace name when available
generated time
summary
findings
inline citations or source references
source list
warnings
limitations
report ID
execution ID
```

### Constraints

- Exports preserve citations and limitations.
- No external sharing/send/post action.
- No arbitrary HTML rendering.
- No hidden model reasoning, raw provider output, credentials, or internal stack traces.
- Export generation must be deterministic from persisted report data.

### Acceptance Criteria

- User can copy report as plain text.
- User can export Markdown.
- User can export JSON only through explicit user action.
- Export includes citations, sources, warnings, and limitations.
- Empty/missing report data fails safely.
- Export action is traceable/auditable where existing execution/audit patterns support it.

### Depends On

```text
PAP-085
PAP-088
```

---

# Milestone 6.5 — Validation

## PAP-097 — Add Research Workspace Unit and Integration Tests

**Goal:** Validate report history, feedback, memory review, and export behavior.

### Required Unit Tests

- Filter normalization and pagination.
- Newest-first report ordering.
- Workspace isolation.
- Source feedback create/update/delete.
- Report feedback create/update.
- Bounded feedback notes.
- Memory proposal report linkage.
- Approval/rejection through MemoryService.
- Markdown/plain-text/JSON export shaping.
- Citation and limitation preservation in exports.

### Required Integration Tests

- Workspace report history query.
- Filtered report list with pagination.
- Feedback persistence and isolation.
- Report-linked proposal retrieval.
- Proposal approve/reject behavior.
- Export from persisted report with sources/citations.
- Safe not-found and invalid-input behavior.

### Acceptance Criteria

- Tests use isolated temporary SQLite databases.
- No tests require live Ollama, SearXNG, or public websites.
- No test depends on prior test data.
- Original report data remains immutable after feedback/export actions.

### Depends On

```text
PAP-096
```

---

## PAP-098 — Add Playwright and QA-Intel Research Workspace Coverage

**Goal:** Validate the user-visible research workspace experience.

### Required Playwright Flows

- User opens workspace research dashboard.
- User filters report history by status/date/warnings.
- User opens report detail from filtered history.
- User reviews source details and records source feedback.
- User records report usefulness feedback.
- User reviews and approves/rejects one pending memory proposal.
- User copies/exports report and sees citation-preserving output.
- Unrelated workspace report/feedback/proposal data is not visible.

### Required QA-Intel Feature

```gherkin
Feature: Research workspace review

  Scenario: User reviews saved research in a workspace
    Given a workspace has completed research reports
    When the user filters reports with warnings
    Then the user should see only matching workspace reports
    And the user can open a report and inspect its sources and limitations

  Scenario: User gives source and report feedback
    Given a completed research report with sources
    When the user marks one source as useful
    And the user marks the report as useful
    Then the feedback should remain visible when the report is reopened
    And the original report findings should remain unchanged

  Scenario: User reviews a research memory proposal
    Given a report has a pending cited memory proposal
    When the user approves the proposal
    Then the memory proposal should show approved
    And the user should be able to open the resulting memory record

  Scenario: User exports a cited report
    Given a completed research report with citations
    When the user exports the report as Markdown
    Then the export should contain source references and limitations
```

### Acceptance Criteria

- Playwright and QA-Intel use isolated seeded data.
- No test requires live external search/model services.
- Assertions target visible UI behavior and provenance.
- Screenshots/traces are captured on browser failure.
- Workspace isolation is explicitly tested.

### Depends On

```text
PAP-097
```

---

## 4. Recommended Execution Order

```text
PAP-091
PAP-092

PAP-093
PAP-094

PAP-095

PAP-096

PAP-097
PAP-098
```

---

## 5. Suggested Codex Goal Batches

```text
Goal A:
PAP-091 to PAP-092
Research history contracts, workspace dashboard, filtering, pagination.

Goal B:
PAP-093 to PAP-094
Source review, source feedback, report usefulness feedback.

Goal C:
PAP-095 to PAP-096
Research memory-proposal review and citation-preserving export/copy.

Goal D:
PAP-097 to PAP-098
Unit/integration tests, Playwright, and QA-Intel validation.
```

---

## 6. Phase 6 Definition of Done

Phase 6 is complete when:

- Users can browse and filter saved research reports by workspace.
- Report history is paginated, URL-stateful, and workspace-isolated.
- Users can inspect sources, extraction/relevance diagnostics, warnings, and citations.
- Users can provide source-quality and report-usefulness feedback without mutating original report evidence.
- Research-created memory proposals can be reviewed, approved, or rejected from report context.
- Users can copy/export research reports in citation-preserving formats.
- All feedback, proposals, and exports remain user-initiated, auditable, and workspace-scoped.
- No schedules, automated delivery, email, browser automation, external publishing, or automatic active-memory writes are introduced.
- Unit, integration, Playwright, QA-Intel, lint, format, and typecheck validation pass.
