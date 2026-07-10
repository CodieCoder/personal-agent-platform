import {
  createResearchSourceFeedbackInputSchema,
  deleteResearchSourceFeedbackInputSchema,
  getResearchReportFeedbackInputSchema,
  listResearchSourceFeedbackByReportInputSchema,
  memoryIdSchema,
  researchExportFormatSchema,
  researchReportDashboardQuerySchema,
  researchReportHistoryQuerySchema,
  researchReportIdSchema,
  researchReportStatusSchema,
  researchRequestSchema,
  updateResearchSourceFeedbackInputSchema,
  upsertResearchReportFeedbackInputSchema,
  workspaceIdSchema,
  z,
  type ResearchReportStatus,
  type SemanticMemoryRecord,
} from "@pap/contracts";
import { researchCapabilityOutputSchema } from "@pap/capability-research";
import type { MemoryService } from "@pap/memory";
import type {
  ResearchReportFeedbackRepository,
  ResearchReportRepository,
  ResearchSourceFeedbackRepository,
} from "@pap/storage";
import type { Runtime } from "@pap/runtime";
import {
  generateJsonExport,
  generateMarkdownExport,
  generatePlainTextExport,
  type ReportExportData,
} from "@pap/research";
import type { SafeWebError } from "../executions/types";
import type {
  ResearchExportActionResult,
  ResearchFeedbackListResult,
  ResearchFeedbackResult,
  ResearchMemoryProposalActionResult,
  ResearchMemoryProposalDetail,
  ResearchMemoryStatusSummary,
  ResearchReportDashboardResult,
  ResearchReportHistoryResult,
  ResearchReportListResult,
  ResearchReportResult,
  ResearchRunResult,
} from "./types";

export type ResearchOperationState = {
  runtime: Runtime;
  reportRepository: ResearchReportRepository;
  memoryService: MemoryService;
  sourceFeedbackRepository: ResearchSourceFeedbackRepository;
  reportFeedbackRepository: ResearchReportFeedbackRepository;
};

const researchListInputSchema = z
  .object({
    workspaceId: workspaceIdSchema.nullable().default(null),
    status: researchReportStatusSchema.optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(50).default(10),
  })
  .strict();

const researchReportInputSchema = z
  .object({
    reportId: researchReportIdSchema,
    workspaceId: workspaceIdSchema.nullable().default(null),
  })
  .strict();

export async function runResearchOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchRunResult> {
  const parsed = researchRequestSchema.safeParse(coerceResearchRequestInput(input));

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "RESEARCH_REQUEST_INVALID",
        message: "Research request input is not valid.",
      },
    };
  }

  try {
    const result = await state.runtime.execute({
      capabilityId: "capability.research",
      input: parsed.data,
      ...(parsed.data.workspaceId ? { workspaceId: parsed.data.workspaceId } : {}),
      source: "web",
      requestedUi: false,
      context: {
        initiatedBy: "user",
      },
    });

    if (result.status !== "completed") {
      return {
        ok: false,
        executionId: result.executionId,
        traceId: result.traceId,
        error: result.error
          ? {
              code: result.error.code,
              message: result.error.message,
            }
          : {
              code: "RESEARCH_EXECUTION_FAILED",
              message: "Research execution failed without a safe error payload.",
            },
      };
    }

    const output = researchCapabilityOutputSchema.parse(result.data);

    return {
      ok: true,
      executionId: result.executionId,
      traceId: result.traceId,
      reportId: output.reportId,
      workspaceId: output.workspaceId,
      status: output.status,
      memoryProposalStatus: output.memoryProposalStatus,
    };
  } catch (error) {
    return {
      ok: false,
      error: toSafeWebError(error, {
        code: "RESEARCH_EXECUTION_REQUEST_FAILED",
        message: "Research request could not be completed.",
      }),
    };
  }
}

export async function listResearchReportsOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchReportListResult> {
  const parsed = researchListInputSchema.safeParse(input ?? {});

  if (!parsed.success) {
    return invalidInputResult("RESEARCH_LIST_INVALID");
  }

  try {
    const listInput: {
      workspaceId: string | null;
      page: number;
      pageSize: number;
      status?: ResearchReportStatus;
    } = {
      workspaceId: parsed.data.workspaceId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    };

    if (parsed.data.status) {
      listInput.status = parsed.data.status;
    }

    return {
      ok: true,
      page: await state.reportRepository.list(listInput),
    };
  } catch (error) {
    return operationError(error, {
      code: "RESEARCH_LIST_FAILED",
      message: "Research reports could not be loaded.",
    });
  }
}

export async function listResearchReportHistoryOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchReportHistoryResult> {
  const parsed = researchReportHistoryQuerySchema.safeParse(input ?? {});

  if (!parsed.success) {
    return invalidInputResult("RESEARCH_HISTORY_QUERY_INVALID");
  }

  try {
    return {
      ok: true,
      page: await state.reportRepository.listHistory(parsed.data),
    };
  } catch (error) {
    return operationError(error, {
      code: "RESEARCH_HISTORY_LOAD_FAILED",
      message: "Research report history could not be loaded.",
    });
  }
}

export async function getResearchReportDashboardOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchReportDashboardResult> {
  const parsed = researchReportDashboardQuerySchema.safeParse(input ?? {});

  if (!parsed.success) {
    return invalidInputResult("RESEARCH_DASHBOARD_QUERY_INVALID");
  }

  try {
    return {
      ok: true,
      summary: await state.reportRepository.getDashboardSummary(parsed.data),
    };
  } catch (error) {
    return operationError(error, {
      code: "RESEARCH_DASHBOARD_LOAD_FAILED",
      message: "Research dashboard summary could not be loaded.",
    });
  }
}

export async function getResearchReportOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchReportResult> {
  const parsed = researchReportInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("RESEARCH_REPORT_INPUT_INVALID");
  }

  try {
    const report = await state.reportRepository.getById({
      id: parsed.data.reportId,
      workspaceId: parsed.data.workspaceId,
    });

    if (!report) {
      return {
        ok: true,
        found: false,
      };
    }

    return {
      ok: true,
      found: true,
      report,
      memory: await listResearchMemoryStatuses(state, report.executionId, report.workspaceId),
      reportFeedback: await state.reportFeedbackRepository.getByReportId({
        reportId: report.id,
        workspaceId: parsed.data.workspaceId,
      }),
      sourceFeedbackList: await state.sourceFeedbackRepository.listByReport({
        reportId: report.id,
        workspaceId: parsed.data.workspaceId,
      }),
    };
  } catch (error) {
    return operationError(error, {
      code: "RESEARCH_REPORT_LOAD_FAILED",
      message: "Research report could not be loaded.",
    });
  }
}

async function listResearchMemoryStatuses(
  state: ResearchOperationState,
  executionId: string,
  workspaceId: string | null,
): Promise<ResearchMemoryStatusSummary> {
  const [proposed, active, rejected] = await Promise.all([
    state.memoryService.listSemanticMemory({
      sourceExecutionId: executionId,
      status: "proposed",
      limit: 50,
    }),
    state.memoryService.listSemanticMemory({
      sourceExecutionId: executionId,
      status: "active",
      limit: 50,
    }),
    state.memoryService.listSemanticMemory({
      sourceExecutionId: executionId,
      status: "rejected",
      limit: 50,
    }),
  ]);

  const records: ResearchMemoryProposalDetail[] = [];

  const allRecords = [...proposed, ...active, ...rejected];
  const conflictingCache = new Map<string, SemanticMemoryRecord[]>();

  for (const record of allRecords) {
    const cacheKey = `${record.subject}:${record.predicate}`;
    let conflictingActive: SemanticMemoryRecord[];

    if (conflictingCache.has(cacheKey)) {
      conflictingActive = conflictingCache.get(cacheKey)!;
    } else {
      conflictingActive = await findConflictingActiveMemory(
        state.memoryService,
        record,
        workspaceId,
      );
      conflictingCache.set(cacheKey, conflictingActive);
    }

    records.push({
      record,
      conflictingActive,
    });
  }

  return {
    status: summarizeMemoryStatus({
      proposed: proposed.length,
      active: active.length,
      rejected: rejected.length,
    }),
    total: records.length,
    proposed: proposed.length,
    active: active.length,
    rejected: rejected.length,
    records,
  };
}

async function findConflictingActiveMemory(
  memoryService: MemoryService,
  proposal: SemanticMemoryRecord,
  workspaceId: string | null,
): Promise<SemanticMemoryRecord[]> {
  const query: {
    subject: string;
    predicate: string;
    status: "active";
    limit: number;
    workspaceId?: string;
  } = {
    subject: proposal.subject,
    predicate: proposal.predicate,
    status: "active",
    limit: 10,
  };

  if (workspaceId !== null) {
    query.workspaceId = workspaceId;
  }

  const activeRecords = await memoryService.listSemanticMemory(query);

  return activeRecords.filter((record) => record.id !== proposal.id);
}

function summarizeMemoryStatus(input: {
  proposed: number;
  active: number;
  rejected: number;
}): ResearchMemoryStatusSummary["status"] {
  const nonZeroStatuses = [input.proposed, input.active, input.rejected].filter(
    (count) => count > 0,
  ).length;

  if (nonZeroStatuses === 0) {
    return "none";
  }

  if (nonZeroStatuses > 1) {
    return "mixed";
  }

  if (input.proposed > 0) {
    return "pending_review";
  }

  return input.active > 0 ? "active" : "rejected";
}

export async function upsertReportFeedbackOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchFeedbackResult> {
  const parsed = upsertResearchReportFeedbackInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("RESEARCH_REPORT_FEEDBACK_INPUT_INVALID");
  }

  try {
    return {
      ok: true,
      data: await state.reportFeedbackRepository.upsert(parsed.data),
    };
  } catch (error) {
    return operationError(error, {
      code: "RESEARCH_REPORT_FEEDBACK_UPSERT_FAILED",
      message: "Report feedback could not be saved.",
    });
  }
}

export async function getReportFeedbackOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchFeedbackResult> {
  const parsed = getResearchReportFeedbackInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("RESEARCH_REPORT_FEEDBACK_INPUT_INVALID");
  }

  try {
    return {
      ok: true,
      data: await state.reportFeedbackRepository.getByReportId(parsed.data),
    };
  } catch (error) {
    return operationError(error, {
      code: "RESEARCH_REPORT_FEEDBACK_LOAD_FAILED",
      message: "Report feedback could not be loaded.",
    });
  }
}

export async function createSourceFeedbackOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchFeedbackResult> {
  const parsed = createResearchSourceFeedbackInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("RESEARCH_SOURCE_FEEDBACK_INPUT_INVALID");
  }

  try {
    return {
      ok: true,
      data: await state.sourceFeedbackRepository.create(parsed.data),
    };
  } catch (error) {
    return operationError(error, {
      code: "RESEARCH_SOURCE_FEEDBACK_CREATE_FAILED",
      message: "Source feedback could not be saved.",
    });
  }
}

export async function updateSourceFeedbackOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchFeedbackResult> {
  const parsed = updateResearchSourceFeedbackInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("RESEARCH_SOURCE_FEEDBACK_INPUT_INVALID");
  }

  try {
    return {
      ok: true,
      data: await state.sourceFeedbackRepository.update(parsed.data),
    };
  } catch (error) {
    return operationError(error, {
      code: "RESEARCH_SOURCE_FEEDBACK_UPDATE_FAILED",
      message: "Source feedback could not be updated.",
    });
  }
}

export async function deleteSourceFeedbackOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchFeedbackResult> {
  const parsed = deleteResearchSourceFeedbackInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("RESEARCH_SOURCE_FEEDBACK_INPUT_INVALID");
  }

  try {
    await state.sourceFeedbackRepository.delete(parsed.data);
    return { ok: true };
  } catch (error) {
    return operationError(error, {
      code: "RESEARCH_SOURCE_FEEDBACK_DELETE_FAILED",
      message: "Source feedback could not be removed.",
    });
  }
}

export async function listSourceFeedbackOperation(
  state: ResearchOperationState,
  input: unknown,
): Promise<ResearchFeedbackListResult> {
  const parsed = listResearchSourceFeedbackByReportInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputListResult("RESEARCH_SOURCE_FEEDBACK_LIST_INVALID");
  }

  try {
    return {
      ok: true,
      data: await state.sourceFeedbackRepository.listByReport(parsed.data),
    };
  } catch (error) {
    return operationListError(error, {
      code: "RESEARCH_SOURCE_FEEDBACK_LOAD_FAILED",
      message: "Source feedback could not be loaded.",
    });
  }
}

function invalidInputListResult(code: string): { ok: false; error: SafeWebError } {
  return {
    ok: false,
    error: {
      code,
      message: "Research request input is not valid.",
    },
  };
}

function operationListError(
  error: unknown,
  fallback: SafeWebError,
): { ok: false; error: SafeWebError } {
  return {
    ok: false,
    error: toSafeWebError(error, fallback),
  };
}

function coerceResearchRequestInput(input: unknown): unknown {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    const workspaceId = normalizeOptionalString(input.get("workspaceId"));
    const focus = normalizeOptionalString(input.get("focus"));
    const timeRange = normalizeOptionalString(input.get("timeRange"));
    const language = normalizeOptionalString(input.get("language"));
    const maxSources = normalizeOptionalNumber(input.get("maxSources"));
    const maxSearchResults = normalizeOptionalNumber(input.get("maxSearchResults"));
    const categories = normalizeCategories(input.get("categories"));
    const proposeMemory = input.get("memoryProposalMode") === "propose";

    return {
      question: String(input.get("question") ?? ""),
      workspaceId,
      focus,
      timeRange,
      maxSources,
      maxSearchResults,
      language,
      categories,
      memoryProposalMode: proposeMemory ? "propose" : "none",
    };
  }

  return input;
}

function normalizeOptionalString(value: FormDataEntryValue | null): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalNumber(value: FormDataEntryValue | null): number | null {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCategories(value: FormDataEntryValue | null): string[] | null {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    return null;
  }

  const categories = normalized
    .split(",")
    .map((category) => category.trim())
    .filter(Boolean);

  return categories.length > 0 ? categories : null;
}

function invalidInputResult(code: string): { ok: false; error: SafeWebError } {
  return {
    ok: false,
    error: {
      code,
      message: "Research request input is not valid.",
    },
  };
}

function operationError(
  error: unknown,
  fallback: SafeWebError,
): { ok: false; error: SafeWebError } {
  return {
    ok: false,
    error: toSafeWebError(error, fallback),
  };
}

function toSafeWebError(error: unknown, fallback: SafeWebError): SafeWebError {
  if (typeof error === "object" && error !== null && "platformError" in error) {
    const platformError = (error as { platformError?: { code?: unknown; message?: unknown } })
      .platformError;

    if (typeof platformError?.code === "string" && typeof platformError.message === "string") {
      return {
        code: platformError.code,
        message: platformError.message,
      };
    }
  }

  return fallback;
}
