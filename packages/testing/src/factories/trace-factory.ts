import {
  executionTraceSchema,
  executionTraceStepSchema,
  type ExecutionTrace,
  type ExecutionTraceStep,
} from "@pap/contracts";
import { createExecutionId, createTraceStepId, nowIso } from "@pap/shared";

export function createTraceStep(overrides: Partial<ExecutionTraceStep> = {}): ExecutionTraceStep {
  const executionId = overrides.executionId ?? createExecutionId();
  const timestamp = nowIso();

  return executionTraceStepSchema.parse({
    id: createTraceStepId(),
    executionId,
    sequence: 0,
    kind: "workflow",
    name: "test step",
    status: "completed",
    startedAt: timestamp,
    completedAt: timestamp,
    createdAt: timestamp,
    ...overrides,
  });
}

export function createTrace(overrides: Partial<ExecutionTrace> = {}): ExecutionTrace {
  const id = overrides.id ?? createExecutionId();
  const timestamp = nowIso();
  const steps = overrides.steps ?? [createTraceStep({ executionId: id })];

  return executionTraceSchema.parse({
    id,
    capabilityId: "capability.test",
    status: "completed",
    startedAt: timestamp,
    completedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    steps,
    ...overrides,
  });
}
