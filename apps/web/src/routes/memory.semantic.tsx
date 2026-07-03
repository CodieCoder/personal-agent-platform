import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import type { MemoryScope, MemorySensitivity, MemoryStatus } from "@pap/contracts";
import { SafeError } from "../features/executions/components";
import { MemoryTabs, SemanticMemoryList } from "../features/memory/components";
import {
  jsonFieldValue,
  optionalNumberValue,
  optionalTextValue,
  parseJsonArrayField,
  parseJsonOrString,
} from "../features/memory/forms";
import {
  approveSemanticMemoryProposal,
  createManualSemanticMemory,
  listSemanticMemory,
  rejectSemanticMemoryProposal,
} from "../features/memory/server";
import type { SemanticMemoryMutationResult } from "../features/memory/types";
import { WorkspaceSelector } from "../features/workspaces/components";
import { listWorkspaces } from "../features/workspaces/server";

const memoryScopes = ["personal", "workspace", "capability", "thread"] as const;
const memoryStatuses = [
  "active",
  "proposed",
  "rejected",
  "superseded",
  "expired",
  "deleted",
] as const;
const memorySensitivities = ["low", "moderate", "sensitive"] as const;

type SemanticSearch = {
  scope?: MemoryScope | undefined;
  workspaceId?: string | undefined;
  status: MemoryStatus;
  sensitivity?: MemorySensitivity | undefined;
  confidenceMin?: number | undefined;
  confidenceMax?: number | undefined;
  includeExpired: boolean;
};

export const Route = createFileRoute("/memory/semantic")({
  validateSearch: (search: Record<string, unknown>): SemanticSearch => ({
    scope: parseOneOf(search.scope, memoryScopes),
    workspaceId: typeof search.workspaceId === "string" ? search.workspaceId : undefined,
    status: parseOneOf(search.status, memoryStatuses) ?? "active",
    sensitivity: parseOneOf(search.sensitivity, memorySensitivities),
    confidenceMin: parseOptionalNumber(search.confidenceMin),
    confidenceMax: parseOptionalNumber(search.confidenceMax),
    includeExpired: search.includeExpired === "true",
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const query = compactObject({
      scope: deps.scope,
      workspaceId: deps.workspaceId,
      status: deps.status,
      sensitivity: deps.sensitivity,
      confidenceMin: deps.confidenceMin,
      confidenceMax: deps.confidenceMax,
      includeExpired: deps.includeExpired,
      limit: 100,
    });

    const [memory, workspaces] = await Promise.all([
      listSemanticMemory({ data: query }),
      listWorkspaces({ data: { includeArchived: true, limit: 100 } }),
    ]);

    return {
      memory,
      workspaces,
    };
  },
  component: SemanticMemoryRoute,
});

function SemanticMemoryRoute() {
  const router = useRouter();
  const search = Route.useSearch();
  const { memory, workspaces } = Route.useLoaderData();
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [mutationResult, setMutationResult] = useState<SemanticMemoryMutationResult | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | undefined>();
  const [isCreating, setIsCreating] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function submitCreateSemantic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const evidenceRefs = parseJsonArrayField(String(formData.get("evidenceRefs") ?? ""));

    if (!evidenceRefs.ok) {
      setMutationResult({
        ok: false,
        error: {
          code: "MEMORY_EVIDENCE_REFS_INVALID",
          message: evidenceRefs.error,
        },
      });
      return;
    }

    setIsCreating(true);
    setMutationResult(null);

    const payload = compactObject({
      scope: String(formData.get("scope") ?? "personal"),
      workspaceId: optionalTextValue(formData.get("workspaceId")),
      capabilityId: optionalTextValue(formData.get("capabilityId")),
      threadId: optionalTextValue(formData.get("threadId")),
      subject: String(formData.get("subject") ?? ""),
      predicate: String(formData.get("predicate") ?? ""),
      value: parseJsonOrString(String(formData.get("value") ?? "")),
      confidence: optionalNumberValue(formData.get("confidence")) ?? 1,
      sensitivity: String(formData.get("sensitivity") ?? "low"),
      sourceType: optionalTextValue(formData.get("sourceType")) ?? "manual",
      sourceRef: optionalTextValue(formData.get("sourceRef")),
      sourceExecutionId: optionalTextValue(formData.get("sourceExecutionId")),
      evidenceRefs: evidenceRefs.value,
      expiresAt: optionalTextValue(formData.get("expiresAt")),
    });

    try {
      const nextResult = await createManualSemanticMemory({ data: payload });
      setMutationResult(nextResult);

      if (nextResult.ok) {
        form.reset();
        await router.invalidate();
      }
    } catch {
      setMutationResult({
        ok: false,
        error: {
          code: "MEMORY_CREATE_REQUEST_FAILED",
          message: "Semantic memory create request could not be completed.",
        },
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function reviewProposal(id: string, action: "approve" | "reject") {
    setPendingActionId(id);
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
      setMutationResult({
        ok: false,
        error: {
          code: "MEMORY_PROPOSAL_REQUEST_FAILED",
          message: "Semantic memory proposal request could not be completed.",
        },
      });
    } finally {
      setPendingActionId(undefined);
    }
  }

  return (
    <>
      <section className="page-header" aria-labelledby="semantic-memory-title">
        <span className="eyebrow">Memory Explorer</span>
        <h1 className="page-title" id="semantic-memory-title">
          Semantic memory
        </h1>
        <p className="page-copy">Durable facts with provenance, confidence, and review state.</p>
      </section>

      <MemoryTabs active="semantic" />

      <div className="workspace-grid">
        <section className="section-panel" aria-labelledby="semantic-list-title">
          <div className="section-heading">
            <h2 id="semantic-list-title">Records</h2>
            <span>{search.status}</span>
          </div>
          {workspaces.ok ? (
            <SemanticFilterForm search={search} workspaces={workspaces.workspaces} />
          ) : (
            <SafeError error={workspaces.error} />
          )}
          <div className="detail-actions">
            <button
              className="secondary-button"
              onClick={() => setRevealSensitive((current) => !current)}
              type="button"
            >
              {revealSensitive ? "Mask sensitive" : "Reveal sensitive"}
            </button>
          </div>
          {mutationResult && !mutationResult.ok ? <SafeError error={mutationResult.error} /> : null}
          {memory.ok ? (
            <SemanticMemoryList
              onApprove={(id) => void reviewProposal(id, "approve")}
              onReject={(id) => void reviewProposal(id, "reject")}
              pendingActionId={pendingActionId}
              records={memory.records}
              revealSensitive={revealSensitive}
            />
          ) : (
            <SafeError error={memory.error} />
          )}
        </section>

        <aside className="section-panel" aria-labelledby="create-semantic-title">
          <div className="section-heading">
            <h2 id="create-semantic-title">Manual create</h2>
            <span>semantic</span>
          </div>
          <form
            className="stack-form"
            data-memory-ready={isHydrated ? "true" : "false"}
            onSubmit={submitCreateSemantic}
          >
            <div className="field-grid">
              <label htmlFor="semantic-create-scope">Scope</label>
              <select
                className="select-input"
                defaultValue={search.workspaceId ? "workspace" : "personal"}
                id="semantic-create-scope"
                name="scope"
              >
                {memoryScopes.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </div>
            {workspaces.ok ? (
              <div className="field-grid">
                <label htmlFor="semantic-create-workspace">Workspace</label>
                <WorkspaceSelector
                  autoSubmit={false}
                  includeAllOption
                  selectedWorkspaceId={search.workspaceId}
                  workspaces={workspaces.workspaces}
                />
              </div>
            ) : null}
            <div className="field-grid compact-fields">
              <label>
                Capability ID
                <input name="capabilityId" placeholder="capability.echo" />
              </label>
              <label>
                Thread ID
                <input name="threadId" placeholder="thread_project" />
              </label>
            </div>
            <div className="field-grid">
              <label htmlFor="semantic-subject">Subject</label>
              <input id="semantic-subject" name="subject" placeholder="project.paos" required />
            </div>
            <div className="field-grid">
              <label htmlFor="semantic-predicate">Predicate</label>
              <input
                id="semantic-predicate"
                name="predicate"
                placeholder="prefers.tooling"
                required
              />
            </div>
            <div className="field-grid">
              <label htmlFor="semantic-value">Value</label>
              <textarea
                id="semantic-value"
                name="value"
                placeholder={jsonFieldValue({ note: "server functions only" })}
                required
              />
            </div>
            <div className="field-grid compact-fields">
              <label>
                Confidence
                <input
                  defaultValue="1"
                  max="1"
                  min="0"
                  name="confidence"
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                Sensitivity
                <select className="select-input" defaultValue="low" name="sensitivity">
                  {memorySensitivities.map((sensitivity) => (
                    <option key={sensitivity} value={sensitivity}>
                      {sensitivity}
                    </option>
                  ))}
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
                <input name="sourceRef" />
              </label>
            </div>
            <div className="field-grid">
              <label htmlFor="semantic-source-execution">Source execution</label>
              <input id="semantic-source-execution" name="sourceExecutionId" />
            </div>
            <div className="field-grid">
              <label htmlFor="semantic-evidence">Evidence refs</label>
              <textarea defaultValue="[]" id="semantic-evidence" name="evidenceRefs" />
            </div>
            <div className="field-grid">
              <label htmlFor="semantic-expires">Expires at</label>
              <input
                id="semantic-expires"
                name="expiresAt"
                placeholder="2026-12-31T00:00:00.000Z"
              />
            </div>
            <button
              aria-busy={isCreating}
              className="primary-button"
              disabled={isCreating || !isHydrated}
              type="submit"
            >
              {isCreating ? "Creating" : "Create semantic memory"}
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}

function SemanticFilterForm({
  search,
  workspaces,
}: {
  search: SemanticSearch;
  workspaces: Parameters<typeof WorkspaceSelector>[0]["workspaces"];
}) {
  return (
    <form action="/memory/semantic" className="filter-bar" method="get">
      <select
        aria-label="Scope"
        className="select-input"
        defaultValue={search.scope ?? ""}
        name="scope"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">Any scope</option>
        {memoryScopes.map((scope) => (
          <option key={scope} value={scope}>
            {scope}
          </option>
        ))}
      </select>
      <WorkspaceSelector
        selectedWorkspaceId={search.workspaceId}
        restoreFromLocalStorage
        workspaces={workspaces}
      />
      <select
        aria-label="Status"
        className="select-input"
        defaultValue={search.status}
        name="status"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {memoryStatuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <select
        aria-label="Sensitivity"
        className="select-input"
        defaultValue={search.sensitivity ?? ""}
        name="sensitivity"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">Any sensitivity</option>
        {memorySensitivities.map((sensitivity) => (
          <option key={sensitivity} value={sensitivity}>
            {sensitivity}
          </option>
        ))}
      </select>
      <input
        aria-label="Minimum confidence"
        className="compact-input"
        defaultValue={search.confidenceMin ?? ""}
        max="1"
        min="0"
        name="confidenceMin"
        placeholder="Min confidence"
        step="0.01"
        type="number"
      />
      <input
        aria-label="Maximum confidence"
        className="compact-input"
        defaultValue={search.confidenceMax ?? ""}
        max="1"
        min="0"
        name="confidenceMax"
        placeholder="Max confidence"
        step="0.01"
        type="number"
      />
      <label className="check-control">
        <input
          defaultChecked={search.includeExpired}
          name="includeExpired"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          type="checkbox"
          value="true"
        />
        Include expired
      </label>
      <button className="secondary-button" type="submit">
        Apply filters
      </button>
    </form>
  );
}

function parseOneOf<TValue extends string>(
  value: unknown,
  options: readonly TValue[],
): TValue | undefined {
  return typeof value === "string" && options.includes(value as TValue)
    ? (value as TValue)
    : undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
