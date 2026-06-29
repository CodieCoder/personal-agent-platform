import { createId, nowIso } from "@pap/shared";

export type TestExecutionRequestSource = "web" | "cli" | "worker" | "api" | "scheduled" | "test";

export type TestExecutionRequest = {
  requestId: string;
  capabilityId: string;
  input: unknown;
  source: TestExecutionRequestSource;
  requestedAt: string;
  workspaceId?: string;
  threadId?: string;
};

export type TestExecutionRequestOverrides = Partial<TestExecutionRequest>;

export function createExecutionRequest(
  overrides: TestExecutionRequestOverrides = {},
): TestExecutionRequest {
  return {
    requestId: createId("request"),
    capabilityId: "capability.test",
    input: {},
    source: "test",
    requestedAt: nowIso(),
    ...overrides,
  };
}

export function createExecutionRequestFactory(defaults: TestExecutionRequestOverrides = {}) {
  return (overrides: TestExecutionRequestOverrides = {}): TestExecutionRequest =>
    createExecutionRequest({
      ...defaults,
      ...overrides,
    });
}
