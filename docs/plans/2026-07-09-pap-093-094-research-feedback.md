# PAP-093 & PAP-094 — Source & Report Feedback Plan

## Summary

Add user-authored quality/helpfulness feedback for research sources and reports, persisted in separate immutable tables. Feedback never mutates original report findings, citations, source evidence, or model output. Server-only APIs + UI controls integrated into existing report detail and history views.

---

## 1. Data Model

### 1.1 `research_source_feedback` table

One record per source (source_id is unique). Hard delete supported.

| Column | Type | Constraints |
|---|---|---|
| `id` | text PK | generated, prefixed `rsf_` |
| `workspace_id` | text nullable | workspace isolation |
| `report_id` | text NOT NULL | FK → `research_reports(id)` ON DELETE CASCADE |
| `source_id` | text NOT NULL UNIQUE | FK → `research_sources(id)` ON DELETE CASCADE |
| `rating` | text NOT NULL | `useful` \| `neutral` \| `poor` |
| `helpful` | integer NOT NULL DEFAULT 0 | boolean 0/1 |
| `reason` | text nullable | bounded, optional context |
| `notes` | text nullable | bounded, sanitized free text |
| `created_at` | text NOT NULL | ISO 8601 |
| `updated_at` | text NOT NULL | ISO 8601 |

Indexes: `(workspace_id, report_id)`, `(report_id, source_id)`, `(source_id)`, `(rating)`.

### 1.2 `research_report_feedback` table

One record per report (report_id is PK). No delete — user can update to change feedback.

| Column | Type | Constraints |
|---|---|---|
| `report_id` | text PK | FK → `research_reports(id)` ON DELETE CASCADE |
| `workspace_id` | text nullable | workspace isolation |
| `rating` | text NOT NULL | `useful` \| `neutral` \| `poor` |
| `useful` | integer NOT NULL DEFAULT 0 | boolean 0/1 |
| `reason` | text nullable | bounded, optional context |
| `notes` | text nullable | bounded, sanitized free text |
| `created_at` | text NOT NULL | ISO 8601 |
| `updated_at` | text NOT NULL | ISO 8601 |

Index: `(workspace_id)`.

### 1.3 Ownership & FK cascade

- Cascade delete: deleting a report cascades to both feedback tables. Deleting a source cascades to its source feedback (via FK). Source feedback is also removed when its source is deleted.
- workspace_id must match the source/report workspace_id on write (validated in repository).

---

## 2. Contracts (`@pap/contracts`)

New file: `packages/contracts/src/research-feedback.ts`

### Source feedback schemas

```ts
researchSourceFeedbackRatingSchema → z.enum(["useful", "neutral", "poor"])
researchSourceFeedbackSchema → strict object:
  id, workspaceId (nullable), reportId, sourceId, rating, helpful (boolean),
  reason (nullable, max 500), notes (nullable, max 2000),
  createdAt, updatedAt

createResearchSourceFeedbackInputSchema → rating + helpful + optional reason/notes
updateResearchSourceFeedbackInputSchema → same as create, all optional for partial update
```

### Report feedback schemas

```ts
researchReportFeedbackRatingSchema → z.enum(["useful", "neutral", "poor"])
researchReportFeedbackSchema → strict object:
  reportId (PK), workspaceId (nullable), rating, useful (boolean),
  reason (nullable, max 500), notes (nullable, max 2000),
  createdAt, updatedAt

createResearchReportFeedbackInputSchema → rating + useful + optional reason/notes
updateResearchReportFeedbackInputSchema → same as create, all optional for partial update
```

---

## 3. Repository Interfaces (`@pap/storage`)

New files in `packages/storage/src/interfaces/`:

### `research-source-feedback-repository.ts`

```ts
interface ResearchSourceFeedbackRepository {
  create(input: CreateResearchSourceFeedbackInput): Promise<ResearchSourceFeedback>;
  getBySourceId(input: { sourceId, workspaceId }): Promise<ResearchSourceFeedback | null>;
  listByReport(input: { reportId, workspaceId }): Promise<ResearchSourceFeedback[]>;
  update(input: UpdateResearchSourceFeedbackInput): Promise<ResearchSourceFeedback>;
  delete(input: { sourceId, workspaceId }): Promise<void>;
}
```

### `research-report-feedback-repository.ts`

```ts
interface ResearchReportFeedbackRepository {
  upsert(input: CreateResearchReportFeedbackInput): Promise<ResearchReportFeedback>;
  getByReportId(input: { reportId, workspaceId }): Promise<ResearchReportFeedback | null>;
}
```

---

## 4. SQLite Implementation (`@pap/storage-sqlite`)

### Migration

New migration `0008` adds both tables with FKs and indexes.

### Schema files

- `packages/storage-sqlite/src/schema/research-source-feedback.ts`
- `packages/storage-sqlite/src/schema/research-report-feedback.ts`
- Export from `packages/storage-sqlite/src/schema/index.ts`

### Repository files

- `packages/storage-sqlite/src/repositories/research-source-feedback-repository.ts`
- `packages/storage-sqlite/src/repositories/research-report-feedback-repository.ts`

### Key implementation details

- Source feedback `create` asserts report/source FK existence and workspace match before insert
- Source feedback `update` validates existing record exists, replaces fields atomically
- Source feedback `delete` hard-deletes the row (backlog: "Feedback can be updated or removed")
- Report feedback `upsert` uses `INSERT OR REPLACE` or get-then-insert/update pattern
- Both use `sourceWorkspaceFilter` pattern identical to existing `research-source-repository.ts`

---

## 5. Server-Only APIs (`apps/web`)

### State wiring

Add `sourceFeedbackRepository` and `reportFeedbackRepository` to `WebRuntimeState` in `runtime.server.ts`. Create instances in `getWebRuntimeState()`.

Pass through to `ResearchOperationState` in `operations.ts`.

### Server functions (added to `apps/web/src/features/research/server.ts`)

| Function | Method | Purpose |
|---|---|---|
| `upsertReportFeedback` | POST | Create or update report feedback |
| `getReportFeedback` | GET | Fetch feedback for a report |
| `createSourceFeedback` | POST | Create source feedback |
| `updateSourceFeedback` | POST | Update existing source feedback |
| `deleteSourceFeedback` | POST | Remove source feedback |
| `getSourceFeedbackList` | GET | Fetch all source feedback for a report |

### Operations (added to `apps/web/src/features/research/operations.ts`)

Each operation validates input via Zod, delegates to repository, returns `{ ok: true, data } | { ok: false, error }`.

---

## 6. UI Design (`apps/web/src/features/research/components.tsx`)

### Report feedback — new section in `ResearchReportDetail`

A `ReportFeedbackPanel` component rendered after the summary panel, before findings. States:

- **No feedback yet**: Show "Rate this report" with rating selector (useful/neutral/poor) + useful toggle + optional notes + submit button
- **Existing feedback**: Show current rating/useful + reason/notes + "Edit" button to reveal edit form + updated-at timestamp
- **Loading/error**: Minimal inline states matching existing `SafeError`/`SafeLoading` patterns

### Source feedback — augment `SourcesPanel`

Each source entry in the existing `SourcesPanel` gains inline feedback controls:

- **No feedback**: Small row with rating selector + helpful toggle → "Save" button
- **Has feedback**: Show rating badge + helpful icon + "Edit" link → inline edit form → "Remove" button
- **Edit form**: Same as create, pre-filled, with "Update" and "Cancel" buttons

### Report history cards — feedback indicators

In `ResearchReportHistoryList` and `ResearchHistoryFilterForm`:
- Add optional feedback summary to history cards (e.g., "Rated useful" pill)
- Add `hasFeedback` filter option to history filters
- Add `feedbackSummary` to `ResearchReportHistoryItem` contract (or load via separate query)

### URL/route considerations

Feedback mutations use server functions (POST), not URL state. Feedback reads are fetched server-side in report detail loader.

---

## 7. Update / Delete Behavior

| Action | Behavior |
|---|---|
| Create source feedback | Fails if feedback already exists for that source_id (unique constraint) |
| Update source feedback | Replaces rating, helpful, reason, notes; bumps updatedAt |
| Delete source feedback | Hard delete row; no tombstone |
| Create report feedback | Upsert — creates if absent, replaces if present |
| Update report feedback | Same upsert; previous values fully replaced |
| Source deleted | Cascades to source feedback (FK ON DELETE CASCADE) |
| Report deleted | Cascades to both feedback tables (FK ON DELETE CASCADE) |
| Workspace mismatch | Repository validates workspace_id matches source/report workspace |

---

## 8. Workspace Isolation Strategy

Same pattern as existing repositories (`sourceWorkspaceFilter`):

```ts
function feedbackWorkspaceFilter(workspaceId: WorkspaceId | null): SQL {
  return workspaceId === null
    ? isNull(table.workspaceId)
    : eq(table.workspaceId, workspaceId);
}
```

Applied to all read/write queries.

---

## 9. Immutability Guarantees

- Feedback tables are separate from `research_reports` and `research_sources`
- No repository method writes to the report or source tables
- No contract validation crosses the feedback → report boundary
- Feedback schema has no overlap with report findings, citations, evidence, or model output
- UI clearly separates feedback sections from original report content

---

## 10. Test Plan (PAP-097 scope, outlined here for completeness)

### Unit tests (`packages/storage-sqlite`)

- Source feedback create/get/update/delete with isolated temp SQLite DB
- Report feedback upsert/get with isolated temp SQLite DB
- Workspace isolation: feedback queries don't return wrong-workspace records
- Immutability: feedback operations don't alter `research_reports` or `research_sources` rows
- FK cascade: deleting a report removes its feedback; deleting a source removes its feedback
- Duplicate source feedback create fails
- Invalid rating values rejected at contract layer
- Bounded reason/notes rejection

### Integration tests

- Feedback CRUD through server functions with temp DB
- Workspace-scoped queries return correct results
- Foreign key integrity under concurrent operations

---

## 11. Implementation Order

1. **Contracts** — `research-feedback.ts` with all Zod schemas + exported types
2. **Schema + migration** — drizzle table definitions + `drizzle-kit generate` for `0008`
3. **Repository interfaces** — `@pap/storage` interface files + export from `index.ts`
4. **SQLite repositories** — implementations with FK validation + workspace filter
5. **State wiring** — add repos to `WebRuntimeState`, `getWebRuntimeState()`, `ResearchOperationState`
6. **Server functions + operations** — `server.ts` and `operations.ts` additions
7. **UI components** — `ReportFeedbackPanel`, source feedback inline controls, history indicators
8. **Tests** — unit + integration per test plan above

---

## 12. Risks & Open Questions

- **History filter for `hasFeedback`**: requires either a JOIN or a subquery in the history query. If performance is a concern, defer to PAP-097 and add a simpler indicator first (just showing feedback status on already-loaded items).
- **Report feedback is one-per-report**: If multi-user feedback is ever needed, this must be revisited (ADR trigger).

---

## Out of Scope (explicitly)

- Model retraining or provider behavior changes
- Automatic source blacklist
- Memory proposal review (PAP-095)
- Export/copy (PAP-096)
- Schedules or background jobs
- Direct browser DB access
- Report finding/citation/source/evidence mutation
- Report history hasFeedback filter implementation (nice-to-have, can defer)
