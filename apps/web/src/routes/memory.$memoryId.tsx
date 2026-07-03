import type { FormEvent } from "react";
import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { SemanticMemoryRecord } from "@pap/contracts";
import type { MemoryRecord } from "@pap/memory";
import { SafeError } from "../features/executions/components";
import {
  EpisodicMemoryMetadata,
  JsonBlock,
  MemoryStatusPill,
  SemanticMemoryMetadata,
} from "../features/memory/components";
import {
  jsonFieldValue,
  optionalNumberValue,
  optionalTextValue,
  parseJsonArrayField,
  parseJsonOrString,
} from "../features/memory/forms";
import {
  approveSemanticMemoryProposal,
  deleteMemoryRecord,
  getMemoryRecord,
  rejectSemanticMemoryProposal,
  supersedeSemanticMemory,
  updateSemanticMemory,
} from "../features/memory/server";
import type {
  MemoryMutationResult,
  SemanticMemoryMutationResult,
  SupersedeSemanticMemoryResult,
} from "../features/memory/types";

type DetailMutationResult =
  | SemanticMemoryMutationResult
  | MemoryMutationResult
  | SupersedeSemanticMemoryResult;

export const Route = createFileRoute("/memory/$memoryId")({
  loader: async ({ params }) => {
    return getMemoryRecord({ data: { id: params.memoryId } });
  },
  component: MemoryDetailRoute,
});

function MemoryDetailRoute() {
  const router = useRouter();
  const result = Route.useLoaderData();
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [mutationResult, setMutationResult] = useState<DetailMutationResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function submitDelete(id: string, type: "semantic" | "episodic") {
    const confirmed = window.confirm("Soft-delete this memory record?");

    if (!confirmed) {
      return;
    }

    setIsPending(true);
    setMutationResult(null);

    try {
      const nextResult = await deleteMemoryRecord({ data: { id, type } });
      setMutationResult(nextResult);

      if (nextResult.ok) {
        await router.invalidate();
      }
    } catch {
      setMutationResult(requestFailure("MEMORY_DELETE_REQUEST_FAILED"));
    } finally {
      setIsPending(false);
    }
  }

  async function reviewProposal(id: string, action: "approve" | "reject") {
    setIsPending(true);
    setMutationResult(null);

    try {
      const nextResult =
        action === "approve"
          ? await approveSemanticMemoryProposal({ data: { id } })
          : await rejectSemanticMemoryProposal({ data: { id } });
      setMutationResult(nextResult);

      if (nextResult.ok) {
        await router.invalidate();
      }
    } catch {
      setMutationResult(requestFailure("MEMORY_PROPOSAL_REQUEST_FAILED"));
    } finally {
      setIsPending(false);
    }
  }

  async function submitSemanticEdit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const evidenceRefs = parseJsonArrayField(String(formData.get("evidenceRefs") ?? ""));

    if (!evidenceRefs.ok) {
      setMutationResult(invalidEvidenceResult(evidenceRefs.error));
      return;
    }

    setIsPending(true);
    setMutationResult(null);

    const payload = compactObject({
      id,
      subject: optionalTextValue(formData.get("subject")),
      predicate: optionalTextValue(formData.get("predicate")),
      value: parseJsonOrString(String(formData.get("value") ?? "")),
      confidence: optionalNumberValue(formData.get("confidence")),
      sensitivity: optionalTextValue(formData.get("sensitivity")),
      sourceRef: optionalTextValue(formData.get("sourceRef")),
      evidenceRefs: evidenceRefs.value,
      expiresAt: optionalTextValue(formData.get("expiresAt")),
    });

    try {
      const nextResult = await updateSemanticMemory({ data: payload });
      setMutationResult(nextResult);

      if (nextResult.ok) {
        await router.invalidate();
      }
    } catch {
      setMutationResult(requestFailure("MEMORY_UPDATE_REQUEST_FAILED"));
    } finally {
      setIsPending(false);
    }
  }

  async function submitSemanticSupersede(
    event: FormEvent<HTMLFormElement>,
    record: SemanticMemoryRecord,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const evidenceRefs = parseJsonArrayField(String(formData.get("evidenceRefs") ?? ""));

    if (!evidenceRefs.ok) {
      setMutationResult(invalidEvidenceResult(evidenceRefs.error));
      return;
    }

    setIsPending(true);
    setMutationResult(null);

    const replacement = compactObject({
      scope: record.scope,
      workspaceId: record.workspaceId,
      capabilityId: record.capabilityId,
      threadId: record.threadId,
      subject: String(formData.get("subject") ?? ""),
      predicate: String(formData.get("predicate") ?? ""),
      value: parseJsonOrString(String(formData.get("value") ?? "")),
      confidence: optionalNumberValue(formData.get("confidence")) ?? record.confidence,
      sensitivity: optionalTextValue(formData.get("sensitivity")) ?? record.sensitivity,
      sourceType: optionalTextValue(formData.get("sourceType")) ?? "manual",
      sourceRef: optionalTextValue(formData.get("sourceRef")),
      evidenceRefs: evidenceRefs.value,
      expiresAt: optionalTextValue(formData.get("expiresAt")) ?? record.expiresAt,
    });

    try {
      const nextResult = await supersedeSemanticMemory({
        data: {
          id: record.id,
          replacement,
        },
      });
      setMutationResult(nextResult);

      if (nextResult.ok) {
        await router.navigate({
          to: "/memory/$memoryId",
          params: { memoryId: nextResult.replacement.id },
        });
      }
    } catch {
      setMutationResult(requestFailure("MEMORY_SUPERSEDE_REQUEST_FAILED"));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <div className="detail-actions">
        <Link className="text-link" to="/memory">
          Back to memory
        </Link>
      </div>

      {!result.ok ? <SafeError error={result.error} /> : null}
      {result.ok && !result.found ? <MemoryNotFoundState /> : null}
      {result.ok && result.found ? renderMemoryDetail(result.memory) : null}
    </>
  );

  function renderMemoryDetail(memory: MemoryRecord) {
    if (memory.type === "semantic") {
      const record = memory.record;

      return (
        <SemanticDetail
          isPending={isPending}
          mutationResult={mutationResult}
          onDelete={() => void submitDelete(record.id, "semantic")}
          onEdit={(event) => void submitSemanticEdit(event, record.id)}
          onReject={() => void reviewProposal(record.id, "reject")}
          onApprove={() => void reviewProposal(record.id, "approve")}
          onSupersede={(event) => void submitSemanticSupersede(event, record)}
          onToggleReveal={() => setRevealSensitive((current) => !current)}
          record={record}
          revealSensitive={revealSensitive}
        />
      );
    }

    const record = memory.record;

    return (
      <EpisodicDetail
        isPending={isPending}
        mutationResult={mutationResult}
        onDelete={() => void submitDelete(record.id, "episodic")}
        onToggleReveal={() => setRevealSensitive((current) => !current)}
        record={record}
        revealSensitive={revealSensitive}
      />
    );
  }
}

function SemanticDetail({
  isPending,
  mutationResult,
  onApprove,
  onDelete,
  onEdit,
  onReject,
  onSupersede,
  onToggleReveal,
  record,
  revealSensitive,
}: {
  isPending: boolean;
  mutationResult: DetailMutationResult | null;
  onApprove: () => void;
  onDelete: () => void;
  onEdit: (event: FormEvent<HTMLFormElement>) => void;
  onReject: () => void;
  onSupersede: (event: FormEvent<HTMLFormElement>) => void;
  onToggleReveal: () => void;
  record: SemanticMemoryRecord;
  revealSensitive: boolean;
}) {
  const canEdit = record.status === "active" || record.status === "proposed";
  const masked = record.sensitivity === "sensitive" && !revealSensitive;

  return (
    <>
      <section className="page-header" aria-labelledby="memory-detail-title">
        <span className="eyebrow">semantic / {record.status}</span>
        <h1 className="page-title" id="memory-detail-title">
          {record.subject}
        </h1>
        <p className="page-copy">{record.predicate}</p>
      </section>

      <div className="detail-grid">
        <section className="detail-panel" aria-labelledby="semantic-detail-metadata-title">
          <div className="section-heading">
            <h2 id="semantic-detail-metadata-title">Metadata</h2>
            <MemoryStatusPill status={record.status} />
          </div>
          <SemanticMemoryMetadata record={record} />
        </section>

        <section className="detail-panel" aria-labelledby="semantic-detail-value-title">
          <div className="section-heading">
            <h2 id="semantic-detail-value-title">Payload</h2>
            <button className="secondary-button" onClick={onToggleReveal} type="button">
              {revealSensitive ? "Mask" : "Reveal"}
            </button>
          </div>
          <JsonBlock masked={masked} value={record.value} />
          <h3 className="subsection-title">Evidence refs</h3>
          <JsonBlock masked={false} value={record.evidenceRefs} />
        </section>

        <section className="detail-panel" aria-labelledby="semantic-actions-title">
          <div className="section-heading">
            <h2 id="semantic-actions-title">Actions</h2>
            <span>reversible</span>
          </div>
          <div className="inline-actions">
            {record.status === "proposed" ? (
              <>
                <button
                  className="secondary-button"
                  disabled={isPending}
                  onClick={onApprove}
                  type="button"
                >
                  Approve
                </button>
                <button
                  className="secondary-button"
                  disabled={isPending}
                  onClick={onReject}
                  type="button"
                >
                  Reject
                </button>
              </>
            ) : null}
            <button
              className="secondary-button"
              disabled={isPending}
              onClick={onDelete}
              type="button"
            >
              Delete memory
            </button>
          </div>
          {mutationResult && !mutationResult.ok ? <SafeError error={mutationResult.error} /> : null}
        </section>

        {canEdit ? (
          <SemanticEditForm isPending={isPending} onSubmit={onEdit} record={record} />
        ) : (
          <section className="detail-panel" aria-labelledby="semantic-edit-disabled-title">
            <div className="section-heading">
              <h2 id="semantic-edit-disabled-title">Edit</h2>
              <span>disabled</span>
            </div>
            <p className="empty-state">Only active and proposed semantic records can be edited.</p>
          </section>
        )}

        {canEdit ? (
          <SemanticSupersedeForm isPending={isPending} onSubmit={onSupersede} record={record} />
        ) : null}
      </div>
    </>
  );
}

function EpisodicDetail({
  isPending,
  mutationResult,
  onDelete,
  onToggleReveal,
  record,
  revealSensitive,
}: {
  isPending: boolean;
  mutationResult: DetailMutationResult | null;
  onDelete: () => void;
  onToggleReveal: () => void;
  record: Parameters<typeof EpisodicMemoryMetadata>[0]["record"];
  revealSensitive: boolean;
}) {
  const masked = record.sensitivity === "sensitive" && !revealSensitive;

  return (
    <>
      <section className="page-header" aria-labelledby="episode-detail-title">
        <span className="eyebrow">episodic / {record.status}</span>
        <h1 className="page-title" id="episode-detail-title">
          {record.eventType}
        </h1>
        <p className="page-copy">{masked ? "Sensitive summary hidden." : record.summary}</p>
      </section>

      <div className="detail-grid">
        <section className="detail-panel" aria-labelledby="episode-detail-metadata-title">
          <div className="section-heading">
            <h2 id="episode-detail-metadata-title">Metadata</h2>
            <MemoryStatusPill status={record.status} />
          </div>
          <EpisodicMemoryMetadata record={record} />
        </section>
        <section className="detail-panel" aria-labelledby="episode-detail-payload-title">
          <div className="section-heading">
            <h2 id="episode-detail-payload-title">Payload</h2>
            <button className="secondary-button" onClick={onToggleReveal} type="button">
              {revealSensitive ? "Mask" : "Reveal"}
            </button>
          </div>
          <JsonBlock masked={masked} value={record.summary} />
          <h3 className="subsection-title">Related entities</h3>
          <JsonBlock masked={false} value={record.relatedEntities} />
          <h3 className="subsection-title">Evidence refs</h3>
          <JsonBlock masked={false} value={record.evidenceRefs} />
        </section>
        <section className="detail-panel" aria-labelledby="episode-actions-title">
          <div className="section-heading">
            <h2 id="episode-actions-title">Actions</h2>
            <span>soft delete</span>
          </div>
          <button
            className="secondary-button"
            disabled={isPending}
            onClick={onDelete}
            type="button"
          >
            Delete memory
          </button>
          {mutationResult && !mutationResult.ok ? <SafeError error={mutationResult.error} /> : null}
        </section>
      </div>
    </>
  );
}

function SemanticEditForm({
  isPending,
  onSubmit,
  record,
}: {
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  record: SemanticMemoryRecord;
}) {
  return (
    <section className="detail-panel" aria-labelledby="semantic-edit-title">
      <div className="section-heading">
        <h2 id="semantic-edit-title">Edit semantic memory</h2>
        <span>active/proposed</span>
      </div>
      <form className="stack-form" onSubmit={onSubmit}>
        <div className="field-grid compact-fields">
          <label>
            Subject
            <input defaultValue={record.subject} name="subject" required />
          </label>
          <label>
            Predicate
            <input defaultValue={record.predicate} name="predicate" required />
          </label>
        </div>
        <div className="field-grid">
          <label htmlFor="semantic-edit-value">Value</label>
          <textarea
            defaultValue={jsonFieldValue(record.value)}
            id="semantic-edit-value"
            name="value"
            required
          />
        </div>
        <div className="field-grid compact-fields">
          <label>
            Confidence
            <input
              defaultValue={record.confidence}
              max="1"
              min="0"
              name="confidence"
              step="0.01"
              type="number"
            />
          </label>
          <label>
            Sensitivity
            <select className="select-input" defaultValue={record.sensitivity} name="sensitivity">
              <option value="low">low</option>
              <option value="moderate">moderate</option>
              <option value="sensitive">sensitive</option>
            </select>
          </label>
        </div>
        <div className="field-grid compact-fields">
          <label>
            Source ref
            <input defaultValue={record.sourceRef ?? ""} name="sourceRef" />
          </label>
          <label>
            Expires at
            <input defaultValue={record.expiresAt ?? ""} name="expiresAt" />
          </label>
        </div>
        <div className="field-grid">
          <label htmlFor="semantic-edit-evidence">Evidence refs</label>
          <textarea
            defaultValue={jsonFieldValue(record.evidenceRefs)}
            id="semantic-edit-evidence"
            name="evidenceRefs"
          />
        </div>
        <button className="primary-button" disabled={isPending} type="submit">
          {isPending ? "Saving" : "Save changes"}
        </button>
      </form>
    </section>
  );
}

function SemanticSupersedeForm({
  isPending,
  onSubmit,
  record,
}: {
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  record: SemanticMemoryRecord;
}) {
  return (
    <section className="detail-panel" aria-labelledby="semantic-supersede-title">
      <div className="section-heading">
        <h2 id="semantic-supersede-title">Supersede</h2>
        <span>replacement</span>
      </div>
      <form className="stack-form" onSubmit={onSubmit}>
        <div className="field-grid compact-fields">
          <label>
            Subject
            <input defaultValue={record.subject} name="subject" required />
          </label>
          <label>
            Predicate
            <input defaultValue={record.predicate} name="predicate" required />
          </label>
        </div>
        <div className="field-grid">
          <label htmlFor="semantic-supersede-value">Replacement value</label>
          <textarea
            defaultValue={jsonFieldValue(record.value)}
            id="semantic-supersede-value"
            name="value"
            required
          />
        </div>
        <div className="field-grid compact-fields">
          <label>
            Confidence
            <input
              defaultValue={record.confidence}
              max="1"
              min="0"
              name="confidence"
              step="0.01"
              type="number"
            />
          </label>
          <label>
            Sensitivity
            <select className="select-input" defaultValue={record.sensitivity} name="sensitivity">
              <option value="low">low</option>
              <option value="moderate">moderate</option>
              <option value="sensitive">sensitive</option>
            </select>
          </label>
        </div>
        <div className="field-grid compact-fields">
          <label>
            Source type
            <input defaultValue="manual" name="sourceType" />
          </label>
          <label>
            Source ref
            <input defaultValue={record.sourceRef ?? ""} name="sourceRef" />
          </label>
        </div>
        <div className="field-grid">
          <label htmlFor="semantic-supersede-evidence">Evidence refs</label>
          <textarea
            defaultValue={jsonFieldValue(record.evidenceRefs)}
            id="semantic-supersede-evidence"
            name="evidenceRefs"
          />
        </div>
        <button className="secondary-button" disabled={isPending} type="submit">
          {isPending ? "Superseding" : "Create replacement"}
        </button>
      </form>
    </section>
  );
}

function MemoryNotFoundState() {
  return (
    <section className="detail-panel" aria-labelledby="memory-not-found-title">
      <div className="section-heading">
        <h2 id="memory-not-found-title">Memory not found</h2>
        <span>empty</span>
      </div>
      <p className="empty-state">No semantic or episodic memory exists for this ID.</p>
    </section>
  );
}

function invalidEvidenceResult(message: string): SemanticMemoryMutationResult {
  return {
    ok: false,
    error: {
      code: "MEMORY_EVIDENCE_REFS_INVALID",
      message,
    },
  };
}

function requestFailure(code: string): SemanticMemoryMutationResult {
  return {
    ok: false,
    error: {
      code,
      message: "Memory request could not be completed.",
    },
  };
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") {
      output[key] = value;
    }
  }

  return output;
}
