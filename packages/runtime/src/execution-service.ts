import {
  capabilityExecutionContextSchema,
  capabilityExecutionRequestSchema,
  capabilityExecutionResultSchema,
  type CapabilityDefinition,
  type CapabilityExecutionContext,
  type CapabilityExecutionRequest,
  type CapabilityExecutionResult,
  type CapabilityId,
  type CapabilityTraceStepInput,
  type PlatformError,
} from "@pap/contracts";
import { createExecutionId, type PapLogger } from "@pap/shared";
import type { ExecutionTraceRepository } from "@pap/storage";
import type { CapabilityRegistry } from "./capability-registry.js";
import {
  createRuntimeSafeError,
  runtimeErrorCodes,
  RuntimeSafeError,
  toPlatformError,
} from "./errors.js";
import { type RuntimeClock, TraceWriter } from "./trace-writer.js";

export type RuntimeExecutionServiceOptions = {
  registry: CapabilityRegistry;
  traceRepository: ExecutionTraceRepository;
  logger?: PapLogger;
  clock?: RuntimeClock;
};

export class RuntimeExecutionService {
  private readonly registry: CapabilityRegistry;
  private readonly traceRepository: ExecutionTraceRepository;
  private readonly logger: PapLogger | undefined;
  private readonly clock: RuntimeClock | undefined;

  constructor(options: RuntimeExecutionServiceOptions) {
    this.registry = options.registry;
    this.traceRepository = options.traceRepository;
    this.logger = options.logger;
    this.clock = options.clock;
  }

  async execute(requestInput: unknown): Promise<CapabilityExecutionResult> {
    const request = this.parseRequest(requestInput);
    const executionId = createExecutionId();
    const capability = this.resolveCapability(request.capabilityId);

    if (capability instanceof RuntimeSafeError) {
      return this.buildResult({
        executionId,
        capabilityId: request.capabilityId,
        status: "failed",
        error: capability.platformError,
      });
    }

    const trace = new TraceWriter(this.traceRepository, this.clock ? { clock: this.clock } : {});
    await trace.start({
      executionId,
      capabilityId: request.capabilityId,
      ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
      ...(request.threadId ? { threadId: request.threadId } : {}),
    });

    const parsedInput = capability.inputSchema.safeParse(request.input);

    if (!parsedInput.success) {
      const error = createRuntimeSafeError({
        code: runtimeErrorCodes.capabilityInputInvalid,
        message: `Input for ${request.capabilityId} failed validation.`,
        category: "validation",
        details: { issues: summarizeValidationIssues(parsedInput.error) },
      }).platformError;

      await trace.fail(error);
      return this.buildResult({
        executionId,
        capabilityId: request.capabilityId,
        status: "failed",
        error,
      });
    }

    try {
      const output = await capability.execute(
        parsedInput.data,
        this.createExecutionContext({
          executionId,
          capability,
          request,
          trace,
        }),
      );
      const parsedOutput = capability.outputSchema.safeParse(output);

      if (!parsedOutput.success) {
        const error = createRuntimeSafeError({
          code: runtimeErrorCodes.capabilityOutputInvalid,
          message: `Output from ${request.capabilityId} failed validation.`,
          category: "validation",
          details: { issues: summarizeValidationIssues(parsedOutput.error) },
        }).platformError;

        await trace.fail(error);
        return this.buildResult({
          executionId,
          capabilityId: request.capabilityId,
          status: "failed",
          error,
        });
      }

      await trace.complete();
      return this.buildResult({
        executionId,
        capabilityId: request.capabilityId,
        status: "completed",
        data: parsedOutput.data,
      });
    } catch (error) {
      const platformError = toPlatformError(error, {
        code: runtimeErrorCodes.capabilityExecutionFailed,
        message: `Capability ${request.capabilityId} failed during execution.`,
        category: "capability",
      });

      this.logger?.debug({ err: platformError, executionId }, "Capability execution failed.");
      await trace.fail(platformError);
      return this.buildResult({
        executionId,
        capabilityId: request.capabilityId,
        status: "failed",
        error: platformError,
      });
    }
  }

  private parseRequest(requestInput: unknown): CapabilityExecutionRequest {
    const parsedRequest = capabilityExecutionRequestSchema.safeParse(requestInput);

    if (!parsedRequest.success) {
      throw createRuntimeSafeError({
        code: runtimeErrorCodes.capabilityInputInvalid,
        message: "Capability execution request failed validation.",
        category: "validation",
        details: { issues: summarizeValidationIssues(parsedRequest.error) },
      });
    }

    return parsedRequest.data;
  }

  private resolveCapability(capabilityId: CapabilityId): CapabilityDefinition | RuntimeSafeError {
    try {
      return this.registry.get(capabilityId);
    } catch (error) {
      if (error instanceof RuntimeSafeError) {
        return error;
      }

      throw error;
    }
  }

  private createExecutionContext(input: {
    executionId: string;
    capability: CapabilityDefinition;
    request: CapabilityExecutionRequest;
    trace: TraceWriter;
  }): CapabilityExecutionContext {
    return capabilityExecutionContextSchema.parse({
      executionId: input.executionId,
      capability: input.capability.manifest,
      source: input.request.source,
      ...(input.request.workspaceId ? { workspaceId: input.request.workspaceId } : {}),
      ...(input.request.threadId ? { threadId: input.request.threadId } : {}),
      trace: {
        addStep: async (step: CapabilityTraceStepInput) => {
          await input.trace.addStep(step);
        },
      },
      tools: {
        execute: async () => unavailableRuntimeFeature("tools"),
      },
      memory: {
        getMasterProfile: async () => unavailableRuntimeFeature("memory"),
        search: async () => unavailableRuntimeFeature("memory"),
        write: async () => unavailableRuntimeFeature("memory"),
      },
      llm: {
        generateStructured: async () => unavailableRuntimeFeature("llm"),
      },
      ui: {
        build: async () => unavailableRuntimeFeature("ui"),
      },
      approvals: {
        request: async () => unavailableRuntimeFeature("approvals"),
      },
    });
  }

  private buildResult(input: {
    executionId: string;
    capabilityId: CapabilityId;
    status: "completed" | "failed" | "cancelled" | "running";
    data?: unknown;
    error?: PlatformError;
  }): CapabilityExecutionResult {
    return capabilityExecutionResultSchema.parse({
      executionId: input.executionId,
      traceId: input.executionId,
      capabilityId: input.capabilityId,
      status: input.status,
      ...(input.data !== undefined ? { data: input.data } : {}),
      ...(input.error ? { error: input.error } : {}),
    });
  }
}

type ValidationIssue = {
  path: PropertyKey[];
  message: string;
};

type ValidationErrorLike = {
  issues: ValidationIssue[];
};

function summarizeValidationIssues(error: ValidationErrorLike): Record<string, unknown>[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

function unavailableRuntimeFeature(feature: string): never {
  throw createRuntimeSafeError({
    code: runtimeErrorCodes.runtimeFeatureUnavailable,
    message: `Runtime feature is not available in this slice: ${feature}`,
    category: "capability",
    details: { feature },
  });
}
