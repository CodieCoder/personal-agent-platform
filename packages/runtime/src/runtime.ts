import type {
  CapabilityDefinition,
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityId,
  CapabilityManifest,
} from "@pap/contracts";
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
};

export type Runtime = {
  registry: CapabilityRegistry;
  executionService: RuntimeExecutionService;
  execute(request: CapabilityExecutionRequest): Promise<CapabilityExecutionResult>;
  getCapability(capabilityId: CapabilityId): CapabilityDefinition;
  listCapabilities(): CapabilityManifest[];
};

export function createRuntime(input: CreateRuntimeInput): Runtime {
  const registry = new CapabilityRegistry();

  for (const capability of input.capabilities) {
    registry.register(capability);
  }

  const executionService = new RuntimeExecutionService({
    registry,
    traceRepository: input.traceRepository,
    ...(input.memoryService ? { memoryService: input.memoryService } : {}),
    ...(input.logger ? { logger: input.logger } : {}),
    ...(input.clock ? { clock: input.clock } : {}),
  });

  return {
    registry,
    executionService,
    execute: (request) => executionService.execute(request),
    getCapability: (capabilityId) => registry.get(capabilityId),
    listCapabilities: () => registry.listManifests(),
  };
}
