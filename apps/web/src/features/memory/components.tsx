import { Link } from "@tanstack/react-router";
import type {
  EpisodicMemoryRecord,
  JsonValue,
  MemorySensitivity,
  MemoryStatus,
  SemanticMemoryRecord,
} from "@pap/contracts";
import { DataRow, formatTimestamp } from "../executions/components";

export type MemoryRouteKind = "overview" | "semantic" | "episodes";

export function MemoryTabs({ active }: { active: MemoryRouteKind }) {
  return (
    <nav aria-label={`Memory sections, ${active} selected`} className="tab-list">
      <Link activeProps={{ "aria-current": "page" }} to="/memory">
        Overview
      </Link>
      <Link
        activeProps={{ "aria-current": "page" }}
        search={{ status: "active", includeExpired: false }}
        to="/memory/semantic"
      >
        Semantic
      </Link>
      <Link
        activeProps={{ "aria-current": "page" }}
        search={{ status: "active", includeExpired: false }}
        to="/memory/episodes"
      >
        Episodes
      </Link>
    </nav>
  );
}

export function MemoryStatusPill({ status }: { status: MemoryStatus }) {
  const className =
    status === "active"
      ? "pill pill-success"
      : status === "deleted" || status === "rejected" || status === "expired"
        ? "pill pill-error"
        : "pill pill-neutral";

  return <span className={className}>{status}</span>;
}

export function SensitivityPill({ sensitivity }: { sensitivity: MemorySensitivity }) {
  const className = sensitivity === "sensitive" ? "pill pill-error" : "pill pill-neutral";

  return <span className={className}>{sensitivity}</span>;
}

export function ConfidenceMeter({ confidence }: { confidence: number }) {
  return <span>{Math.round(confidence * 100)}%</span>;
}

export function SemanticMemoryList({
  records,
  revealSensitive,
  onApprove,
  onReject,
  pendingActionId,
}: {
  records: SemanticMemoryRecord[];
  revealSensitive: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  pendingActionId?: string | undefined;
}) {
  if (records.length === 0) {
    return <p className="empty-state">No semantic memory records match these filters.</p>;
  }

  return (
    <ul className="entity-list">
      {records.map((record) => {
        const isSensitive = record.sensitivity === "sensitive" && !revealSensitive;

        return (
          <li className="entity-item" key={record.id}>
            <div className="entity-item-body">
              <Link to="/memory/$memoryId" params={{ memoryId: record.id }}>
                <span className="entity-item-header">
                  <span>
                    {record.subject} / {record.predicate}
                  </span>
                  <span className="pill-row">
                    <MemoryStatusPill status={record.status} />
                    <SensitivityPill sensitivity={record.sensitivity} />
                  </span>
                </span>
                <span className="trace-meta">
                  {record.scope} - confidence <ConfidenceMeter confidence={record.confidence} /> -
                  updated {formatTimestamp(record.updatedAt)}
                </span>
                {record.sourceExecutionId ? (
                  <span className="trace-meta">
                    source execution <span className="code-value">{record.sourceExecutionId}</span>
                  </span>
                ) : null}
                <JsonPreview masked={isSensitive} value={record.value} />
              </Link>
              {record.status === "proposed" && onApprove && onReject ? (
                <div className="inline-actions">
                  <button
                    className="secondary-button"
                    disabled={pendingActionId === record.id}
                    onClick={() => onApprove(record.id)}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="secondary-button"
                    disabled={pendingActionId === record.id}
                    onClick={() => onReject(record.id)}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function EpisodicMemoryList({
  records,
  revealSensitive,
}: {
  records: EpisodicMemoryRecord[];
  revealSensitive: boolean;
}) {
  if (records.length === 0) {
    return <p className="empty-state">No episodic memory records match these filters.</p>;
  }

  return (
    <ul className="entity-list">
      {records.map((record) => {
        const isSensitive = record.sensitivity === "sensitive" && !revealSensitive;

        return (
          <li className="entity-item" key={record.id}>
            <Link to="/memory/$memoryId" params={{ memoryId: record.id }}>
              <span className="entity-item-header">
                <span>{record.eventType}</span>
                <span className="pill-row">
                  <MemoryStatusPill status={record.status} />
                  <SensitivityPill sensitivity={record.sensitivity} />
                </span>
              </span>
              <span className="trace-meta">
                {record.scope} - confidence <ConfidenceMeter confidence={record.confidence} /> -
                created {formatTimestamp(record.createdAt)}
              </span>
              {record.executionId ? (
                <span className="trace-meta">
                  source execution <span className="code-value">{record.executionId}</span>
                </span>
              ) : null}
              <JsonPreview masked={isSensitive} value={record.summary} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function JsonPreview({ masked, value }: { masked: boolean; value: JsonValue | string }) {
  if (masked) {
    return <span className="trace-meta sensitive-mask">Sensitive value hidden</span>;
  }

  return <span className="trace-meta">{formatJsonPreview(value)}</span>;
}

export function JsonBlock({ masked, value }: { masked: boolean; value: JsonValue | JsonValue[] }) {
  if (masked) {
    return <p className="sensitive-mask">Sensitive payload hidden.</p>;
  }

  return <pre className="json-block">{formatJsonBlock(value)}</pre>;
}

export function SemanticMemoryMetadata({ record }: { record: SemanticMemoryRecord }) {
  return (
    <div className="detail-grid">
      <DataRow label="Memory ID">
        <span className="code-value">{record.id}</span>
      </DataRow>
      <DataRow label="Status">
        <MemoryStatusPill status={record.status} />
      </DataRow>
      <DataRow label="Scope">
        <span>{record.scope}</span>
      </DataRow>
      <DataRow label="Confidence">
        <ConfidenceMeter confidence={record.confidence} />
      </DataRow>
      <DataRow label="Sensitivity">
        <SensitivityPill sensitivity={record.sensitivity} />
      </DataRow>
      <DataRow label="Created">
        <span>{formatTimestamp(record.createdAt)}</span>
      </DataRow>
      <DataRow label="Updated">
        <span>{formatTimestamp(record.updatedAt)}</span>
      </DataRow>
      <OptionalDataRow label="Workspace" value={record.workspaceId} />
      <OptionalDataRow label="Capability" value={record.capabilityId} />
      <OptionalDataRow label="Thread" value={record.threadId} />
      <OptionalDataRow label="Source type" value={record.sourceType} />
      <OptionalDataRow label="Source ref" value={record.sourceRef} />
      <OptionalDataRow label="Source capability" value={record.sourceCapabilityId} />
      <ExecutionDataRow executionId={record.sourceExecutionId} />
      <OptionalDataRow label="Expires" value={record.expiresAt} formatValue={formatTimestamp} />
      <OptionalDataRow label="Supersedes" value={record.supersedesMemoryId} />
      <OptionalDataRow label="Superseded by" value={record.supersededByMemoryId} />
    </div>
  );
}

export function EpisodicMemoryMetadata({ record }: { record: EpisodicMemoryRecord }) {
  return (
    <div className="detail-grid">
      <DataRow label="Memory ID">
        <span className="code-value">{record.id}</span>
      </DataRow>
      <DataRow label="Status">
        <MemoryStatusPill status={record.status} />
      </DataRow>
      <DataRow label="Scope">
        <span>{record.scope}</span>
      </DataRow>
      <DataRow label="Confidence">
        <ConfidenceMeter confidence={record.confidence} />
      </DataRow>
      <DataRow label="Sensitivity">
        <SensitivityPill sensitivity={record.sensitivity} />
      </DataRow>
      <DataRow label="Created">
        <span>{formatTimestamp(record.createdAt)}</span>
      </DataRow>
      <OptionalDataRow label="Workspace" value={record.workspaceId} />
      <OptionalDataRow label="Capability" value={record.capabilityId} />
      <OptionalDataRow label="Thread" value={record.threadId} />
      <OptionalDataRow label="Event type" value={record.eventType} />
      <OptionalDataRow label="Outcome" value={record.outcome} />
      <OptionalDataRow label="Source type" value={record.sourceType} />
      <OptionalDataRow label="Source ref" value={record.sourceRef} />
      <OptionalDataRow label="Source capability" value={record.sourceCapabilityId} />
      <ExecutionDataRow executionId={record.executionId} />
      <OptionalDataRow label="Expires" value={record.expiresAt} formatValue={formatTimestamp} />
    </div>
  );
}

export function ExecutionDataRow({ executionId }: { executionId?: string | undefined }) {
  if (!executionId) {
    return null;
  }

  return (
    <DataRow label="Execution">
      <Link className="text-link" to="/executions/$executionId" params={{ executionId }}>
        {executionId}
      </Link>
    </DataRow>
  );
}

function OptionalDataRow({
  label,
  value,
  formatValue,
}: {
  label: string;
  value?: string | undefined;
  formatValue?: (value: string) => string;
}) {
  if (!value) {
    return null;
  }

  return (
    <DataRow label={label}>
      <span className="code-value">{formatValue ? formatValue(value) : value}</span>
    </DataRow>
  );
}

function formatJsonPreview(value: JsonValue | string): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function formatJsonBlock(value: JsonValue | JsonValue[]): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
