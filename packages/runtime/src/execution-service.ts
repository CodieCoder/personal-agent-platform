import { isAIProviderError, type AIProviderError, type StructuredGenerationService } from "@pap/ai";
import {
  capabilityExecutionContextSchema,
  capabilityExecutionRequestSchema,
  capabilityExecutionResultSchema,
  type CapabilityDefinition,
  type CapabilityExecutionContext,
  type CapabilityExecutionRequest,
  type CapabilityExecutionResult,
  type CapabilityId,
  type CapabilityPermission,
  type CapabilityTraceStepInput,
  type JsonValue,
  type PlatformError,
  type StructuredGenerationResult,
  type TraceStepMetadata,
} from "@pap/contracts";
import type { MemoryService } from "@pap/memory";
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
  memoryService?: MemoryService;
  logger?: PapLogger;
  clock?: RuntimeClock;
  structuredGenerationService?: StructuredGenerationService;
};

export class RuntimeExecutionService {
  private readonly registry: CapabilityRegistry;
  private readonly traceRepository: ExecutionTraceRepository;
  private readonly memoryService: MemoryService | undefined;
  private readonly structuredGenerationService: StructuredGenerationService | undefined;
  private readonly logger: PapLogger | undefined;
  private readonly clock: RuntimeClock | undefined;

  constructor(options: RuntimeExecutionServiceOptions) {
    this.registry = options.registry;
    this.traceRepository = options.traceRepository;
    this.memoryService = options.memoryService;
    this.structuredGenerationService = options.structuredGenerationService;
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

      await trace.addStep({
        kind: "validation",
        name: "validate input",
        status: "failed",
        summary: "Capability input schema rejected the request.",
        errorCode: error.code,
        errorMessage: error.message,
      });
      await trace.fail(error);
      return this.buildResult({
        executionId,
        capabilityId: request.capabilityId,
        status: "failed",
        error,
      });
    }

    await trace.addStep({
      kind: "validation",
      name: "validate input",
      status: "completed",
      summary: "Capability input schema accepted the request.",
    });

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

        await trace.addStep({
          kind: "validation",
          name: "validate output",
          status: "failed",
          summary: "Capability output schema rejected the result.",
          errorCode: error.code,
          errorMessage: error.message,
        });
        await trace.fail(error);
        return this.buildResult({
          executionId,
          capabilityId: request.capabilityId,
          status: "failed",
          error,
        });
      }

      await trace.addStep({
        kind: "validation",
        name: "validate output",
        status: "completed",
        summary: "Capability output schema accepted the result.",
      });
      await trace.addStep({
        kind: "workflow",
        name: "finalize execution",
        status: "completed",
        summary: "Runtime finalized the execution trace.",
      });
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
        getMasterProfile: async () =>
          this.executeMemoryOperation({
            capability: input.capability,
            trace: input.trace,
            permission: "memory.read",
            name: "memory.getMasterProfile",
            completedSummary: "Capability read personal semantic memory.",
            action: (memoryService) => memoryService.getMasterProfile(),
          }),
        search: async (searchInput: unknown) =>
          this.executeMemoryOperation({
            capability: input.capability,
            trace: input.trace,
            permission: "memory.read",
            name: "memory.search",
            completedSummary: "Capability searched bounded memory records.",
            action: (memoryService) => memoryService.search(searchInput),
          }),
        write: async (writeInput: unknown) =>
          this.executeMemoryOperation({
            capability: input.capability,
            trace: input.trace,
            permission: "memory.write",
            name: "memory.write",
            completedSummary: "Capability wrote memory through MemoryService.",
            action: (memoryService) =>
              memoryService.writeFromCapability(
                {
                  executionId: input.executionId,
                  capabilityId: input.capability.manifest.id,
                  ...(input.request.workspaceId ? { workspaceId: input.request.workspaceId } : {}),
                  ...(input.request.threadId ? { threadId: input.request.threadId } : {}),
                },
                writeInput,
              ),
          }),
      },
      llm: {
        generateStructured: async (llmRequest: unknown) =>
          this.executeLlmOperation({
            capability: input.capability,
            trace: input.trace,
            request: llmRequest,
          }),
      },
      ui: {
        build: async () => unavailableRuntimeFeature("ui"),
      },
      approvals: {
        request: async () => unavailableRuntimeFeature("approvals"),
      },
    });
  }

  private async executeLlmOperation(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
    request: unknown;
  }): Promise<StructuredGenerationResult> {
    if (!input.capability.manifest.permissions.includes("llm.generate")) {
      const error = createRuntimeSafeError({
        code: runtimeErrorCodes.llmPermissionDenied,
        message: `Capability ${input.capability.manifest.id} does not have llm.generate.`,
        category: "permission",
        details: {
          capabilityId: input.capability.manifest.id,
          permission: "llm.generate",
        },
      });

      await input.trace.addStep({
        kind: "llm",
        name: "llm.generateStructured",
        status: "failed",
        summary: "Capability lacks llm.generate.",
        errorCode: error.platformError.code,
        errorMessage: error.platformError.message,
      });
      throw error;
    }

    if (!this.structuredGenerationService) {
      const error = createRuntimeSafeError({
        code: runtimeErrorCodes.runtimeFeatureUnavailable,
        message: "Runtime feature is not available in this slice: llm",
        category: "capability",
        details: { feature: "llm" },
      });

      await input.trace.addStep({
        kind: "llm",
        name: "llm.generateStructured",
        status: "failed",
        summary: "Structured generation service is not configured.",
        errorCode: error.platformError.code,
        errorMessage: error.platformError.message,
      });
      throw error;
    }

    try {
      const result = await this.structuredGenerationService.generateStructured(
        input.request as Parameters<StructuredGenerationService["generateStructured"]>[0],
      );

      await input.trace.addStep({
        kind: "llm",
        name: "llm.generateStructured",
        status: "completed",
        summary: "Structured model generation completed.",
        metadata: buildLlmSuccessMetadata(result, input.request),
      });

      return result;
    } catch (error) {
      const runtimeError = isAIProviderError(error)
        ? createRuntimeErrorFromProviderError(error)
        : createRuntimeSafeError({
            code: runtimeErrorCodes.aiProviderFailure,
            message: "Structured model generation failed.",
            category: "llm",
            details: { errorName: errorName(error) },
            cause: error,
          });

      await input.trace.addStep({
        kind: "llm",
        name: "llm.generateStructured",
        status: "failed",
        summary: "Structured model generation failed.",
        errorCode: runtimeError.platformError.code,
        errorMessage: runtimeError.platformError.message,
        ...(isAIProviderError(error)
          ? { metadata: buildLlmErrorMetadata(error, input.request) }
          : {}),
      });

      throw runtimeError;
    }
  }

  private async executeMemoryOperation<T>(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
    permission: Extract<CapabilityPermission, "memory.read" | "memory.write">;
    name: string;
    completedSummary: string;
    action: (memoryService: MemoryService) => Promise<T>;
  }): Promise<T> {
    if (!input.capability.manifest.permissions.includes(input.permission)) {
      const error = createRuntimeSafeError({
        code: runtimeErrorCodes.memoryPermissionDenied,
        message: `Capability ${input.capability.manifest.id} does not have ${input.permission}.`,
        category: "permission",
        details: {
          capabilityId: input.capability.manifest.id,
          permission: input.permission,
        },
      });

      await input.trace.addStep({
        kind: "memory",
        name: input.name,
        status: "failed",
        summary: `Capability lacks ${input.permission}.`,
        errorCode: error.platformError.code,
        errorMessage: error.platformError.message,
      });
      throw error;
    }

    if (!this.memoryService) {
      const error = createRuntimeSafeError({
        code: runtimeErrorCodes.runtimeFeatureUnavailable,
        message: "Runtime feature is not available in this slice: memory",
        category: "capability",
        details: { feature: "memory" },
      });

      await input.trace.addStep({
        kind: "memory",
        name: input.name,
        status: "failed",
        summary: "Memory service is not configured.",
        errorCode: error.platformError.code,
        errorMessage: error.platformError.message,
      });
      throw error;
    }

    try {
      const result = await input.action(this.memoryService);

      await input.trace.addStep({
        kind: "memory",
        name: input.name,
        status: "completed",
        summary: input.completedSummary,
      });

      return result;
    } catch (error) {
      const platformError = toPlatformError(error, {
        code: runtimeErrorCodes.capabilityExecutionFailed,
        message: "Runtime memory operation failed.",
        category: "memory",
      });

      await input.trace.addStep({
        kind: "memory",
        name: input.name,
        status: "failed",
        summary: "Runtime memory operation failed.",
        errorCode: platformError.code,
        errorMessage: platformError.message,
      });

      throw error;
    }
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

function createRuntimeErrorFromProviderError(error: AIProviderError): RuntimeSafeError {
  return createRuntimeSafeError({
    code: runtimeCodeForProviderError(error),
    message: "Structured model provider failed safely.",
    category: "llm",
    retryable: error.retryable,
    details: {
      providerErrorKind: error.code,
      ...(error.providerId ? { providerId: error.providerId } : {}),
      ...(error.details ? { providerDetails: error.details } : {}),
    },
    cause: error,
  });
}

function runtimeCodeForProviderError(error: AIProviderError) {
  switch (error.code) {
    case "provider_not_found":
      return runtimeErrorCodes.aiProviderNotFound;
    case "provider_unavailable":
      return runtimeErrorCodes.aiProviderUnavailable;
    case "provider_timeout":
      return runtimeErrorCodes.aiProviderTimeout;
    case "provider_overloaded":
      return runtimeErrorCodes.aiProviderOverloaded;
    case "provider_http_error":
      return runtimeErrorCodes.aiProviderHttpError;
    case "provider_invalid_response":
      return runtimeErrorCodes.aiProviderInvalidResponse;
    case "provider_schema_invalid":
      return runtimeErrorCodes.aiProviderSchemaInvalid;
    case "provider_disabled":
      return runtimeErrorCodes.aiProviderDisabled;
    default:
      return runtimeErrorCodes.aiProviderFailure;
  }
}

function buildLlmSuccessMetadata(
  result: StructuredGenerationResult,
  request: unknown,
): TraceStepMetadata {
  return removeUndefinedValues({
    providerId: result.providerId,
    model: result.model,
    responseSchemaId: requestMetadataValue(request, "responseSchema", "id"),
    timeoutMs: requestMetadataValue(request, "timeoutMs"),
    keepAlive: requestMetadataValue(request, "keepAlive"),
    temperature: requestMetadataValue(request, "temperature"),
    maxTokens: requestMetadataValue(request, "maxTokens"),
    durationMs: result.durationMs,
    promptTokenCount: result.promptTokenCount,
    completionTokenCount: result.completionTokenCount,
    totalTokenCount: result.totalTokenCount,
  });
}

function buildLlmErrorMetadata(error: AIProviderError, request: unknown): TraceStepMetadata {
  return removeUndefinedValues({
    providerId: error.providerId ?? requestMetadataValue(request, "providerId"),
    model: requestMetadataValue(request, "model"),
    responseSchemaId: requestMetadataValue(request, "responseSchema", "id"),
    timeoutMs: requestMetadataValue(request, "timeoutMs"),
    keepAlive: requestMetadataValue(request, "keepAlive"),
    errorKind: error.code,
    retryable: error.retryable,
    httpStatus:
      typeof error.details?.httpStatus === "number" ? error.details.httpStatus : undefined,
  });
}

function requestMetadataValue(
  request: unknown,
  key: string,
  nestedKey?: string,
): JsonValue | undefined {
  if (typeof request !== "object" || request === null || !(key in request)) {
    return undefined;
  }

  const value = (request as Record<string, unknown>)[key];

  if (nestedKey !== undefined) {
    if (typeof value !== "object" || value === null || !(nestedKey in value)) {
      return undefined;
    }

    return primitiveMetadataValue((value as Record<string, unknown>)[nestedKey]);
  }

  return primitiveMetadataValue(value);
}

function primitiveMetadataValue(value: unknown): JsonValue | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return undefined;
}

function removeUndefinedValues(input: Record<string, JsonValue | undefined>): TraceStepMetadata {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as TraceStepMetadata;
}

function errorName(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name;
  }

  return "UnknownError";
}
