import { executionIdSchema, executionTraceSchema, platformErrorSchema, z } from "@pap/contracts";
import { createServerFn } from "@tanstack/react-start";
import type {
  EchoExecutionResult,
  ExecutionTraceResult,
  RecentExecutionsResult,
  RecentExecutionSummary,
  SafeWebError,
  WebStatusResult,
} from "./types";

const echoFormInputSchema = z
  .object({
    message: z.string().trim().min(1, "Echo message cannot be empty."),
  })
  .strict();

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
    };
  }

  return input;
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
