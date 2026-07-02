import {
  capabilityTraceStepInputSchema,
  type CapabilityId,
  type CapabilityTraceStepInput,
  type ExecutionId,
  type ExecutionStatus,
  type ExecutionTrace,
  type ExecutionTraceStep,
  type PlatformError,
  type ThreadId,
  type WorkspaceId,
} from "@pap/contracts";
import { createExecutionId, createTraceStepId, nowIso } from "@pap/shared";
import type { ExecutionTraceRepository } from "@pap/storage";
import { createRuntimeSafeError, runtimeErrorCodes } from "./errors.js";

export type RuntimeClock = () => Date;

export type StartTraceInput = {
  executionId?: ExecutionId;
  capabilityId: CapabilityId;
  workspaceId?: WorkspaceId;
  threadId?: ThreadId;
};

export type TraceWriterOptions = {
  clock?: RuntimeClock;
};

export class TraceWriter {
  private readonly clock: RuntimeClock;
  private executionId?: ExecutionId;
  private nextSequence = 0;
  private terminalStatus?: ExecutionStatus;

  constructor(
    private readonly traceRepository: ExecutionTraceRepository,
    options: TraceWriterOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  get currentExecutionId(): ExecutionId | undefined {
    return this.executionId;
  }

  async start(input: StartTraceInput): Promise<ExecutionTrace> {
    if (this.executionId) {
      throw createRuntimeSafeError({
        code: runtimeErrorCodes.traceAlreadyStarted,
        message: "Execution trace has already been started.",
        category: "capability",
      });
    }

    const executionId = input.executionId ?? createExecutionId();
    const trace = await this.traceRepository.create({
      id: executionId,
      capabilityId: input.capabilityId,
      startedAt: nowIso(this.clock),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
    });

    this.executionId = executionId;
    return trace;
  }

  async addStep(input: CapabilityTraceStepInput): Promise<ExecutionTraceStep> {
    const executionId = this.requireExecutionId();
    this.assertNotFinalized();
    const stepInput = capabilityTraceStepInputSchema.parse(input);

    const timestamp = nowIso(this.clock);
    const status = stepInput.status;
    const completedAt = stepInput.completedAt ?? (status === "started" ? undefined : timestamp);
    const sequence = this.nextSequence;
    this.nextSequence += 1;

    const step = await this.traceRepository.appendStep({
      id: createTraceStepId(),
      executionId,
      sequence,
      kind: stepInput.kind,
      name: stepInput.name,
      status,
      startedAt: stepInput.startedAt ?? timestamp,
      ...(stepInput.summary ? { summary: stepInput.summary } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(stepInput.errorCode ? { errorCode: stepInput.errorCode } : {}),
      ...(stepInput.errorMessage ? { errorMessage: stepInput.errorMessage } : {}),
      ...(stepInput.metadata ? { metadata: stepInput.metadata } : {}),
    });

    return step;
  }

  async complete(): Promise<ExecutionTrace> {
    const executionId = this.requireExecutionId();
    this.assertNotFinalized();

    const trace = await this.traceRepository.markCompleted({
      executionId,
      completedAt: nowIso(this.clock),
    });

    this.terminalStatus = "completed";
    return trace;
  }

  async fail(error: PlatformError): Promise<ExecutionTrace> {
    const executionId = this.requireExecutionId();
    this.assertNotFinalized();

    const trace = await this.traceRepository.markFailed({
      executionId,
      completedAt: nowIso(this.clock),
      error,
    });

    this.terminalStatus = "failed";
    return trace;
  }

  async cancel(reason?: string): Promise<ExecutionTrace> {
    const executionId = this.requireExecutionId();
    this.assertNotFinalized();

    const trace = await this.traceRepository.markCancelled({
      executionId,
      completedAt: nowIso(this.clock),
      ...(reason ? { reason } : {}),
    });

    this.terminalStatus = "cancelled";
    return trace;
  }

  private requireExecutionId(): ExecutionId {
    if (!this.executionId) {
      throw createRuntimeSafeError({
        code: runtimeErrorCodes.traceNotStarted,
        message: "Execution trace has not been started.",
        category: "capability",
      });
    }

    return this.executionId;
  }

  private assertNotFinalized(): void {
    if (!this.terminalStatus) {
      return;
    }

    throw createRuntimeSafeError({
      code: runtimeErrorCodes.traceAlreadyFinalized,
      message: `Execution trace is already ${this.terminalStatus}.`,
      category: "capability",
      details: { status: this.terminalStatus },
    });
  }
}
