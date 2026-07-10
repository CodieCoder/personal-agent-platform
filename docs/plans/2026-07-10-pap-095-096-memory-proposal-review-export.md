# PAP-095 & PAP-096 — Memory Proposal Review & Report Export Plan

Date: 2026-07-10
Status: Accepted for implementation
Tickets: PAP-095, PAP-096

## Scope

- Report-linked memory proposal query and server API layer.
- Full inline memory proposal review panel within the research report detail UI, replacing the
  current status-only `MemoryProposalPanel`.
- Explicit approve/reject actions through existing `MemoryService` boundaries — no direct
  repository writes from browser code.
- Conflict detection: active memory with same `predicate` in-scope gets flagged in the review panel.
- Citation/evidence provenance linkage display per proposal.
- Deterministic Markdown, plain-text, and JSON report export from persisted report data.
- Server-only export function/route through existing TanStack Start server function pattern.
- Copy-to-clipboard and file-download UI controls.

Do not add bulk approval, auto-activation of memory, hidden model reasoning, raw provider output
in exports, external sharing/send/publish/email/cloud-upload, report mutation, HTML export format,
or new database migrations.

---

## 1. Report-to-Proposal Query Design

**Current state:** `getResearchReportOperation` calls `listResearchMemoryStatuses()` which
queries proposed/active/rejected memory by `sourceExecutionId` in three parallel calls but
returns only `{id, status}[]`. The existing `MemoryProposalPanel` renders status pills linking
to `/memory/$memoryId` with no content, provenance, or approval controls.

**Change:** Extend `ResearchMemoryStatusSummary` so the report detail receives full proposed
`SemanticMemoryRecord` objects:

```ts
export type ResearchMemoryStatusSummary = {
  status: "none" | "pending_review" | "active" | "rejected" | "mixed";
  total: number;
  proposed: number;
  active: number;
  rejected: number;
  records: { id: string; status: MemoryStatus }[];
  proposedRecords: SemanticMemoryRecord[];
};
```

The existing `listResearchMemoryStatuses` already fetches full `SemanticMemoryRecord` arrays
from `memoryService.listSemanticMemory({ sourceExecutionId, status })`. No new queries are
needed — the proposed results are piped into `proposedRecords`.

`getResearchReportOperation` returns `proposedRecords` alongside the existing `memory` summary.
The `ResearchReportResult.success` variant gains `proposedRecords: SemanticMemoryRecord[]`.

### Conflict detection query

After fetching proposed records, the operation queries active semantic memory with the same
`predicate` values (different `id`):

```ts
const conflicts = proposedRecords.length > 0
  ? await state.memoryService.listSemanticMemory({
      status: "active",
      predicate: /* union of proposed predicates */,
      limit: 50,
    })
  : [];
```

Conflicts are filtered to exclude self-matches (same `id` as a proposal) and workspace-mismatched
records. The conflict set returns as `conflictingActiveRecords: SemanticMemoryRecord[]` alongside
`proposedRecords`.

No new contracts are needed — `SemanticMemoryRecord` already exists in `@pap/contracts/src/memory.ts`.

---

## 2. Approval/Rejection State Flow

```
User clicks Approve on a proposal in report detail
  → browser calls approveResearchMemoryProposal({ id: memoryId })
  → server function validates { id: memoryIdSchema }
  → delegates to MemoryService.approveSemanticMemoryProposal(id)
  → MemoryService validates status === "proposed"
  → repository.approveProposal() sets status = "active", records approvedAt
  → returns updated SemanticMemoryRecord
  → browser calls router.invalidate()
  → report detail reloads — proposal moves from pending to active

Rejection follows the identical flow through rejectSemanticMemoryProposal(id).
```

**New server functions** in `apps/web/src/features/research/server.ts`:

| Function | Method | Purpose |
|---|---|---|
| `approveResearchMemoryProposal` | POST | Approve proposed memory from report context |
| `rejectResearchMemoryProposal` | POST | Reject proposed memory from report context |

**New operations** in `apps/web/src/features/research/operations.ts`:

```ts
approveResearchMemoryProposalOperation(state, input) → SemanticMemoryMutationResult
rejectResearchMemoryProposalOperation(state, input) → SemanticMemoryMutationResult
```

Both validate `{ id: memoryIdSchema }` via Zod, delegate to `state.memoryService`, and return
`{ ok: true, memory }` or `{ ok: false, error }`.

`ResearchOperationState` already holds `memoryService: MemoryService`. No wiring change needed.

**Constraints:**

- Only `proposed` records can be approved/rejected (enforced by `MemoryService`).
- One-at-a-time only — each button targets exactly one `memoryId`.
- No auto-activation — approval always requires an explicit user click.
- No direct repository writes from browser — all mutations go through server function →
  MemoryService → repository.

### New result types in `types.ts`:

```ts
export type ResearchMemoryMutationResult =
  | { ok: true; memory: SemanticMemoryRecord }
  | { ok: false; error: SafeWebError };
```

---

## 3. Conflict/Provenance Display Approach

### Provenance per proposal

Each proposed record card renders:

- `subject` / `predicate` as the fact header
- `value` — JSON preview, masked if sensitivity is `sensitive`
- `confidence` as percentage meter
- `sensitivity` as coloured pill
- `scope` + workspace context
- `sourceType` label (e.g. `capability`, `research_report`)
- `sourceExecutionId` with link to execution trace
- `evidenceRefs` count and IDs
- `createdBy` attribution
- `createdAt` timestamp

### Conflict warning

When an active `SemanticMemoryRecord` exists with the same `predicate` (and same workspace
scope) but different `id`, the proposal card shows:

```
⚠️ Existing active fact: "{subject} / {predicate}"
   Memory ID: mem_xyz789 — link to memory detail
   Approving this proposal will result in two separate facts with the same predicate.
```

This is informational only — approval is still allowed (no automatic supersede). The user
decides whether to approve and later supersede manually.

### Citation/source linkage

When a proposal's `evidenceRefs` match `report.sources[].evidenceId`, the card shows:

```
Source citation: "{source.title}"
  "{citation.claimText}"
  URL: {source.finalUrl ?? source.url}
```

The linkage is derived client-side by cross-referencing `evidenceRefs` against `report.sources`.

---

## 4. Export Format Specification

**New contract file:** `packages/contracts/src/research-export.ts`

```ts
export const researchExportFormatSchema = z.enum(["markdown", "plain-text", "json"]);

export const researchExportRequestSchema = z.object({
  reportId: researchReportIdSchema,
  workspaceId: nullableWorkspaceIdSchema,
  format: researchExportFormatSchema,
}).strict();
```

### Markdown export

```markdown
# {report.question}

**Workspace:** {workspaceId | "Personal"}
**Generated:** {completedAt ISO}
**Status:** {status}
**Report ID:** {report.id}
**Execution:** {report.executionId}

---

## Summary

{report.summary.text}

Key points:
- {report.summary.keyPoints joined}

---

## Cited Findings

### Finding {n}: {finding.title}

{finding.claimText}

*Confidence: {confidence%} — Kind: {finding.kind}*

*Cited sources: C{citationIndices...}*

...

---

## Sources

| # | Title | URL | Status | Relevance |
|---|-------|-----|--------|-----------|
| {n} | {source.title} | {source.finalUrl ?? source.url} | {source.status} | {score%} |
...

---

## Citations

{n}. {citation.sourceTitle}: "{citation.claimText}"
    *Source: {citation.sourceUrl}*
    {citation.sourceExcerpt ? "> " + citation.sourceExcerpt : ""}

...

---

## Warnings

- {warning.code}: {warning.message}
...

---

## Limitations

- {limitation.code}: {limitation.message}
...
```

### Plain-text export

Same structure, no Markdown formatting. Citations numbered. No bold/italic/code spans.

### JSON export

`JSON.stringify(report, null, 2)` — the full `ResearchReport` object including all findings,
sources, citations, warnings, limitations, and metadata.

### Deterministic guarantee

All export content comes from the persisted `ResearchReport`. No model calls, no external
lookups, no generated text. The export function is a pure transformation.

### Safe content rules

- No hidden model reasoning (not in report contract)
- No raw provider output (not persisted)
- No credentials or secrets (not in report contract)
- No internal stack traces (not in report contract)
- Failed/incomplete reports produce a reduced export with status context (no findings/sources if
  absent, status clearly marked)

---

## 5. Trace/Audit Handling

**Memory proposal approval/rejection:**
- Goes through existing `MemoryService.approveSemanticMemoryProposal` / `rejectSemanticMemoryProposal`
- Repository methods (`approveProposal`/`rejectProposal`) mutate the record's `status` and
  timestamp fields
- The memory record's `updatedAt` reflects the state change
- The state transition is visible in the Memory Explorer trace/status display

**Export:**
- Export is a read-only deterministic transformation of persisted data
- The export output includes `report.id`, `executionId`, and timestamp for provenance
- No new trace record is created for export within current trace scope
- Export does not mutate any persisted data

---

## 6. Browser Interaction Design

### Memory Proposal Review Panel

Replaces the current `MemoryProposalPanel` (lines 1065–1093 in `components.tsx`) with a full
`ResearchMemoryProposalPanel` component.

Layout:

```
┌─ Memory Proposals (3 pending) ─────────────────────────┐
│                                                          │
│  ┌─── Proposal card ────────────────────────────────┐   │
│  │  Fact: "{subject}" / {predicate}                  │   │
│  │  Value: {JSON preview, masked if sensitive}       │   │
│  │  ──────────────────────────────────────────────── │   │
│  │  Confidence: 88%  │  Sensitivity: low             │   │
│  │  Scope: workspace  │  Source: capability.research │   │
│  │  Execution: exec_abc123 → trace link              │   │
│  │  Evidence refs: 2 (ev_001, ev_002)                │   │
│  │  ──────────────────────────────────────────────── │   │
│  │  ⚠️ Existing active fact:                         │   │
│  │    mem_xyz789 → memory detail link                │   │
│  │  ──────────────────────────────────────────────── │   │
│  │  Source citation: "{source.title}"                │   │
│  │    "{citation excerpt}"                           │   │
│  │    {source.url}                                   │   │
│  └───────────────────────────────────────────────────┘   │
│  [Approve]  [Reject]  (disabled while pending)           │
│                                                          │
│  1 active  │  0 rejected                                 │
└──────────────────────────────────────────────────────────┘
```

**Interaction:**
- Approve/Reject buttons disabled while a mutation is in-flight (`pendingActionId` tracked in
  component state)
- On success: `router.invalidate()` refreshes the page, resolved proposal moves out of pending
- Empty state: "No semantic memory was proposed for this report."
- Links: execution ID → trace detail, memory ID → memory detail, source URL → external

### Export/Copy Panel

New `ExportPanel` component inserted in report detail, positioned after the summary section:

```
┌─ Export & Copy ─────────────────────────────────────────┐
│                                                          │
│  [Copy as plain text]  [Export Markdown]  [Export JSON]  │
│                                                          │
│  Report includes citations, sources, warnings, and        │
│  limitations. No hidden data or external sharing.         │
└──────────────────────────────────────────────────────────┘
```

**Copy flow:** Server function generates plain text → `navigator.clipboard.writeText()`.

**Export flow:** Server function generates content → `Blob` → programmatic `<a>` download click.

```ts
const handleExport = async (format: ResearchExportFormat) => {
  const result = await exportResearchReport({ data: { reportId, workspaceId, format } });
  if (!result.ok) return;
  const blob = new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(url);
};
```

### Export server function response

```ts
type ResearchExportResult =
  | { ok: true; content: string; filename: string; mimeType: string }
  | { ok: false; error: SafeWebError };
```

Filenames follow `research-{reportId}-{YYYY-MM-DD}.{md|txt|json}`.

---

## 7. Files to Create or Modify

### PAP-095

| File | Action | Purpose |
|---|---|---|
| `apps/web/src/features/research/types.ts` | Modify | Extend `ResearchMemoryStatusSummary` with `proposedRecords`; add `ResearchMemoryMutationResult` |
| `apps/web/src/features/research/operations.ts` | Modify | Extend `listResearchMemoryStatuses` to return full proposed records and conflict set; add `approveResearchMemoryProposalOperation` and `rejectResearchMemoryProposalOperation`; extend `getResearchReportOperation` output |
| `apps/web/src/features/research/server.ts` | Modify | Add `approveResearchMemoryProposal` and `rejectResearchMemoryProposal` server functions |
| `apps/web/src/features/research/components.tsx` | Modify | Replace `MemoryProposalPanel` with `ResearchMemoryProposalPanel` — full per-proposal cards with content, provenance, conflict warning, citation linkage, and approve/reject buttons |

### PAP-096

| File | Action | Purpose |
|---|---|---|
| `packages/contracts/src/research-export.ts` | Create | Export format, request, and content schemas |
| `packages/contracts/src/index.ts` | Modify | Re-export `research-export.ts` |
| `apps/web/src/features/research/operations.ts` | Modify | Add `exportResearchReportOperation` — deterministic Markdown/plain-text/JSON generation from persisted report |
| `apps/web/src/features/research/server.ts` | Modify | Add `exportResearchReport` server function |
| `apps/web/src/features/research/components.tsx` | Modify | Add `ExportPanel` component with copy/export buttons |
| `apps/web/src/features/research/types.ts` | Modify | Add `ResearchExportResult` type |

No new packages, database migrations, or repository interfaces are needed.

---

## 8. Test Plan

### Unit tests

- Export Markdown generation includes citations, sources, warnings, limitations
- Export Markdown is deterministic (snapshot test)
- Export plain-text generation preserves citation references
- Export JSON is valid `JSON.stringify(ResearchReport)`
- Empty/null/partial report fields produce safe fallback text, not crashes
- Citation indices in Markdown correctly cross-reference sources
- Memory proposal approval schema validation rejects invalid/empty IDs
- Memory proposal rejection schema validation rejects invalid/empty IDs
- Approval of non-proposed status fails with safe error (tested via MemoryService)
- Conflict detection query returns only workspace-matching, non-self records

### Integration tests

- Full report detail load returns `proposedRecords` with content
- Approving a proposal via server function changes status to `active`
- Rejecting a proposal via server function changes status to `rejected`
- Re-approving an already-resolved proposal fails with safe error
- Export from persisted report with sources preserves all attribution
- Export with no findings produces safe fallback output with status context
- Workspace isolation holds for memory proposal operations
- Report data remains immutable after export — no side effects on `research_reports` or
  `research_sources`

### Playwright/QA-Intel (PAP-098 scope, planned here)

```
Scenario: User reviews and approves a research memory proposal
  Given a report has pending cited memory proposals
  When the user opens the report detail
  Then the user should see proposed fact content, confidence, and provenance
  And the user can approve one proposal
  And the proposal status should update to active

Scenario: User exports a cited report
  Given a completed research report with citations and warnings
  When the user exports the report as Markdown
  Then the export should contain source references and limitations
  And no hidden reasoning or credentials should be present
```

---

## 9. Dependencies

- Existing `MemoryService` (`approveSemanticMemoryProposal`, `rejectSemanticMemoryProposal`,
  `listSemanticMemory`)
- Existing `ResearchOperationState` (already holds `memoryService`)
- Existing research report persistence and `getResearchReportOperation`
- Existing `ResearchReport`, `SemanticMemoryRecord` contracts
- Existing TanStack Start server function pattern

---

## 10. Out of Scope

- Bulk approval (single-action only)
- Auto-activation of memory
- Direct repository writes from browser code
- External sharing, send, publish, email, or cloud upload
- Report mutation (export is read-only)
- Hidden model reasoning or raw provider output in exports
- HTML export format
- Export scheduling or automation
- New database tables or migrations
- New `@pap` workspace packages
- Memory consolidation or automatic supersede on conflict
