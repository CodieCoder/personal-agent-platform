import type {
  CapabilityDefinition,
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityId,
  CapabilityManifest,
  ProviderHealth,
  ProviderId,
  SearchProviderHealth,
  SearchProviderId,
  SearchRequestInput,
  SearchResponse,
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
import {
  createSearchProviderRegistry,
  createSearchService,
  type SearchProvider,
  type SearchProviderRegistry,
  type SearchService,
} from "@pap/tools-search";
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
  searchProviderRegistry?: SearchProviderRegistry;
  searchService?: SearchService;
  defaultSearchProviderId?: SearchProviderId;
};

export type Runtime = {
  registry: CapabilityRegistry;
  executionService: RuntimeExecutionService;
  aiProviderRegistry: AIProviderRegistry;
  searchProviderRegistry: SearchProviderRegistry;
  searchService: SearchService;
  execute(request: CapabilityExecutionRequest): Promise<CapabilityExecutionResult>;
  getCapability(capabilityId: CapabilityId): CapabilityDefinition;
  listCapabilities(): CapabilityManifest[];
  getAIProvider(providerId: ProviderId): AIProvider;
  listAIProviders(): AIProvider[];
  getProviderHealth(providerId: ProviderId): Promise<ProviderHealth>;
  listProviderHealth(): Promise<ProviderHealth[]>;
  search(request: SearchRequestInput): Promise<SearchResponse>;
  getSearchProvider(providerId: SearchProviderId): SearchProvider;
  listSearchProviders(): SearchProvider[];
  getSearchProviderHealth(providerId: SearchProviderId): Promise<SearchProviderHealth>;
  listSearchProviderHealth(): Promise<SearchProviderHealth[]>;
};

export function createRuntime(input: CreateRuntimeInput): Runtime {
  const registry = new CapabilityRegistry();

  for (const capability of input.capabilities) {
    registry.register(capability);
  }

  const aiProviderRegistry = input.aiProviderRegistry ?? createAIProviderRegistry();
  const structuredGenerationService =
    input.structuredGenerationService ?? createStructuredGenerationService(aiProviderRegistry);
  const searchProviderRegistry = input.searchProviderRegistry ?? createSearchProviderRegistry();
  const searchService =
    input.searchService ??
    createSearchService(searchProviderRegistry, {
      ...(input.defaultSearchProviderId
        ? { defaultProviderId: input.defaultSearchProviderId }
        : {}),
    });
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
    searchProviderRegistry,
    searchService,
    execute: (request) => executionService.execute(request),
    getCapability: (capabilityId) => registry.get(capabilityId),
    listCapabilities: () => registry.listManifests(),
    getAIProvider: (providerId) => aiProviderRegistry.get(providerId),
    listAIProviders: () => aiProviderRegistry.list(),
    getProviderHealth: async (providerId) => aiProviderRegistry.get(providerId).health(),
    listProviderHealth: async () =>
      Promise.all(aiProviderRegistry.list().map((provider) => provider.health())),
    search: (request) => searchService.search(request),
    getSearchProvider: (providerId) => searchProviderRegistry.get(providerId),
    listSearchProviders: () => searchProviderRegistry.list(),
    getSearchProviderHealth: (providerId) => searchService.getProviderHealth(providerId),
    listSearchProviderHealth: () => searchService.listProviderHealth(),
  };
}
