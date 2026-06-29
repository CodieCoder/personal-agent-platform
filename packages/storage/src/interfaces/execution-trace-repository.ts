import type {
  CapabilityId,
  ExecutionId,
  ExecutionTraceStepId,
  ExecutionStatus,
  ExecutionTrace,
  ExecutionTraceStep,
  PlatformError,
  ThreadId,
  TraceStepKind,
  TraceStepStatus,
  WorkspaceId,
} from "@pap/contracts";

export type CreateExecutionTraceInput = {
  id: ExecutionId;
  capabilityId: CapabilityId;
  workspaceId?: WorkspaceId;
  threadId?: ThreadId;
  startedAt: string;
};

export type AppendExecutionTraceStepInput = {
  id: ExecutionTraceStepId;
  executionId: ExecutionId;
  sequence: number;
  kind: TraceStepKind;
  name: string;
  status: TraceStepStatus;
  summary?: string;
  startedAt: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type CompleteExecutionTraceInput = {
  executionId: ExecutionId;
  completedAt: string;
};

export type FailExecutionTraceInput = {
  executionId: ExecutionId;
  completedAt: string;
  error: PlatformError;
};

export type CancelExecutionTraceInput = {
  executionId: ExecutionId;
  completedAt: string;
  reason?: string;
};

export type ListRecentExecutionTracesInput = {
  limit?: number;
  status?: ExecutionStatus;
  capabilityId?: CapabilityId;
};

export interface ExecutionTraceRepository {
  create(input: CreateExecutionTraceInput): Promise<ExecutionTrace>;
  appendStep(input: AppendExecutionTraceStepInput): Promise<ExecutionTraceStep>;
  markCompleted(input: CompleteExecutionTraceInput): Promise<ExecutionTrace>;
  markFailed(input: FailExecutionTraceInput): Promise<ExecutionTrace>;
  markCancelled(input: CancelExecutionTraceInput): Promise<ExecutionTrace>;
  getById(executionId: ExecutionId): Promise<ExecutionTrace | null>;
  listRecent(input?: ListRecentExecutionTracesInput): Promise<ExecutionTrace[]>;
}
