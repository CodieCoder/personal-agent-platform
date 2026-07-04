import { createServerFn } from "@tanstack/react-start";
import {
  getResearchReportOperation,
  listResearchReportsOperation,
  runResearchOperation,
} from "./operations";

export const runResearch = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => withResearchState((state) => runResearchOperation(state, data)));

export const listResearchReports = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => listResearchReportsOperation(state, data)),
  );

export const getResearchReport = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => getResearchReportOperation(state, data)),
  );

async function withResearchState<T>(
  operation: (state: Awaited<ReturnType<typeof getResearchOperationState>>) => Promise<T>,
): Promise<T> {
  const state = await getResearchOperationState();
  return operation(state);
}

async function getResearchOperationState() {
  const { getWebRuntimeState } = await import("../executions/runtime.server");
  const state = getWebRuntimeState();

  return {
    runtime: state.runtime,
    reportRepository: state.researchReportRepository,
    memoryService: state.memoryService,
  };
}
