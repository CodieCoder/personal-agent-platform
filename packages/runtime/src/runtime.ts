import type {
  CapabilityDefinition,
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityId,
  CapabilityManifest,
  ProviderHealth,
  ProviderId,
} from "@pap/contracts";
import {
  createAIProviderRegistry,
  createStructuredGenerationService,
  type AIProvider,
  type AIProviderRegistry,
  type StructuredGenerationService,
} from "@pap/ai";
import type { MemoryService } from "@pap/memory";
import type { PapLogger } from "@pap/shared";
import type { ExecutionTraceRepository } from "@pap/storage";
import { CapabilityRegistry } from "./capability-registry.js";
import { RuntimeExecutionService } from "./execution-service.js";
import type { RuntimeClock } from "./trace-writer.js";

export type CreateRuntimeInput = {
  traceRepository: ExecutionTraceRepository;
  memoryService?: MemoryService;
  capabilities: CapabilityDefinition[];
  logger?: PapLogger;
  clock?: RuntimeClock;
  aiProviderRegistry?: AIProviderRegistry;
  structuredGenerationService?: StructuredGenerationService;
};

export type Runtime = {
  registry: CapabilityRegistry;
  executionService: RuntimeExecutionService;
  aiProviderRegistry: AIProviderRegistry;
  execute(request: CapabilityExecutionRequest): Promise<CapabilityExecutionResult>;
  getCapability(capabilityId: CapabilityId): CapabilityDefinition;
  listCapabilities(): CapabilityManifest[];
  getAIProvider(providerId: ProviderId): AIProvider;
  listAIProviders(): AIProvider[];
  getProviderHealth(providerId: ProviderId): Promise<ProviderHealth>;
  listProviderHealth(): Promise<ProviderHealth[]>;
};

export function createRuntime(input: CreateRuntimeInput): Runtime {
  const registry = new CapabilityRegistry();

  for (const capability of input.capabilities) {
    registry.register(capability);
  }

  const aiProviderRegistry = input.aiProviderRegistry ?? createAIProviderRegistry();
  const structuredGenerationService =
    input.structuredGenerationService ?? createStructuredGenerationService(aiProviderRegistry);
  const executionService = new RuntimeExecutionService({
    registry,
    traceRepository: input.traceRepository,
    structuredGenerationService,
    aiProviderRegistry,
    ...(input.memoryService ? { memoryService: input.memoryService } : {}),
    ...(input.logger ? { logger: input.logger } : {}),
    ...(input.clock ? { clock: input.clock } : {}),
  });

  return {
    registry,
    executionService,
    aiProviderRegistry,
    execute: (request) => executionService.execute(request),
    getCapability: (capabilityId) => registry.get(capabilityId),
    listCapabilities: () => registry.listManifests(),
    getAIProvider: (providerId) => aiProviderRegistry.get(providerId),
    listAIProviders: () => aiProviderRegistry.list(),
    getProviderHealth: async (providerId) => aiProviderRegistry.get(providerId).health(),
    listProviderHealth: async () =>
      Promise.all(aiProviderRegistry.list().map((provider) => provider.health())),
  };
}
