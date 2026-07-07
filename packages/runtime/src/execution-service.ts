import { createHash } from "node:crypto";
import {
  type AIProviderError,
  type AIProviderRegistry,
  isAIProviderError,
  type StructuredGenerationService,
} from "@pap/ai";
import {
  type CapabilityDefinition,
  type CapabilityExecutionContext,
  type CapabilityExecutionRequest,
  type CapabilityExecutionResult,
  type CapabilityId,
  type CapabilityPermission,
  type CapabilityTraceStepInput,
  capabilityExecutionContextSchema,
  capabilityExecutionRequestSchema,
  capabilityExecutionResultSchema,
  type ExtractedDocument,
  type ExtractionMethod,
  type ExtractionRequestInput,
  type ExtractionWarning,
  type FetchRequestInput,
  type FetchResult,
  type FetchUrl,
  fetchUrlSchema,
  type JsonValue,
  jsonValueSchema,
  type PlatformError,
  type ProviderHealth,
  type ProviderId,
  persistWebEvidenceResultSchema,
  type SearchProviderHealth,
  type SearchProviderId,
  type SearchRequest,
  type SearchRequestInput,
  type SearchResponse,
  type StructuredGenerationResult,
  searchRequestSchema,
  type TraceStepMetadata,
  type WebEvidenceFailureCategory,
  type WebSelectedUrlSource,
  type WorkspaceId,
} from "@pap/contracts";
import type { MemoryService } from "@pap/memory";
import { createExecutionId, nowIso, type PapLogger } from "@pap/shared";
import type { SourceProfileService } from "@pap/source-profiles";
import type {
  CreateWebExtractionEvidenceInput,
  CreateWebFetchEvidenceInput,
  CreateWebSearchEvidenceInput,
  ExecutionTraceRepository,
  WebEvidenceRepository,
} from "@pap/storage";
import { isSearchProviderError, type SearchService } from "@pap/tools-search";
import { type GuardedFetchClient, isFetchClientError, type UrlSafetyPolicy } from "@pap/tools-web";
import type { CapabilityRegistry } from "./capability-registry.js";
import {
  createRuntimeSafeError,
  RuntimeSafeError,
  runtimeErrorCodes,
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
  aiProviderRegistry?: AIProviderRegistry;
  searchService?: SearchService;
  defaultSearchProviderId?: SearchProviderId;
  urlSafetyPolicy?: UrlSafetyPolicy;
  guardedFetchClient?: GuardedFetchClient;
  sourceProfileService?: SourceProfileService;
  webEvidenceRepository?: WebEvidenceRepository;
};

export class RuntimeExecutionService {
  private readonly registry: CapabilityRegistry;
  private readonly traceRepository: ExecutionTraceRepository;
  private readonly memoryService: MemoryService | undefined;
  private readonly structuredGenerationService: StructuredGenerationService | undefined;
  private readonly aiProviderRegistry: AIProviderRegistry | undefined;
  private readonly searchService: SearchService | undefined;
  private readonly defaultSearchProviderId: SearchProviderId | undefined;
  private readonly urlSafetyPolicy: UrlSafetyPolicy | undefined;
  private readonly guardedFetchClient: GuardedFetchClient | undefined;
  private readonly sourceProfileService: SourceProfileService | undefined;
  private readonly webEvidenceRepository: WebEvidenceRepository | undefined;
  private readonly logger: PapLogger | undefined;
  private readonly clock: RuntimeClock | undefined;

  constructor(options: RuntimeExecutionServiceOptions) {
    this.registry = options.registry;
    this.traceRepository = options.traceRepository;
    this.memoryService = options.memoryService;
    this.structuredGenerationService = options.structuredGenerationService;
    this.aiProviderRegistry = options.aiProviderRegistry;
    this.searchService = options.searchService;
    this.defaultSearchProviderId = options.defaultSearchProviderId;
    this.urlSafetyPolicy = options.urlSafetyPolicy;
    this.guardedFetchClient = options.guardedFetchClient;
    this.sourceProfileService = options.sourceProfileService;
    this.webEvidenceRepository = options.webEvidenceRepository;
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
      await trace.complete(jsonValueOrUndefined(parsedOutput.data));
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
        getProviderHealth: async (providerId: ProviderId) =>
          this.executeProviderHealthOperation({
            capability: input.capability,
            trace: input.trace,
            providerId,
          }),
      },
      web: {
        resolveSearchProvider: async () =>
          this.resolveSearchProviderOperation({
            capability: input.capability,
            trace: input.trace,
          }),
        getSearchProviderHealth: async (providerId: SearchProviderId) =>
          this.executeSearchProviderHealthOperation({
            capability: input.capability,
            trace: input.trace,
            providerId,
          }),
        search: async (searchInput: SearchRequestInput) =>
          this.executeSearchOperation({
            capability: input.capability,
            trace: input.trace,
            request: searchInput,
          }),
        validateUrlPolicy: async (url: string) =>
          this.executeUrlPolicyOperation({
            capability: input.capability,
            trace: input.trace,
            url,
          }),
        fetch: async (fetchInput: FetchRequestInput) =>
          this.executeFetchOperation({
            capability: input.capability,
            trace: input.trace,
            request: fetchInput,
          }),
        resolveSourceProfile: async (url: FetchUrl) =>
          this.executeSourceProfileResolveOperation({
            capability: input.capability,
            trace: input.trace,
            url,
          }),
        extract: async (extractInput: ExtractionRequestInput) =>
          this.executeExtractionOperation({
            capability: input.capability,
            trace: input.trace,
            request: extractInput,
          }),
        persistEvidence: async (persistInput: unknown) =>
          this.executePersistWebEvidenceOperation({
            capability: input.capability,
            executionId: input.executionId,
            workspaceId: input.request.workspaceId ?? null,
            trace: input.trace,
            input: persistInput,
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

  private async resolveSearchProviderOperation(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
  }): Promise<SearchProviderId> {
    await this.requireWebPermission({
      capability: input.capability,
      trace: input.trace,
      permission: "web.search",
      kind: "workflow",
      name: "resolve search provider",
    });

    if (!this.defaultSearchProviderId) {
      const error = createRuntimeSafeError({
        code: runtimeErrorCodes.runtimeFeatureUnavailable,
        message: "Runtime feature is not available in this slice: web.search",
        category: "capability",
        details: { feature: "web.search" },
      });

      await input.trace.addStep({
        kind: "workflow",
        name: "resolve search provider",
        status: "failed",
        summary: "Default search provider is not configured.",
        errorCode: error.platformError.code,
        errorMessage: error.platformError.message,
        metadata: { failureCategory: "runtime_feature_unavailable" },
      });
      throw error;
    }

    await input.trace.addStep({
      kind: "workflow",
      name: "resolve search provider",
      status: "completed",
      summary: "Resolved the configured search provider.",
      metadata: { providerId: this.defaultSearchProviderId },
    });

    return this.defaultSearchProviderId;
  }

  private async executeSearchProviderHealthOperation(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
    providerId: SearchProviderId;
  }): Promise<SearchProviderHealth> {
    await this.requireWebPermission({
      capability: input.capability,
      trace: input.trace,
      permission: "web.search",
      kind: "tool",
      name: "search provider health check",
    });
    const searchService = await this.requireWebFeature(
      this.searchService,
      "web.search",
      input.trace,
      {
        kind: "tool",
        name: "search provider health check",
      },
    );

    try {
      const health = await searchService.getProviderHealth(input.providerId);

      await input.trace.addStep({
        kind: "tool",
        name: "search provider health check",
        status: "completed",
        summary: "Runtime checked search provider health.",
        metadata: buildSearchProviderHealthMetadata(health),
      });

      return health;
    } catch (error) {
      const runtimeError = createRuntimeErrorFromSearchError(error, input.providerId);

      await input.trace.addStep({
        kind: "tool",
        name: "search provider health check",
        status: "failed",
        summary: "Search provider health check failed.",
        errorCode: runtimeError.platformError.code,
        errorMessage: runtimeError.platformError.message,
        metadata: buildSearchProviderErrorMetadata(error, input.providerId),
      });

      throw runtimeError;
    }
  }

  private async executeSearchOperation(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
    request: SearchRequestInput;
  }): Promise<SearchResponse> {
    await this.requireWebPermission({
      capability: input.capability,
      trace: input.trace,
      permission: "web.search",
      kind: "tool",
      name: "search web",
    });
    const searchService = await this.requireWebFeature(
      this.searchService,
      "web.search",
      input.trace,
      {
        kind: "tool",
        name: "search web",
      },
    );

    const parsedRequest = searchRequestSchema.parse(input.request);

    try {
      const response = await searchService.search(parsedRequest);

      await input.trace.addStep({
        kind: "tool",
        name: "search web",
        status: "completed",
        summary: "Search provider returned normalized results.",
        metadata: {
          providerId: response.providerId,
          query: response.query,
          resultCount: response.results.length,
          durationMs: response.durationMs,
          warningCount: response.warnings.length,
          status: "completed",
        },
      });

      return response;
    } catch (error) {
      const runtimeError = createRuntimeErrorFromSearchError(
        error,
        parsedRequest.providerId ?? this.defaultSearchProviderId,
      );

      await input.trace.addStep({
        kind: "tool",
        name: "search web",
        status: "failed",
        summary: "Search provider failed safely.",
        errorCode: runtimeError.platformError.code,
        errorMessage: runtimeError.platformError.message,
        metadata: removeUndefinedValues({
          providerId: parsedRequest.providerId ?? this.defaultSearchProviderId,
          query: parsedRequest.query,
          resultCount: 0,
          failureCategory: failureCategoryFromError(error, "search_failed"),
          retryable: retryableFromError(error),
          status: "failed",
        }),
      });

      throw runtimeError;
    }
  }

  private async executeUrlPolicyOperation(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
    url: string;
  }): Promise<FetchUrl> {
    await this.requireWebPermission({
      capability: input.capability,
      trace: input.trace,
      permission: "web.fetch",
      kind: "tool",
      name: "validate URL policy",
    });
    const urlSafetyPolicy = await this.requireWebFeature(
      this.urlSafetyPolicy,
      "web.fetch",
      input.trace,
      {
        kind: "tool",
        name: "validate URL policy",
      },
    );

    const startedAt = Date.now();

    try {
      const url = await urlSafetyPolicy.validateUrl(input.url, { phase: "request" });

      await input.trace.addStep({
        kind: "tool",
        name: "validate URL policy",
        status: "completed",
        summary: "Selected URL passed runtime safety policy.",
        metadata: {
          selectedUrl: url,
          durationMs: elapsedMs(startedAt),
          status: "completed",
        },
      });

      return url;
    } catch (error) {
      const runtimeError = createRuntimeErrorFromFetchError(error);

      await input.trace.addStep({
        kind: "tool",
        name: "validate URL policy",
        status: "failed",
        summary: "Selected URL failed runtime safety policy.",
        errorCode: runtimeError.platformError.code,
        errorMessage: runtimeError.platformError.message,
        metadata: removeUndefinedValues({
          selectedUrl: boundedString(input.url, 2_048),
          durationMs: elapsedMs(startedAt),
          failureCategory: failureCategoryFromError(error, "fetch_url_invalid"),
          retryable: retryableFromError(error),
          status: "failed",
        }),
      });

      throw runtimeError;
    }
  }

  private async executeFetchOperation(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
    request: FetchRequestInput;
  }): Promise<FetchResult> {
    await this.requireWebPermission({
      capability: input.capability,
      trace: input.trace,
      permission: "web.fetch",
      kind: "tool",
      name: "fetch URL",
    });
    const guardedFetchClient = await this.requireWebFeature(
      this.guardedFetchClient,
      "web.fetch",
      input.trace,
      {
        kind: "tool",
        name: "fetch URL",
      },
    );

    try {
      const result = await guardedFetchClient.fetch(input.request);

      await input.trace.addStep({
        kind: "tool",
        name: "fetch URL",
        status: "completed",
        summary: "Runtime fetched the selected URL through guarded HTTP.",
        metadata: {
          selectedUrl: result.requestedUrl,
          finalUrl: result.finalUrl,
          statusCode: result.statusCode,
          contentType: result.contentType,
          durationMs: result.durationMs,
          warningCount: result.warnings.length,
          status: "completed",
        },
      });

      return result;
    } catch (error) {
      const runtimeError = createRuntimeErrorFromFetchError(error);
      const requestedUrl = requestUrlMetadata(input.request);

      await input.trace.addStep({
        kind: "tool",
        name: "fetch URL",
        status: "failed",
        summary: "Runtime fetch failed safely.",
        errorCode: runtimeError.platformError.code,
        errorMessage: runtimeError.platformError.message,
        metadata: removeUndefinedValues({
          selectedUrl: requestedUrl,
          finalUrl: fetchErrorUrl(error),
          statusCode: fetchErrorStatusCode(error),
          failureCategory: failureCategoryFromError(error, "fetch_failed"),
          retryable: retryableFromError(error),
          status: "failed",
        }),
      });

      throw runtimeError;
    }
  }

  private async executeSourceProfileResolveOperation(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
    url: FetchUrl;
  }) {
    await this.requireWebPermission({
      capability: input.capability,
      trace: input.trace,
      permission: "web.fetch",
      kind: "tool",
      name: "resolve source profile",
    });
    const sourceProfileService = await this.requireWebFeature(
      this.sourceProfileService,
      "web.fetch",
      input.trace,
      {
        kind: "tool",
        name: "resolve source profile",
      },
    );

    try {
      const profile = await sourceProfileService.findActiveProfileForUrl(input.url);

      await input.trace.addStep({
        kind: "tool",
        name: "resolve source profile",
        status: "completed",
        summary: "Runtime resolved source-profile metadata for the final URL.",
        metadata: {
          finalUrl: input.url,
          sourceProfileId: profile?.id ?? null,
          matched: profile !== null,
        },
      });

      return profile;
    } catch (error) {
      const runtimeError = createRuntimeSafeError({
        code: runtimeErrorCodes.webExtractionFailed,
        message: "Source profile resolution failed safely.",
        category: "tool",
        details: {
          failureCategory: "source_profile_resolution_failed",
          errorName: errorName(error),
        },
        cause: error,
      });

      await input.trace.addStep({
        kind: "tool",
        name: "resolve source profile",
        status: "failed",
        summary: "Source profile resolution failed safely.",
        errorCode: runtimeError.platformError.code,
        errorMessage: runtimeError.platformError.message,
        metadata: {
          finalUrl: input.url,
          matched: false,
          failureCategory: "source_profile_resolution_failed",
          status: "failed",
        },
      });

      throw runtimeError;
    }
  }

  private async executeExtractionOperation(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
    request: ExtractionRequestInput;
  }): Promise<ExtractedDocument> {
    await this.requireWebPermission({
      capability: input.capability,
      trace: input.trace,
      permission: "web.fetch",
      kind: "tool",
      name: "extract readable content",
    });
    const sourceProfileService = await this.requireWebFeature(
      this.sourceProfileService,
      "web.fetch",
      input.trace,
      {
        kind: "tool",
        name: "extract readable content",
      },
    );

    const startedAt = Date.now();

    try {
      const document = await sourceProfileService.extract(input.request);

      await input.trace.addStep({
        kind: "tool",
        name: "extract readable content",
        status: "completed",
        summary: "Runtime extracted bounded readable content.",
        metadata: {
          finalUrl: document.metadata.finalUrl,
          extractionMethod: document.method,
          sourceProfileId: document.metadata.sourceProfileId,
          durationMs: elapsedMs(startedAt),
          warningCount: document.warnings.length,
          status: "completed",
        },
      });

      return document;
    } catch (error) {
      const runtimeError = createRuntimeErrorFromExtractionError(error);

      await input.trace.addStep({
        kind: "tool",
        name: "extract readable content",
        status: "failed",
        summary: "Runtime extraction failed safely.",
        errorCode: runtimeError.platformError.code,
        errorMessage: runtimeError.platformError.message,
        metadata: removeUndefinedValues({
          finalUrl: extractionErrorUrl(error) ?? requestFinalUrlMetadata(input.request),
          extractionMethod: extractionErrorMethod(error),
          sourceProfileId: extractionErrorSourceProfileId(error),
          durationMs: elapsedMs(startedAt),
          warningCount: extractionErrorWarnings(error).length,
          failureCategory: failureCategoryFromError(error, "extraction_failed"),
          retryable: retryableFromError(error),
          status: "failed",
        }),
      });

      throw runtimeError;
    }
  }

  private async executePersistWebEvidenceOperation(input: {
    capability: CapabilityDefinition;
    executionId: string;
    workspaceId: WorkspaceId | null;
    trace: TraceWriter;
    input: unknown;
  }) {
    await this.requireWebPermission({
      capability: input.capability,
      trace: input.trace,
      permission: "web.evidence.write",
      kind: "tool",
      name: "persist web evidence",
    });
    const webEvidenceRepository = await this.requireWebFeature(
      this.webEvidenceRepository,
      "web.evidence.write",
      input.trace,
      {
        kind: "tool",
        name: "persist web evidence",
      },
    );

    const startedAt = Date.now();
    const evidenceInput = (input.input ?? {}) as PersistWebEvidenceOperationInput;
    const result: {
      searchEvidenceId?: string;
      fetchEvidenceId?: string;
      extractionEvidenceId?: string;
      evidenceCount: number;
    } = { evidenceCount: 0 };

    try {
      if (evidenceInput.search) {
        const search = await webEvidenceRepository.createSearch(
          buildSearchEvidenceInput({
            executionId: input.executionId,
            workspaceId: input.workspaceId,
            input: evidenceInput.search,
          }),
        );
        result.searchEvidenceId = search.id;
        result.evidenceCount += 1;
      }

      if (evidenceInput.fetch) {
        const fetch = await webEvidenceRepository.createFetch(
          buildFetchEvidenceInput({
            executionId: input.executionId,
            workspaceId: input.workspaceId,
            searchEvidenceId:
              evidenceInput.fetch.searchEvidenceId ?? result.searchEvidenceId ?? null,
            input: evidenceInput.fetch,
          }),
        );
        result.fetchEvidenceId = fetch.id;
        result.evidenceCount += 1;
      }

      if (evidenceInput.extraction) {
        const extraction = await webEvidenceRepository.createExtraction(
          buildExtractionEvidenceInput({
            executionId: input.executionId,
            workspaceId: input.workspaceId,
            fetchEvidenceId:
              evidenceInput.extraction.fetchEvidenceId ?? result.fetchEvidenceId ?? null,
            input: evidenceInput.extraction,
          }),
        );
        result.extractionEvidenceId = extraction.id;
        result.evidenceCount += 1;
      }

      const parsedResult = persistWebEvidenceResultSchema.parse(result);

      await input.trace.addStep({
        kind: "tool",
        name: "persist web evidence",
        status: "completed",
        summary: "Runtime persisted bounded web evidence.",
        metadata: removeUndefinedValues({
          searchEvidenceId: parsedResult.searchEvidenceId,
          fetchEvidenceId: parsedResult.fetchEvidenceId,
          extractionEvidenceId: parsedResult.extractionEvidenceId,
          evidenceCount: parsedResult.evidenceCount,
          durationMs: elapsedMs(startedAt),
          status: "completed",
        }),
      });

      return parsedResult;
    } catch (error) {
      const runtimeError = createRuntimeSafeError({
        code: runtimeErrorCodes.webEvidencePersistenceFailed,
        message: "Runtime failed to persist bounded web evidence.",
        category: "storage",
        details: {
          failureCategory: "evidence_persistence_failed",
          evidenceCount: result.evidenceCount,
          errorName: errorName(error),
        },
        cause: error,
      });

      await input.trace.addStep({
        kind: "tool",
        name: "persist web evidence",
        status: "failed",
        summary: "Runtime failed to persist bounded web evidence.",
        errorCode: runtimeError.platformError.code,
        errorMessage: runtimeError.platformError.message,
        metadata: {
          evidenceCount: result.evidenceCount,
          durationMs: elapsedMs(startedAt),
          failureCategory: "evidence_persistence_failed",
          status: "failed",
        },
      });

      throw runtimeError;
    }
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
        name: "invoke model",
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
        name: "invoke model",
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
        name: "invoke model",
        status: "completed",
        summary: "Structured model generation completed.",
        metadata: buildLlmSuccessMetadata(result, input.request),
      });
      await input.trace.addStep({
        kind: "validation",
        name: "validate structured output",
        status: "completed",
        summary: "Structured model output matched the requested schema.",
        metadata: buildStructuredOutputValidationMetadata(result, input.request),
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
        name: "invoke model",
        status: "failed",
        summary: "Structured model generation failed.",
        errorCode: runtimeError.platformError.code,
        errorMessage: runtimeError.platformError.message,
        ...(isAIProviderError(error)
          ? { metadata: buildLlmErrorMetadata(error, input.request) }
          : {}),
      });

      if (isAIProviderError(error) && error.code === "provider_schema_invalid") {
        await input.trace.addStep({
          kind: "validation",
          name: "validate structured output",
          status: "failed",
          summary: "Structured model output failed schema validation.",
          errorCode: runtimeError.platformError.code,
          errorMessage: runtimeError.platformError.message,
          metadata: buildStructuredOutputValidationErrorMetadata(error, input.request),
        });
      }

      throw runtimeError;
    }
  }

  private async executeProviderHealthOperation(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
    providerId: ProviderId;
  }): Promise<ProviderHealth> {
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
        name: "provider health check",
        status: "failed",
        summary: "Capability lacks llm.generate.",
        errorCode: error.platformError.code,
        errorMessage: error.platformError.message,
      });
      throw error;
    }

    if (!this.aiProviderRegistry) {
      const error = createRuntimeSafeError({
        code: runtimeErrorCodes.runtimeFeatureUnavailable,
        message: "Runtime feature is not available in this slice: llm",
        category: "capability",
        details: { feature: "llm" },
      });

      await input.trace.addStep({
        kind: "llm",
        name: "provider health check",
        status: "failed",
        summary: "AI provider registry is not configured.",
        errorCode: error.platformError.code,
        errorMessage: error.platformError.message,
      });
      throw error;
    }

    try {
      const health = await this.aiProviderRegistry.get(input.providerId).health();

      await input.trace.addStep({
        kind: "llm",
        name: "provider health check",
        status: "completed",
        summary: "Runtime checked model provider health.",
        metadata: buildProviderHealthMetadata(health),
      });

      return health;
    } catch (error) {
      const runtimeError = isAIProviderError(error)
        ? createRuntimeErrorFromProviderError(error)
        : createRuntimeSafeError({
            code: runtimeErrorCodes.aiProviderFailure,
            message: "Model provider health check failed.",
            category: "llm",
            details: { errorName: errorName(error) },
            cause: error,
          });

      await input.trace.addStep({
        kind: "llm",
        name: "provider health check",
        status: "failed",
        summary: "Model provider health check failed.",
        errorCode: runtimeError.platformError.code,
        errorMessage: runtimeError.platformError.message,
        ...(isAIProviderError(error)
          ? { metadata: buildProviderHealthErrorMetadata(error, input.providerId) }
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

  private async requireWebPermission(input: {
    capability: CapabilityDefinition;
    trace: TraceWriter;
    permission: Extract<CapabilityPermission, "web.search" | "web.fetch" | "web.evidence.write">;
    kind: "tool" | "workflow";
    name: string;
  }): Promise<void> {
    if (input.capability.manifest.permissions.includes(input.permission)) {
      return;
    }

    const error = createRuntimeSafeError({
      code: webPermissionDeniedCode(input.permission),
      message: `Capability ${input.capability.manifest.id} does not have ${input.permission}.`,
      category: "permission",
      details: {
        capabilityId: input.capability.manifest.id,
        permission: input.permission,
      },
    });

    await input.trace.addStep({
      kind: input.kind,
      name: input.name,
      status: "failed",
      summary: `Capability lacks ${input.permission}.`,
      errorCode: error.platformError.code,
      errorMessage: error.platformError.message,
      metadata: {
        failureCategory: "permission_denied",
        permission: input.permission,
      },
    });

    throw error;
  }

  private async requireWebFeature<T>(
    service: T | undefined,
    feature: string,
    trace: TraceWriter,
    step: { kind: "tool" | "workflow"; name: string },
  ): Promise<NonNullable<T>> {
    if (service !== undefined && service !== null) {
      return service;
    }

    const error = createRuntimeSafeError({
      code: runtimeErrorCodes.runtimeFeatureUnavailable,
      message: `Runtime feature is not available in this slice: ${feature}`,
      category: "capability",
      details: { feature },
    });

    await trace.addStep({
      kind: step.kind,
      name: step.name,
      status: "failed",
      summary: "Runtime web service is not configured.",
      errorCode: error.platformError.code,
      errorMessage: error.platformError.message,
      metadata: {
        failureCategory: "runtime_feature_unavailable",
        feature,
      },
    });

    throw error;
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

type PersistEvidenceFailure = {
  category: WebEvidenceFailureCategory;
  message: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  retryable?: boolean;
};

type PersistSearchEvidenceOperation = {
  request: SearchRequest;
  response?: SearchResponse;
  failure?: PersistEvidenceFailure;
  providerId?: SearchProviderId;
  query?: string;
};

type PersistFetchEvidenceOperation = {
  result?: FetchResult;
  failure?: PersistEvidenceFailure;
  searchEvidenceId?: string | null;
  selectedUrlSource: WebSelectedUrlSource;
  selectedResultIndex?: number | null;
  requestedUrl: FetchUrl;
  finalUrl?: FetchUrl | null;
  statusCode?: number | null;
  contentType?: string | null;
  contentLength?: number | null;
  contentBytes?: number | null;
};

type PersistExtractionEvidenceOperation = {
  document?: ExtractedDocument;
  failure?: PersistEvidenceFailure;
  fetchEvidenceId?: string | null;
  finalUrl: FetchUrl;
  extractionMethod?: ExtractionMethod | null;
  sourceProfileId?: string | null;
  warnings?: ExtractionWarning[];
};

type PersistWebEvidenceOperationInput = {
  search?: PersistSearchEvidenceOperation;
  fetch?: PersistFetchEvidenceOperation;
  extraction?: PersistExtractionEvidenceOperation;
};

function buildSearchEvidenceInput(input: {
  executionId: string;
  workspaceId: WorkspaceId | null;
  input: PersistSearchEvidenceOperation;
}): CreateWebSearchEvidenceInput {
  const request = searchRequestSchema.parse(input.input.request);

  if (input.input.response) {
    return {
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      providerId: input.input.response.providerId,
      query: input.input.response.query,
      request,
      status: "completed",
      resultCount: input.input.response.results.length,
      results: input.input.response.results,
      warnings: input.input.response.warnings,
      startedAt: input.input.response.startedAt,
      completedAt: input.input.response.completedAt,
      durationMs: input.input.response.durationMs,
    };
  }

  const failure = normalizePersistFailure(input.input.failure, "search_failed");

  return {
    executionId: input.executionId,
    workspaceId: input.workspaceId,
    providerId: input.input.providerId ?? request.providerId ?? "provider.unknown",
    query: input.input.query ?? request.query,
    request,
    status: "failed",
    resultCount: 0,
    results: [],
    warnings: [],
    failureCategory: failure.category,
    failureMessage: failure.message,
    startedAt: failure.startedAt,
    completedAt: failure.completedAt,
    durationMs: failure.durationMs,
  };
}

function buildFetchEvidenceInput(input: {
  executionId: string;
  workspaceId: WorkspaceId | null;
  searchEvidenceId?: string | null;
  input: PersistFetchEvidenceOperation;
}): CreateWebFetchEvidenceInput {
  if (input.input.result) {
    const body = input.input.result.html ?? input.input.result.text ?? "";

    return {
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      searchEvidenceId: input.searchEvidenceId ?? null,
      selectedUrlSource: input.input.selectedUrlSource,
      selectedResultIndex: input.input.selectedResultIndex ?? null,
      requestedUrl: input.input.result.requestedUrl,
      finalUrl: input.input.result.finalUrl,
      status: "completed",
      statusCode: input.input.result.statusCode,
      contentType: input.input.result.contentType,
      contentLength: input.input.result.contentLength,
      contentBytes: input.input.result.metadata.contentBytes,
      bodySha256: sha256Hex(body),
      redirects: input.input.result.redirects,
      warnings: input.input.result.warnings,
      startedAt: input.input.result.startedAt,
      completedAt: input.input.result.completedAt,
      durationMs: input.input.result.durationMs,
    };
  }

  const failure = normalizePersistFailure(input.input.failure, "fetch_failed");

  return {
    executionId: input.executionId,
    workspaceId: input.workspaceId,
    searchEvidenceId: input.searchEvidenceId ?? null,
    selectedUrlSource: input.input.selectedUrlSource,
    selectedResultIndex: input.input.selectedResultIndex ?? null,
    requestedUrl: input.input.requestedUrl,
    finalUrl: input.input.finalUrl ?? null,
    status: "failed",
    statusCode: input.input.statusCode ?? null,
    contentType: input.input.contentType ?? null,
    contentLength: input.input.contentLength ?? null,
    contentBytes: input.input.contentBytes ?? null,
    bodySha256: null,
    redirects: [],
    warnings: [],
    failureCategory: failure.category,
    failureMessage: failure.message,
    startedAt: failure.startedAt,
    completedAt: failure.completedAt,
    durationMs: failure.durationMs,
  };
}

function buildExtractionEvidenceInput(input: {
  executionId: string;
  workspaceId: WorkspaceId | null;
  fetchEvidenceId?: string | null;
  input: PersistExtractionEvidenceOperation;
}): CreateWebExtractionEvidenceInput {
  if (input.input.document) {
    return {
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      fetchEvidenceId: input.fetchEvidenceId ?? null,
      finalUrl: input.input.document.metadata.finalUrl,
      status: "completed",
      extractionMethod: input.input.document.method,
      sourceProfileId: input.input.document.metadata.sourceProfileId,
      title: input.input.document.title,
      byline: input.input.document.byline,
      siteName: input.input.document.siteName,
      publishedAt: input.input.document.publishedAt,
      canonicalUrl: input.input.document.canonicalUrl,
      excerpt: input.input.document.excerpt,
      wordCount: input.input.document.wordCount,
      contentTextSnapshot: input.input.document.contentText.slice(0, 20_000),
      contentTextSha256: sha256Hex(input.input.document.contentText),
      contentChars: input.input.document.metadata.contentChars,
      originalContentChars: input.input.document.metadata.originalContentChars,
      warnings: input.input.document.warnings,
      startedAt: input.input.document.metadata.extractedAt,
      completedAt: input.input.document.metadata.extractedAt,
      durationMs: 0,
    };
  }

  const failure = normalizePersistFailure(input.input.failure, "extraction_failed");

  return {
    executionId: input.executionId,
    workspaceId: input.workspaceId,
    fetchEvidenceId: input.fetchEvidenceId ?? null,
    finalUrl: input.input.finalUrl,
    status: "failed",
    extractionMethod: input.input.extractionMethod ?? null,
    sourceProfileId: input.input.sourceProfileId ?? null,
    title: null,
    byline: null,
    siteName: null,
    publishedAt: null,
    canonicalUrl: null,
    excerpt: null,
    wordCount: null,
    contentTextSnapshot: null,
    contentTextSha256: null,
    contentChars: null,
    originalContentChars: null,
    warnings: input.input.warnings ?? [],
    failureCategory: failure.category,
    failureMessage: failure.message,
    startedAt: failure.startedAt,
    completedAt: failure.completedAt,
    durationMs: failure.durationMs,
  };
}

function normalizePersistFailure(
  failure: PersistEvidenceFailure | undefined,
  fallbackCategory: WebEvidenceFailureCategory,
): Required<
  Pick<PersistEvidenceFailure, "category" | "message" | "startedAt" | "completedAt" | "durationMs">
> {
  const timestamp = nowIso();

  return {
    category: normalizeFailureCategory(failure?.category ?? fallbackCategory),
    message: boundedString(failure?.message ?? "Web operation failed safely.", 1_000),
    startedAt: failure?.startedAt ?? timestamp,
    completedAt: failure?.completedAt ?? timestamp,
    durationMs: failure?.durationMs ?? 0,
  };
}

function createRuntimeErrorFromSearchError(
  error: unknown,
  providerId: SearchProviderId | undefined,
): RuntimeSafeError {
  if (isSearchProviderError(error)) {
    return createRuntimeSafeError({
      code: runtimeErrorCodes.webSearchFailed,
      message: "Search provider failed safely.",
      category: searchProviderErrorCategory(error.code),
      retryable: error.retryable,
      details: removeUndefinedRecord({
        failureCategory: error.code,
        providerId: error.providerId ?? providerId,
        retryable: error.retryable,
      }),
      cause: error,
    });
  }

  return createRuntimeSafeError({
    code: runtimeErrorCodes.webSearchFailed,
    message: "Search provider failed safely.",
    category: "tool",
    details: {
      failureCategory: "search_failed",
      errorName: errorName(error),
    },
    cause: error,
  });
}

function createRuntimeErrorFromFetchError(error: unknown): RuntimeSafeError {
  if (isFetchClientError(error)) {
    return createRuntimeSafeError({
      code: runtimeErrorCodes.webFetchFailed,
      message: "Fetch failed safely.",
      category: "network",
      retryable: error.retryable,
      details: removeUndefinedRecord({
        failureCategory: error.code,
        url: error.url,
        statusCode: error.statusCode,
        retryable: error.retryable,
      }),
      cause: error,
    });
  }

  return createRuntimeSafeError({
    code: runtimeErrorCodes.webFetchFailed,
    message: "Fetch failed safely.",
    category: "network",
    details: {
      failureCategory: "fetch_failed",
      errorName: errorName(error),
    },
    cause: error,
  });
}

function createRuntimeErrorFromExtractionError(error: unknown): RuntimeSafeError {
  return createRuntimeSafeError({
    code: runtimeErrorCodes.webExtractionFailed,
    message: "Readable content extraction failed safely.",
    category: "tool",
    retryable: retryableFromError(error) ?? false,
    details: removeUndefinedRecord({
      failureCategory: failureCategoryFromError(error, "extraction_failed"),
      extractionMethod: extractionErrorMethod(error),
      sourceProfileId: extractionErrorSourceProfileId(error),
      retryable: retryableFromError(error),
    }),
    cause: error,
  });
}

function buildSearchProviderHealthMetadata(health: SearchProviderHealth): TraceStepMetadata {
  const failureCategory = primitiveMetadataValue(health.metadata?.errorKind);

  return removeUndefinedValues({
    providerId: health.providerId,
    providerKind: health.kind,
    healthStatus: health.status,
    checkedAt: health.checkedAt,
    failureCategory: typeof failureCategory === "string" ? failureCategory : undefined,
    retryable: primitiveMetadataValue(health.metadata?.retryable),
  });
}

function buildSearchProviderErrorMetadata(
  error: unknown,
  providerId: SearchProviderId,
): TraceStepMetadata {
  return removeUndefinedValues({
    providerId: isSearchProviderError(error) ? (error.providerId ?? providerId) : providerId,
    failureCategory: failureCategoryFromError(error, "search_provider_failed"),
    retryable: retryableFromError(error),
  });
}

function searchProviderErrorCategory(code: string): "tool" | "network" {
  return code === "search_provider_timeout" ||
    code === "search_provider_http_error" ||
    code === "search_provider_unavailable"
    ? "network"
    : "tool";
}

function failureCategoryFromError(
  error: unknown,
  fallback: WebEvidenceFailureCategory,
): WebEvidenceFailureCategory {
  if (isSearchProviderError(error) || isFetchClientError(error) || isExtractionErrorLike(error)) {
    return normalizeFailureCategory(error.code);
  }

  return fallback;
}

function retryableFromError(error: unknown): boolean | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  ) {
    return error.retryable;
  }

  return undefined;
}

function fetchErrorUrl(error: unknown): FetchUrl | undefined {
  if (isFetchClientError(error)) {
    return error.url;
  }

  return undefined;
}

function fetchErrorStatusCode(error: unknown): number | undefined {
  if (isFetchClientError(error)) {
    return error.statusCode;
  }

  return undefined;
}

function extractionErrorUrl(error: unknown): FetchUrl | undefined {
  return isExtractionErrorLike(error) ? error.url : undefined;
}

function extractionErrorMethod(error: unknown): ExtractionMethod | undefined {
  return isExtractionErrorLike(error) ? error.method : undefined;
}

function extractionErrorSourceProfileId(error: unknown): string | undefined {
  return isExtractionErrorLike(error) ? error.sourceProfileId : undefined;
}

function extractionErrorWarnings(error: unknown): ExtractionWarning[] {
  if (!isExtractionErrorLike(error)) {
    return [];
  }

  return Array.isArray(error.warnings) ? error.warnings : [];
}

function isExtractionErrorLike(error: unknown): error is {
  code: string;
  method?: ExtractionMethod;
  url?: FetchUrl;
  sourceProfileId?: string;
  retryable?: boolean;
  warnings: ExtractionWarning[];
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ArticleExtractionError" &&
    "code" in error &&
    typeof error.code === "string"
  );
}

function requestUrlMetadata(request: FetchRequestInput): string | undefined {
  if (typeof request !== "object" || request === null || !("url" in request)) {
    return undefined;
  }

  return typeof request.url === "string" ? boundedString(request.url, 2_048) : undefined;
}

function requestFinalUrlMetadata(request: ExtractionRequestInput): FetchUrl | undefined {
  if (typeof request !== "object" || request === null || !("finalUrl" in request)) {
    return undefined;
  }

  if (typeof request.finalUrl !== "string") {
    return undefined;
  }

  const parsed = fetchUrlSchema.safeParse(request.finalUrl);
  return parsed.success ? parsed.data : undefined;
}

function webPermissionDeniedCode(
  permission: Extract<CapabilityPermission, "web.search" | "web.fetch" | "web.evidence.write">,
) {
  switch (permission) {
    case "web.search":
      return runtimeErrorCodes.webSearchPermissionDenied;
    case "web.fetch":
      return runtimeErrorCodes.webFetchPermissionDenied;
    case "web.evidence.write":
      return runtimeErrorCodes.webEvidencePermissionDenied;
  }
}

function normalizeFailureCategory(value: string): WebEvidenceFailureCategory {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return (
    normalized.length > 0 ? normalized.slice(0, 120) : "unknown"
  ) as WebEvidenceFailureCategory;
}

function boundedString(value: string, maxLength: number): string {
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function removeUndefinedRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
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

function buildStructuredOutputValidationMetadata(
  result: StructuredGenerationResult,
  request: unknown,
): TraceStepMetadata {
  return removeUndefinedValues({
    providerId: result.providerId,
    model: result.model,
    responseSchemaId: requestMetadataValue(request, "responseSchema", "id"),
  });
}

function buildStructuredOutputValidationErrorMetadata(
  error: AIProviderError,
  request: unknown,
): TraceStepMetadata {
  return removeUndefinedValues({
    providerId: error.providerId ?? requestMetadataValue(request, "providerId"),
    model: requestMetadataValue(request, "model"),
    responseSchemaId:
      providerDetailMetadataValue(error, "schemaId") ??
      requestMetadataValue(request, "responseSchema", "id"),
    errorKind: error.code,
  });
}

function buildProviderHealthMetadata(health: ProviderHealth): TraceStepMetadata {
  return removeUndefinedValues({
    providerId: health.providerId,
    providerKind: health.kind,
    healthStatus: health.status,
    checkedAt: health.checkedAt,
    model: health.model,
    modelPresent: providerHealthMetadataValue(health, "modelPresent"),
    modelCount: providerHealthMetadataValue(health, "modelCount"),
    ollamaVersion: providerHealthMetadataValue(health, "ollamaVersion"),
    errorKind: providerHealthMetadataValue(health, "errorKind"),
    retryable: providerHealthMetadataValue(health, "retryable"),
  });
}

function buildProviderHealthErrorMetadata(
  error: AIProviderError,
  providerId: ProviderId,
): TraceStepMetadata {
  return removeUndefinedValues({
    providerId: error.providerId ?? providerId,
    errorKind: error.code,
    retryable: error.retryable,
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

function providerHealthMetadataValue(health: ProviderHealth, key: string): JsonValue | undefined {
  if (!health.metadata || !(key in health.metadata)) {
    return undefined;
  }

  return primitiveMetadataValue(health.metadata[key]);
}

function providerDetailMetadataValue(error: AIProviderError, key: string): JsonValue | undefined {
  if (!error.details || !(key in error.details)) {
    return undefined;
  }

  return primitiveMetadataValue(error.details[key]);
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

function jsonValueOrUndefined(value: unknown): JsonValue | undefined {
  const parsed = jsonValueSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
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
