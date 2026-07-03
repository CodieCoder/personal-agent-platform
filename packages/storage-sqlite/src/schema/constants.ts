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

export const workspaceStatuses = ["active", "archived"] as const;

export const memoryScopes = ["personal", "workspace", "capability", "thread"] as const;

export const memoryStatuses = [
  "active",
  "proposed",
  "rejected",
  "superseded",
  "expired",
  "deleted",
] as const;

export const memorySensitivities = ["low", "moderate", "sensitive"] as const;
