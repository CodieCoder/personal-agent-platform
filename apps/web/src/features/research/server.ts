import { createServerFn } from "@tanstack/react-start";
import {
  createSourceFeedbackOperation,
  deleteSourceFeedbackOperation,
  exportResearchReportOperation,
  getResearchReportDashboardOperation,
  getResearchReportOperation,
  getReportFeedbackOperation,
  listResearchReportHistoryOperation,
  listResearchReportsOperation,
  listSourceFeedbackOperation,
  runResearchOperation,
  updateSourceFeedbackOperation,
  upsertReportFeedbackOperation,
} from "./operations";

export const runResearch = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => withResearchState((state) => runResearchOperation(state, data)));

export const listResearchReports = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => listResearchReportsOperation(state, data)),
  );

export const listResearchReportHistory = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => listResearchReportHistoryOperation(state, data)),
  );

export const getResearchReportDashboard = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => getResearchReportDashboardOperation(state, data)),
  );

export const getResearchReport = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => getResearchReportOperation(state, data)),
  );

export const exportResearchReport = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => exportResearchReportOperation(state, data)),
  );

export const upsertReportFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => upsertReportFeedbackOperation(state, data)),
  );

export const getReportFeedback = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => getReportFeedbackOperation(state, data)),
  );

export const createSourceFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => createSourceFeedbackOperation(state, data)),
  );

export const updateSourceFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => updateSourceFeedbackOperation(state, data)),
  );

export const deleteSourceFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => deleteSourceFeedbackOperation(state, data)),
  );

export const getSourceFeedbackList = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withResearchState((state) => listSourceFeedbackOperation(state, data)),
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
    sourceFeedbackRepository: state.researchSourceFeedbackRepository,
    reportFeedbackRepository: state.researchReportFeedbackRepository,
  };
}
