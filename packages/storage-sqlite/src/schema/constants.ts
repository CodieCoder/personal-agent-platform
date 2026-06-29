export const executionStatuses = ["running", "completed", "failed", "cancelled"] as const;

export const traceStepStatuses = ["started", "completed", "failed", "skipped"] as const;

export const traceStepKinds = [
  "skill",
  "validation",
  "tool",
  "memory",
  "approval",
  "ui",
  "llm",
  "workflow",
] as const;
