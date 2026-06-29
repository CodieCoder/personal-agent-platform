import {
  executionTraceSchema,
  executionTraceStepSchema,
  type ExecutionId,
  type ExecutionTrace,
  type ExecutionTraceStep,
} from "@pap/contracts";
import { nowIso } from "@pap/shared";
import type {
  AppendExecutionTraceStepInput,
  CancelExecutionTraceInput,
  CompleteExecutionTraceInput,
  CreateExecutionTraceInput,
  ExecutionTraceRepository,
  FailExecutionTraceInput,
  ListRecentExecutionTracesInput,
} from "@pap/storage";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  executionTraceSteps,
  executionTraces,
  type ExecutionTraceRow,
  type ExecutionTraceStepRow,
} from "../schema/index.js";
import type * as sqliteSchema from "../schema/index.js";

const defaultRecentLimit = 20;
const maxRecentLimit = 100;

export class SqliteExecutionTraceRepository implements ExecutionTraceRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof sqliteSchema>) {}

  async create(input: CreateExecutionTraceInput): Promise<ExecutionTrace> {
    const timestamp = nowIso();

    await this.db.insert(executionTraces).values({
      id: input.id,
      capabilityId: input.capabilityId,
      status: "running",
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      startedAt: input.startedAt,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const trace = await this.getById(input.id);
    return requireTrace(trace, input.id);
  }

  async appendStep(input: AppendExecutionTraceStepInput): Promise<ExecutionTraceStep> {
    const timestamp = nowIso();

    await this.db.insert(executionTraceSteps).values({
      id: input.id,
      executionId: input.executionId,
      sequence: input.sequence,
      kind: input.kind,
      name: input.name,
      status: input.status,
      summary: input.summary,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      createdAt: timestamp,
    });

    const [step] = await this.db
      .select()
      .from(executionTraceSteps)
      .where(eq(executionTraceSteps.id, input.id))
      .limit(1);

    if (!step) {
      throw new Error(`Execution trace step was not found after insert: ${input.id}`);
    }

    return toExecutionTraceStep(step);
  }

  async markCompleted(input: CompleteExecutionTraceInput): Promise<ExecutionTrace> {
    await this.db
      .update(executionTraces)
      .set({
        status: "completed",
        completedAt: input.completedAt,
        errorCode: null,
        errorMessage: null,
        updatedAt: nowIso(),
      })
      .where(eq(executionTraces.id, input.executionId));

    const trace = await this.getById(input.executionId);
    return requireTrace(trace, input.executionId);
  }

  async markFailed(input: FailExecutionTraceInput): Promise<ExecutionTrace> {
    await this.db
      .update(executionTraces)
      .set({
        status: "failed",
        completedAt: input.completedAt,
        errorCode: input.error.code,
        errorMessage: input.error.message,
        updatedAt: nowIso(),
      })
      .where(eq(executionTraces.id, input.executionId));

    const trace = await this.getById(input.executionId);
    return requireTrace(trace, input.executionId);
  }

  async markCancelled(input: CancelExecutionTraceInput): Promise<ExecutionTrace> {
    await this.db
      .update(executionTraces)
      .set({
        status: "cancelled",
        completedAt: input.completedAt,
        errorCode: "EXECUTION_CANCELLED",
        errorMessage: input.reason ?? "Execution cancelled.",
        updatedAt: nowIso(),
      })
      .where(eq(executionTraces.id, input.executionId));

    const trace = await this.getById(input.executionId);
    return requireTrace(trace, input.executionId);
  }

  async getById(executionId: ExecutionId): Promise<ExecutionTrace | null> {
    const [trace] = await this.db
      .select()
      .from(executionTraces)
      .where(eq(executionTraces.id, executionId))
      .limit(1);

    if (!trace) {
      return null;
    }

    const steps = await this.getSteps(executionId);
    return toExecutionTrace(trace, steps);
  }

  async listRecent(input: ListRecentExecutionTracesInput = {}): Promise<ExecutionTrace[]> {
    const limit = normalizeRecentLimit(input.limit);
    const filters: SQL[] = [];

    if (input.status) {
      filters.push(eq(executionTraces.status, input.status));
    }

    if (input.capabilityId) {
      filters.push(eq(executionTraces.capabilityId, input.capabilityId));
    }

    const rows =
      filters.length > 0
        ? await this.db
            .select()
            .from(executionTraces)
            .where(and(...filters))
            .orderBy(desc(executionTraces.startedAt))
            .limit(limit)
        : await this.db
            .select()
            .from(executionTraces)
            .orderBy(desc(executionTraces.startedAt))
            .limit(limit);

    const traces: ExecutionTrace[] = [];

    for (const row of rows) {
      traces.push(toExecutionTrace(row, await this.getSteps(row.id)));
    }

    return traces;
  }

  private async getSteps(executionId: ExecutionId): Promise<ExecutionTraceStep[]> {
    const rows = await this.db
      .select()
      .from(executionTraceSteps)
      .where(eq(executionTraceSteps.executionId, executionId))
      .orderBy(asc(executionTraceSteps.sequence));

    return rows.map(toExecutionTraceStep);
  }
}

function normalizeRecentLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return defaultRecentLimit;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), maxRecentLimit);
}

function toExecutionTrace(row: ExecutionTraceRow, steps: ExecutionTraceStep[]): ExecutionTrace {
  return executionTraceSchema.parse({
    id: row.id,
    capabilityId: row.capabilityId,
    status: row.status,
    workspaceId: row.workspaceId ?? undefined,
    threadId: row.threadId ?? undefined,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    steps,
  });
}

function toExecutionTraceStep(row: ExecutionTraceStepRow): ExecutionTraceStep {
  return executionTraceStepSchema.parse({
    id: row.id,
    executionId: row.executionId,
    sequence: row.sequence,
    kind: row.kind,
    name: row.name,
    status: row.status,
    summary: row.summary ?? undefined,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt,
  });
}

function requireTrace(trace: ExecutionTrace | null, executionId: ExecutionId): ExecutionTrace {
  if (!trace) {
    throw new Error(`Execution trace not found: ${executionId}`);
  }

  return trace;
}
