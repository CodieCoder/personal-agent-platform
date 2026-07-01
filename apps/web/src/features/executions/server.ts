import {
  capabilityIdSchema,
  executionIdSchema,
  executionStatusSchema,
  executionTraceListQuerySchema,
  executionTraceSchema,
  platformErrorSchema,
  workspaceIdSchema,
  z,
} from "@pap/contracts";
import { createServerFn } from "@tanstack/react-start";
import type {
  EchoExecutionResult,
  ExecutionHistoryResult,
  ExecutionTraceResult,
  RecentExecutionsResult,
  RecentExecutionSummary,
  SafeWebError,
  WebStatusResult,
} from "./types";

const echoFormInputSchema = z
  .object({
    message: z.string().trim().min(1, "Echo message cannot be empty."),
    workspaceId: workspaceIdSchema.optional(),
  })
  .strict();

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const executionHistoryInputSchema = z
  .object({
    workspaceId: workspaceIdSchema.optional(),
    capabilityId: capabilityIdSchema.optional(),
    status: executionStatusSchema.optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: "Execution history date range cannot be inverted.",
    path: ["to"],
  });

const executionTraceInputSchema = z
  .object({
    executionId: executionIdSchema,
  })
  .strict();

const echoOutputSchema = z
  .object({
    message: z.string().min(1),
    echoedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const getStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<WebStatusResult> => {
    try {
      const { getWebRuntimeState } = await import("./runtime.server");
      const state = getWebRuntimeState();

      return {
        ok: true,
        environment: state.env.PAP_ENVIRONMENT,
        runtime: "ready",
        capabilityIds: state.runtime.listCapabilities().map((capability) => capability.id),
        warningCount: state.warnings.length,
      };
    } catch (error) {
      return {
        ok: false,
        runtime: "unavailable",
        error: toSafeWebError(error, {
          code: "WEB_STATUS_UNAVAILABLE",
          message: "The web runtime status is unavailable.",
        }),
      };
    }
  },
);

export const listRecentExecutions = createServerFn({ method: "GET" }).handler(
  async (): Promise<RecentExecutionsResult> => {
    try {
      const { getWebRuntimeState } = await import("./runtime.server");
      const state = getWebRuntimeState();
      const traces = await state.traceRepository.listRecent({ limit: 10 });

      return {
        ok: true,
        executions: traces.map(
          (trace): RecentExecutionSummary => ({
            id: trace.id,
            capabilityId: trace.capabilityId,
            status: trace.status,
            ...(trace.workspaceId ? { workspaceId: trace.workspaceId } : {}),
            startedAt: trace.startedAt,
            ...(trace.completedAt ? { completedAt: trace.completedAt } : {}),
            stepCount: trace.steps.length,
          }),
        ),
      };
    } catch (error) {
      return {
        ok: false,
        error: toSafeWebError(error, {
          code: "WEB_RECENT_EXECUTIONS_UNAVAILABLE",
          message: "Recent executions could not be loaded.",
        }),
      };
    }
  },
);

export const listExecutionHistory = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }): Promise<ExecutionHistoryResult> => {
    const parsedInput = executionHistoryInputSchema.safeParse(data ?? {});

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_HISTORY_QUERY_INVALID",
          message: "Execution history filters are not valid.",
        },
      };
    }

    const parsedQuery = executionTraceListQuerySchema.safeParse({
      workspaceId: parsedInput.data.workspaceId,
      capabilityId: parsedInput.data.capabilityId,
      status: parsedInput.data.status,
      startedFrom: parsedInput.data.from ? `${parsedInput.data.from}T00:00:00.000Z` : undefined,
      startedTo: parsedInput.data.to ? `${parsedInput.data.to}T23:59:59.999Z` : undefined,
      page: parsedInput.data.page,
      pageSize: parsedInput.data.pageSize,
    });

    if (!parsedQuery.success) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_HISTORY_QUERY_INVALID",
          message: "Execution history filters are not valid.",
        },
      };
    }

    try {
      const { getWebRuntimeState } = await import("./runtime.server");
      const state = getWebRuntimeState();

      return {
        ok: true,
        page: await state.traceRepository.listPage(parsedQuery.data),
      };
    } catch (error) {
      return {
        ok: false,
        error: toSafeWebError(error, {
          code: "EXECUTION_HISTORY_UNAVAILABLE",
          message: "Execution history could not be loaded.",
        }),
      };
    }
  });

export const executeEcho = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }): Promise<EchoExecutionResult> => {
    const parsedInput = echoFormInputSchema.safeParse(coerceEchoInput(data));

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "ECHO_MESSAGE_INVALID",
          message: "Enter a non-empty message before running echo.",
        },
      };
    }

    try {
      const { getWebRuntimeState } = await import("./runtime.server");
      const state = getWebRuntimeState();
      const result = await state.runtime.execute({
        capabilityId: "capability.echo",
        input: {
          message: parsedInput.data.message,
        },
        ...(parsedInput.data.workspaceId ? { workspaceId: parsedInput.data.workspaceId } : {}),
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
          status: result.status,
          error: result.error
            ? {
                code: result.error.code,
                message: result.error.message,
              }
            : {
                code: "ECHO_EXECUTION_FAILED",
                message: "Echo execution failed without a safe error payload.",
              },
        };
      }

      const output = echoOutputSchema.safeParse(result.data);

      if (!output.success) {
        return {
          ok: false,
          executionId: result.executionId,
          traceId: result.traceId,
          status: result.status,
          error: {
            code: "ECHO_OUTPUT_INVALID",
            message: "Echo execution returned an invalid result shape.",
          },
        };
      }

      return {
        ok: true,
        executionId: result.executionId,
        traceId: result.traceId,
        status: "completed",
        message: output.data.message,
        echoedAt: output.data.echoedAt,
      };
    } catch (error) {
      return {
        ok: false,
        error: toSafeWebError(error, {
          code: "ECHO_EXECUTION_UNAVAILABLE",
          message: "Echo execution is unavailable.",
        }),
      };
    }
  });

export const getExecutionTrace = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }): Promise<ExecutionTraceResult> => {
    const parsedInput = executionTraceInputSchema.safeParse(data);

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_ID_INVALID",
          message: "Execution ID is not valid.",
        },
      };
    }

    try {
      const { getWebRuntimeState } = await import("./runtime.server");
      const state = getWebRuntimeState();
      const trace = await state.traceRepository.getById(parsedInput.data.executionId);

      if (!trace) {
        return {
          ok: true,
          found: false,
        };
      }

      return {
        ok: true,
        found: true,
        trace: executionTraceSchema.parse(trace),
      };
    } catch (error) {
      return {
        ok: false,
        error: toSafeWebError(error, {
          code: "EXECUTION_TRACE_UNAVAILABLE",
          message: "Execution trace could not be loaded.",
        }),
      };
    }
  });

function toSafeWebError(
  error: unknown,
  fallback: {
    code: string;
    message: string;
  },
): SafeWebError {
  const parsedPlatformError = parseRuntimePlatformError(error);

  if (parsedPlatformError) {
    return {
      code: parsedPlatformError.code,
      message: parsedPlatformError.message,
    };
  }

  return fallback;
}

function coerceEchoInput(input: unknown): unknown {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    return {
      message: String(input.get("message") ?? ""),
      workspaceId: normalizeOptionalFormValue(input.get("workspaceId")),
    };
  }

  return input;
}

function normalizeOptionalFormValue(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseRuntimePlatformError(error: unknown): SafeWebError | null {
  if (typeof error !== "object" || error === null || !("platformError" in error)) {
    return null;
  }

  const platformError = parsePlatformErrorValue(error.platformError);

  if (!platformError) {
    return null;
  }

  return {
    code: platformError.code,
    message: platformError.message,
  };
}

function parsePlatformErrorValue(error: unknown) {
  const parsed = platformErrorSchema.safeParse(error);
  return parsed.success ? parsed.data : null;
}
