import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { MemoryScope, MemorySensitivity, MemoryStatus } from "@pap/contracts";
import { SafeError } from "../features/executions/components";
import { EpisodicMemoryList, MemoryTabs } from "../features/memory/components";
import { listEpisodicMemory } from "../features/memory/server";
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

type EpisodicSearch = {
  scope?: MemoryScope | undefined;
  workspaceId?: string | undefined;
  status: MemoryStatus;
  sensitivity?: MemorySensitivity | undefined;
  confidenceMin?: number | undefined;
  confidenceMax?: number | undefined;
  executionId?: string | undefined;
  eventType?: string | undefined;
  includeExpired: boolean;
};

export const Route = createFileRoute("/memory/episodes")({
  validateSearch: (search: Record<string, unknown>): EpisodicSearch => ({
    scope: parseOneOf(search.scope, memoryScopes),
    workspaceId: typeof search.workspaceId === "string" ? search.workspaceId : undefined,
    status: parseOneOf(search.status, memoryStatuses) ?? "active",
    sensitivity: parseOneOf(search.sensitivity, memorySensitivities),
    confidenceMin: parseOptionalNumber(search.confidenceMin),
    confidenceMax: parseOptionalNumber(search.confidenceMax),
    executionId: typeof search.executionId === "string" ? search.executionId : undefined,
    eventType: typeof search.eventType === "string" ? search.eventType : undefined,
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
      executionId: deps.executionId,
      eventType: deps.eventType,
      includeExpired: deps.includeExpired,
      limit: 100,
    });

    const [memory, workspaces] = await Promise.all([
      listEpisodicMemory({ data: query }),
      listWorkspaces({ data: { includeArchived: true, limit: 100 } }),
    ]);

    return {
      memory,
      workspaces,
    };
  },
  component: EpisodicMemoryRoute,
});

function EpisodicMemoryRoute() {
  const search = Route.useSearch();
  const { memory, workspaces } = Route.useLoaderData();
  const [revealSensitive, setRevealSensitive] = useState(false);

  return (
    <>
      <section className="page-header" aria-labelledby="episodic-memory-title">
        <span className="eyebrow">Memory Explorer</span>
        <h1 className="page-title" id="episodic-memory-title">
          Episodic memory
        </h1>
        <p className="page-copy">Task events and outcomes tied to executions where present.</p>
      </section>

      <MemoryTabs active="episodes" />

      <section className="section-panel" aria-labelledby="episodic-list-title">
        <div className="section-heading">
          <h2 id="episodic-list-title">Episodes</h2>
          <span>{search.status}</span>
        </div>
        {workspaces.ok ? (
          <EpisodicFilterForm search={search} workspaces={workspaces.workspaces} />
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
        {memory.ok ? (
          <EpisodicMemoryList records={memory.records} revealSensitive={revealSensitive} />
        ) : (
          <SafeError error={memory.error} />
        )}
      </section>
    </>
  );
}

function EpisodicFilterForm({
  search,
  workspaces,
}: {
  search: EpisodicSearch;
  workspaces: Parameters<typeof WorkspaceSelector>[0]["workspaces"];
}) {
  return (
    <form action="/memory/episodes" className="filter-bar" method="get">
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
        aria-label="Execution ID"
        className="compact-input"
        defaultValue={search.executionId ?? ""}
        name="executionId"
        placeholder="Execution ID"
      />
      <input
        aria-label="Event type"
        className="compact-input"
        defaultValue={search.eventType ?? ""}
        name="eventType"
        placeholder="Event type"
      />
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
