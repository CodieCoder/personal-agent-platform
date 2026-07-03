import {
  createEpisodicMemoryRequestSchema,
  createSemanticMemoryRequestSchema,
  episodicMemoryQuerySchema,
  memoryIdSchema,
  semanticMemoryQuerySchema,
  updateSemanticMemoryRequestSchema,
  z,
  type CapabilityId,
  type CreateEpisodicMemoryRequest,
  type CreateSemanticMemoryRequest,
  type EpisodicMemoryRecord,
  type ExecutionId,
  type ExecutionTrace,
  type MemoryId,
  type SemanticMemoryRecord,
  type ThreadId,
  type UpdateSemanticMemoryRequest,
  type WorkspaceId,
} from "@pap/contracts";
import { nowIso } from "@pap/shared";
import type {
  CreateEpisodicMemoryInput,
  CreateSemanticMemoryInput,
  EpisodicMemoryRepository,
  ExecutionTraceRepository,
  SemanticMemoryRepository,
  UpdateSemanticMemoryInput,
} from "@pap/storage";
import {
  createMemoryServiceError,
  memoryServiceErrorCodes,
  toMemoryServiceError,
} from "./errors.js";
import { evaluateAutomaticEpisodicWrite, evaluateAutomaticSemanticWrite } from "./policy.js";

export type MemoryServiceClock = () => Date;

export type MemoryRecord =
  | {
      type: "semantic";
      record: SemanticMemoryRecord;
    }
  | {
      type: "episodic";
      record: EpisodicMemoryRecord;
    };

export type MemoryRecordType = MemoryRecord["type"];

export type CreateMemoryServiceInput = {
  semanticMemoryRepository: SemanticMemoryRepository;
  episodicMemoryRepository: EpisodicMemoryRepository;
  executionTraceRepository: ExecutionTraceRepository;
  clock?: MemoryServiceClock;
};

export type AutomaticSemanticMemoryInput = Omit<CreateSemanticMemoryInput, "status"> & {
  inferred?: boolean;
  longLived?: boolean;
};

export type CreateManualSemanticMemoryInput = Omit<CreateSemanticMemoryInput, "status">;

export type ProposeSemanticMemoryInput = Omit<CreateSemanticMemoryInput, "status">;

export type SupersedeSemanticMemoryInput = {
  id: MemoryId;
  replacement: Omit<CreateSemanticMemoryInput, "status" | "supersedesMemoryId">;
};

export type CreateExecutionEpisodeInput = Omit<CreateEpisodicMemoryInput, "status"> & {
  executionId: ExecutionId;
};

export type ExpireMemoryRecordInput = {
  id: MemoryId;
  type?: MemoryRecordType;
};

export type DeleteMemoryRecordInput = {
  id: MemoryId;
  type?: MemoryRecordType;
};

export type CapabilityMemoryWriteContext = {
  executionId: ExecutionId;
  capabilityId: CapabilityId;
  workspaceId?: WorkspaceId;
  threadId?: ThreadId;
};

export type CapabilityMemorySearchResult = {
  semantic: SemanticMemoryRecord[];
  episodic: EpisodicMemoryRecord[];
};

type SemanticMemoryQueryInput = z.input<typeof semanticMemoryQuerySchema>;

type EpisodicMemoryQueryInput = z.input<typeof episodicMemoryQuerySchema>;

export interface MemoryService {
  listSemanticMemory(query?: SemanticMemoryQueryInput): Promise<SemanticMemoryRecord[]>;
  listEpisodicMemory(query?: EpisodicMemoryQueryInput): Promise<EpisodicMemoryRecord[]>;
  getMemoryRecord(id: MemoryId): Promise<MemoryRecord | null>;
  createSemanticMemory(input: CreateManualSemanticMemoryInput): Promise<SemanticMemoryRecord>;
  writeAutomaticSemanticMemory(input: AutomaticSemanticMemoryInput): Promise<SemanticMemoryRecord>;
  proposeSemanticMemory(input: ProposeSemanticMemoryInput): Promise<SemanticMemoryRecord>;
  updateSemanticMemory(input: UpdateSemanticMemoryRequest): Promise<SemanticMemoryRecord>;
  supersedeSemanticMemory(input: SupersedeSemanticMemoryInput): Promise<{
    previous: SemanticMemoryRecord;
    replacement: SemanticMemoryRecord;
  }>;
  approveSemanticMemoryProposal(id: MemoryId): Promise<SemanticMemoryRecord>;
  rejectSemanticMemoryProposal(id: MemoryId): Promise<SemanticMemoryRecord>;
  createEpisodicMemory(
    input: Omit<CreateEpisodicMemoryInput, "status">,
  ): Promise<EpisodicMemoryRecord>;
  createExecutionEpisode(input: CreateExecutionEpisodeInput): Promise<EpisodicMemoryRecord>;
  expireMemoryRecord(input: ExpireMemoryRecordInput): Promise<MemoryRecord>;
  deleteMemoryRecord(input: DeleteMemoryRecordInput): Promise<MemoryRecord>;
  getMasterProfile(): Promise<SemanticMemoryRecord[]>;
  search(input?: unknown): Promise<CapabilityMemorySearchResult>;
  writeFromCapability(context: CapabilityMemoryWriteContext, input: unknown): Promise<MemoryRecord>;
}

const memoryRecordTypeSchema = z.enum(["semantic", "episodic"]);

const memorySearchInputSchema = z
  .object({
    semantic: semanticMemoryQuerySchema.optional(),
    episodic: episodicMemoryQuerySchema.optional(),
  })
  .strict()
  .default({});

const capabilityMemoryWriteRecordSchema = z.record(z.string(), z.unknown());

const capabilityMemoryWriteRequestSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("semantic"),
      record: capabilityMemoryWriteRecordSchema,
      inferred: z.boolean().default(false),
      longLived: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      type: z.literal("episodic"),
      record: capabilityMemoryWriteRecordSchema,
    })
    .strict(),
]);

export function createMemoryService(input: CreateMemoryServiceInput): MemoryService {
  return new DefaultMemoryService(input);
}

class DefaultMemoryService implements MemoryService {
  private readonly semanticMemoryRepository: SemanticMemoryRepository;
  private readonly episodicMemoryRepository: EpisodicMemoryRepository;
  private readonly executionTraceRepository: ExecutionTraceRepository;
  private readonly clock: MemoryServiceClock;

  constructor(input: CreateMemoryServiceInput) {
    this.semanticMemoryRepository = input.semanticMemoryRepository;
    this.episodicMemoryRepository = input.episodicMemoryRepository;
    this.executionTraceRepository = input.executionTraceRepository;
    this.clock = input.clock ?? (() => new Date());
  }

  async listSemanticMemory(query?: SemanticMemoryQueryInput): Promise<SemanticMemoryRecord[]> {
    const parsed = semanticMemoryQuerySchema.parse(query ?? {});
    return this.callRepository(() => this.semanticMemoryRepository.list(parsed));
  }

  async listEpisodicMemory(query?: EpisodicMemoryQueryInput): Promise<EpisodicMemoryRecord[]> {
    const parsed = episodicMemoryQuerySchema.parse(query ?? {});
    return this.callRepository(() => this.episodicMemoryRepository.list(parsed));
  }

  async getMemoryRecord(idInput: MemoryId): Promise<MemoryRecord | null> {
    const id = memoryIdSchema.parse(idInput);
    const semantic = await this.callRepository(() => this.semanticMemoryRepository.getById(id));

    if (semantic) {
      return {
        type: "semantic",
        record: semantic,
      };
    }

    const episodic = await this.callRepository(() => this.episodicMemoryRepository.getById(id));

    if (!episodic) {
      return null;
    }

    return {
      type: "episodic",
      record: episodic,
    };
  }

  async createSemanticMemory(
    input: CreateManualSemanticMemoryInput,
  ): Promise<SemanticMemoryRecord> {
    const parsed = createSemanticMemoryRequestSchema.parse(
      omitSemanticStorageFields({
        ...input,
        sourceType: input.sourceType ?? "manual",
        createdBy: input.createdBy ?? "user",
      }),
    );
    await this.validateSemanticSourceExecution(parsed);

    return this.callRepository(() =>
      this.semanticMemoryRepository.create({
        ...input,
        sourceType: parsed.sourceType,
        createdBy: parsed.createdBy,
        evidenceRefs: parsed.evidenceRefs,
        confidence: parsed.confidence,
        sensitivity: parsed.sensitivity,
        status: "active",
      }),
    );
  }

  async writeAutomaticSemanticMemory(
    input: AutomaticSemanticMemoryInput,
  ): Promise<SemanticMemoryRecord> {
    const parsed = createSemanticMemoryRequestSchema.parse(
      omitSemanticStorageFields({
        ...input,
        createdBy: input.createdBy ?? "system",
      }),
    );
    const confidence = requireAutomaticConfidence(input.confidence);
    const decision = evaluateAutomaticSemanticWrite({
      confidence,
      sensitivity: parsed.sensitivity,
      hasProvenance: hasSemanticProvenance(input),
      inferred: input.inferred,
      longLived: input.longLived,
    });

    if (decision.action === "reject") {
      throw createMemoryServiceError({
        code: memoryServiceErrorCodes.writeRejected,
        message: decision.reason,
      });
    }

    await this.validateSemanticSourceExecution(parsed);

    return this.callRepository(() =>
      this.semanticMemoryRepository.create({
        ...input,
        sourceType: parsed.sourceType,
        createdBy: parsed.createdBy,
        evidenceRefs: parsed.evidenceRefs,
        confidence,
        sensitivity: parsed.sensitivity,
        status: decision.status,
      }),
    );
  }

  async proposeSemanticMemory(input: ProposeSemanticMemoryInput): Promise<SemanticMemoryRecord> {
    const parsed = createSemanticMemoryRequestSchema.parse(
      omitSemanticStorageFields({
        ...input,
        createdBy: input.createdBy ?? "system",
      }),
    );
    await this.validateSemanticSourceExecution(parsed);

    return this.callRepository(() =>
      this.semanticMemoryRepository.create({
        ...input,
        sourceType: parsed.sourceType,
        createdBy: parsed.createdBy,
        evidenceRefs: parsed.evidenceRefs,
        confidence: parsed.confidence,
        sensitivity: parsed.sensitivity,
        status: "proposed",
      }),
    );
  }

  async updateSemanticMemory(input: UpdateSemanticMemoryRequest): Promise<SemanticMemoryRecord> {
    const parsed = updateSemanticMemoryRequestSchema.parse(input);
    const existing = await this.requireSemanticMemory(parsed.id);
    assertSemanticMutationAllowed(existing);

    const updateInput = compactObject({
      ...parsed,
      updatedAt: this.now(),
    }) as UpdateSemanticMemoryInput;

    return this.callRepository(() => this.semanticMemoryRepository.update(updateInput));
  }

  async supersedeSemanticMemory(input: SupersedeSemanticMemoryInput): Promise<{
    previous: SemanticMemoryRecord;
    replacement: SemanticMemoryRecord;
  }> {
    const id = memoryIdSchema.parse(input.id);
    const existing = await this.requireSemanticMemory(id);

    if (existing.status !== "active") {
      throw createMemoryServiceError({
        code: memoryServiceErrorCodes.invalidStatus,
        message: "Only active semantic memory can be superseded.",
        details: {
          id,
          status: existing.status,
        },
      });
    }

    const replacement = createSemanticMemoryRequestSchema.parse(
      omitSemanticStorageFields({
        ...input.replacement,
        sourceType: input.replacement.sourceType ?? "manual",
        createdBy: input.replacement.createdBy ?? "user",
      }),
    );
    await this.validateSemanticSourceExecution(replacement);

    return this.callRepository(() =>
      this.semanticMemoryRepository.supersede({
        id,
        supersededAt: this.now(),
        replacement: {
          ...input.replacement,
          sourceType: replacement.sourceType,
          createdBy: replacement.createdBy,
          evidenceRefs: replacement.evidenceRefs,
          confidence: replacement.confidence,
          sensitivity: replacement.sensitivity,
          status: "active",
        },
      }),
    );
  }

  async approveSemanticMemoryProposal(idInput: MemoryId): Promise<SemanticMemoryRecord> {
    const id = memoryIdSchema.parse(idInput);
    const proposal = await this.requireSemanticMemory(id);

    if (proposal.status !== "proposed") {
      throw createMemoryServiceError({
        code: memoryServiceErrorCodes.invalidStatus,
        message: "Only proposed semantic memory can be approved.",
        details: {
          id,
          status: proposal.status,
        },
      });
    }

    return this.callRepository(() =>
      this.semanticMemoryRepository.approveProposal({
        id,
        approvedAt: this.now(),
      }),
    );
  }

  async rejectSemanticMemoryProposal(idInput: MemoryId): Promise<SemanticMemoryRecord> {
    const id = memoryIdSchema.parse(idInput);
    const proposal = await this.requireSemanticMemory(id);

    if (proposal.status !== "proposed") {
      throw createMemoryServiceError({
        code: memoryServiceErrorCodes.invalidStatus,
        message: "Only proposed semantic memory can be rejected.",
        details: {
          id,
          status: proposal.status,
        },
      });
    }

    return this.callRepository(() =>
      this.semanticMemoryRepository.rejectProposal({
        id,
        rejectedAt: this.now(),
      }),
    );
  }

  async createEpisodicMemory(
    input: Omit<CreateEpisodicMemoryInput, "status">,
  ): Promise<EpisodicMemoryRecord> {
    const parsed = createEpisodicMemoryRequestSchema.parse(omitEpisodicStorageFields(input));

    if (parsed.executionId) {
      await this.validateEpisodeExecutionLink(parsed);
    }

    return this.callRepository(() =>
      this.episodicMemoryRepository.create({
        ...input,
        sourceType: parsed.sourceType,
        evidenceRefs: parsed.evidenceRefs,
        relatedEntities: parsed.relatedEntities,
        confidence: parsed.confidence,
        sensitivity: parsed.sensitivity,
        status: "active",
      }),
    );
  }

  async createExecutionEpisode(input: CreateExecutionEpisodeInput): Promise<EpisodicMemoryRecord> {
    const parsed = createEpisodicMemoryRequestSchema.parse(
      omitEpisodicStorageFields({
        ...input,
        sourceType: input.sourceType ?? "execution",
        sourceRef: input.sourceRef ?? input.executionId,
      }),
    );
    const confidence = requireAutomaticConfidence(input.confidence);
    const decision = evaluateAutomaticEpisodicWrite({
      hasExecutionId: parsed.executionId !== undefined,
      hasProvenance: hasEpisodicProvenance(
        compactObject({
          ...input,
          sourceType: parsed.sourceType,
          sourceRef: parsed.sourceRef,
        }) as CreateExecutionEpisodeInput,
      ),
      confidence,
      sensitivity: parsed.sensitivity,
    });

    if (decision.action === "reject") {
      throw createMemoryServiceError({
        code: memoryServiceErrorCodes.writeRejected,
        message: decision.reason,
      });
    }

    await this.validateEpisodeExecutionLink(parsed);

    return this.callRepository(() =>
      this.episodicMemoryRepository.create(
        compactObject({
          ...input,
          sourceType: parsed.sourceType,
          sourceRef: parsed.sourceRef,
          evidenceRefs: parsed.evidenceRefs,
          relatedEntities: parsed.relatedEntities,
          confidence,
          sensitivity: parsed.sensitivity,
          status: "active",
        }) as CreateEpisodicMemoryInput,
      ),
    );
  }

  async expireMemoryRecord(input: ExpireMemoryRecordInput): Promise<MemoryRecord> {
    const id = memoryIdSchema.parse(input.id);
    const type = parseOptionalMemoryRecordType(input.type);
    const target = await this.resolveMemoryRecord(id, type);
    const expiredAt = this.now();

    if (target.type === "semantic") {
      return {
        type: "semantic",
        record: await this.callRepository(() =>
          this.semanticMemoryRepository.markExpired({
            id,
            expiredAt,
          }),
        ),
      };
    }

    return {
      type: "episodic",
      record: await this.callRepository(() =>
        this.episodicMemoryRepository.markExpired({
          id,
          expiredAt,
        }),
      ),
    };
  }

  async deleteMemoryRecord(input: DeleteMemoryRecordInput): Promise<MemoryRecord> {
    const id = memoryIdSchema.parse(input.id);
    const type = parseOptionalMemoryRecordType(input.type);
    const target = await this.resolveMemoryRecord(id, type);
    const deletedAt = this.now();

    if (target.type === "semantic") {
      return {
        type: "semantic",
        record: await this.callRepository(() =>
          this.semanticMemoryRepository.softDelete({
            id,
            deletedAt,
          }),
        ),
      };
    }

    return {
      type: "episodic",
      record: await this.callRepository(() =>
        this.episodicMemoryRepository.softDelete({
          id,
          deletedAt,
        }),
      ),
    };
  }

  async getMasterProfile(): Promise<SemanticMemoryRecord[]> {
    return this.listSemanticMemory({
      scope: "personal",
      limit: 25,
    });
  }

  async search(input?: unknown): Promise<CapabilityMemorySearchResult> {
    const parsed = memorySearchInputSchema.parse(input ?? {});
    const semanticQuery = parsed.semantic ?? semanticMemoryQuerySchema.parse({ limit: 25 });
    const episodicQuery = parsed.episodic ?? episodicMemoryQuerySchema.parse({ limit: 25 });

    const [semantic, episodic] = await Promise.all([
      this.listSemanticMemory(semanticQuery),
      this.listEpisodicMemory(episodicQuery),
    ]);

    return {
      semantic,
      episodic,
    };
  }

  async writeFromCapability(
    context: CapabilityMemoryWriteContext,
    input: unknown,
  ): Promise<MemoryRecord> {
    const parsed = capabilityMemoryWriteRequestSchema.parse(input);

    if (parsed.type === "semantic") {
      const semantic = await this.writeAutomaticSemanticMemory(
        compactObject({
          ...parsed.record,
          workspaceId: parsed.record.workspaceId ?? context.workspaceId,
          capabilityId: parsed.record.capabilityId ?? context.capabilityId,
          threadId: parsed.record.threadId ?? context.threadId,
          sourceType:
            parsed.record.sourceType === undefined || parsed.record.sourceType === "manual"
              ? "capability"
              : parsed.record.sourceType,
          sourceRef: parsed.record.sourceRef ?? context.executionId,
          sourceExecutionId: context.executionId,
          sourceCapabilityId: context.capabilityId,
          createdBy: context.capabilityId,
          inferred: parsed.inferred,
          longLived: parsed.longLived,
        }) as AutomaticSemanticMemoryInput,
      );

      return {
        type: "semantic",
        record: semantic,
      };
    }

    const episodic = await this.createExecutionEpisode(
      compactObject({
        ...parsed.record,
        workspaceId: parsed.record.workspaceId ?? context.workspaceId,
        capabilityId: parsed.record.capabilityId ?? context.capabilityId,
        threadId: parsed.record.threadId ?? context.threadId,
        executionId: context.executionId,
        sourceType:
          parsed.record.sourceType === undefined || parsed.record.sourceType === "manual"
            ? "execution"
            : parsed.record.sourceType,
        sourceRef: parsed.record.sourceRef ?? context.executionId,
        sourceCapabilityId: context.capabilityId,
      }) as CreateExecutionEpisodeInput,
    );

    return {
      type: "episodic",
      record: episodic,
    };
  }

  private async validateSemanticSourceExecution(
    input: Pick<
      CreateSemanticMemoryRequest,
      "sourceExecutionId" | "sourceCapabilityId" | "workspaceId" | "capabilityId" | "threadId"
    >,
  ): Promise<void> {
    if (!input.sourceExecutionId) {
      return;
    }

    const trace = await this.requireExecutionTrace(input.sourceExecutionId);

    assertTraceLinkMatches({
      trace,
      sourceExecutionId: input.sourceExecutionId,
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      capabilityId: input.capabilityId,
      sourceCapabilityId: input.sourceCapabilityId,
    });
  }

  private async validateEpisodeExecutionLink(
    input: Pick<
      CreateEpisodicMemoryRequest,
      "executionId" | "workspaceId" | "threadId" | "capabilityId" | "sourceCapabilityId"
    >,
  ): Promise<void> {
    if (!input.executionId) {
      return;
    }

    const trace = await this.requireExecutionTrace(input.executionId);

    assertTraceLinkMatches({
      trace,
      sourceExecutionId: input.executionId,
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      capabilityId: input.capabilityId,
      sourceCapabilityId: input.sourceCapabilityId,
    });
  }

  private async requireExecutionTrace(executionId: ExecutionId): Promise<ExecutionTrace> {
    const trace = await this.callRepository(() =>
      this.executionTraceRepository.getById(executionId),
    );

    if (!trace) {
      throw createMemoryServiceError({
        code: memoryServiceErrorCodes.sourceExecutionNotFound,
        message: "Memory source execution does not exist.",
        details: {
          executionId,
        },
      });
    }

    return trace;
  }

  private async requireSemanticMemory(id: MemoryId): Promise<SemanticMemoryRecord> {
    const memory = await this.callRepository(() => this.semanticMemoryRepository.getById(id));

    if (!memory) {
      throw createMemoryServiceError({
        code: memoryServiceErrorCodes.recordNotFound,
        message: "Semantic memory record was not found.",
        details: {
          id,
        },
      });
    }

    return memory;
  }

  private async resolveMemoryRecord(id: MemoryId, type?: MemoryRecordType): Promise<MemoryRecord> {
    if (type === "semantic") {
      return {
        type: "semantic",
        record: await this.requireSemanticMemory(id),
      };
    }

    if (type === "episodic") {
      const episodic = await this.callRepository(() => this.episodicMemoryRepository.getById(id));

      if (!episodic) {
        throw createMemoryServiceError({
          code: memoryServiceErrorCodes.recordNotFound,
          message: "Episodic memory record was not found.",
          details: {
            id,
          },
        });
      }

      return {
        type: "episodic",
        record: episodic,
      };
    }

    const record = await this.getMemoryRecord(id);

    if (!record) {
      throw createMemoryServiceError({
        code: memoryServiceErrorCodes.recordNotFound,
        message: "Memory record was not found.",
        details: {
          id,
        },
      });
    }

    return record;
  }

  private async callRepository<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toMemoryServiceError(error, {
        code: memoryServiceErrorCodes.storageError,
        message: "Memory storage operation failed.",
        category: "storage",
      });
    }
  }

  private now(): string {
    return nowIso(this.clock);
  }
}

function parseOptionalMemoryRecordType(
  type: MemoryRecordType | undefined,
): MemoryRecordType | undefined {
  if (type === undefined) {
    return undefined;
  }

  return memoryRecordTypeSchema.parse(type);
}

function requireAutomaticConfidence(confidence: number | undefined): number {
  if (confidence === undefined) {
    throw createMemoryServiceError({
      code: memoryServiceErrorCodes.validationFailed,
      message: "Automatic memory writes require explicit confidence.",
    });
  }

  return confidence;
}

function hasSemanticProvenance(input: AutomaticSemanticMemoryInput): boolean {
  return (
    input.sourceType !== undefined &&
    input.sourceType !== "manual" &&
    (input.sourceExecutionId !== undefined ||
      input.sourceRef !== undefined ||
      input.sourceCapabilityId !== undefined ||
      (input.evidenceRefs?.length ?? 0) > 0)
  );
}

function hasEpisodicProvenance(input: CreateExecutionEpisodeInput): boolean {
  return (
    input.sourceType !== undefined &&
    input.sourceType !== "manual" &&
    (input.executionId !== undefined ||
      input.sourceRef !== undefined ||
      input.sourceCapabilityId !== undefined ||
      (input.evidenceRefs?.length ?? 0) > 0)
  );
}

function assertSemanticMutationAllowed(memory: SemanticMemoryRecord): void {
  if (memory.status === "active" || memory.status === "proposed") {
    return;
  }

  throw createMemoryServiceError({
    code: memoryServiceErrorCodes.invalidStatus,
    message: "Semantic memory status does not allow mutation.",
    details: {
      id: memory.id,
      status: memory.status,
    },
  });
}

function assertTraceLinkMatches(input: {
  trace: ExecutionTrace;
  sourceExecutionId: ExecutionId;
  workspaceId?: WorkspaceId | undefined;
  threadId?: ThreadId | undefined;
  capabilityId?: CapabilityId | undefined;
  sourceCapabilityId?: CapabilityId | undefined;
}): void {
  assertTraceFieldMatches({
    sourceExecutionId: input.sourceExecutionId,
    field: "workspaceId",
    supplied: input.workspaceId,
    traceValue: input.trace.workspaceId,
  });
  assertTraceFieldMatches({
    sourceExecutionId: input.sourceExecutionId,
    field: "threadId",
    supplied: input.threadId,
    traceValue: input.trace.threadId,
  });
  assertTraceFieldMatches({
    sourceExecutionId: input.sourceExecutionId,
    field: "capabilityId",
    supplied: input.capabilityId,
    traceValue: input.trace.capabilityId,
  });
  assertTraceFieldMatches({
    sourceExecutionId: input.sourceExecutionId,
    field: "sourceCapabilityId",
    supplied: input.sourceCapabilityId,
    traceValue: input.trace.capabilityId,
  });
}

function assertTraceFieldMatches(input: {
  sourceExecutionId: ExecutionId;
  field: string;
  supplied?: string | undefined;
  traceValue?: string | undefined;
}): void {
  if (
    input.supplied === undefined ||
    input.traceValue === undefined ||
    input.supplied === input.traceValue
  ) {
    return;
  }

  throw createMemoryServiceError({
    code: memoryServiceErrorCodes.sourceExecutionMismatch,
    message: "Memory source execution link does not match supplied metadata.",
    details: {
      executionId: input.sourceExecutionId,
      field: input.field,
      supplied: input.supplied,
      traceValue: input.traceValue,
    },
  });
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }

  return output;
}

function omitSemanticStorageFields(input: Record<string, unknown>): Record<string, unknown> {
  const {
    id: _id,
    status: _status,
    supersedesMemoryId: _supersedesMemoryId,
    supersededByMemoryId: _supersededByMemoryId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    inferred: _inferred,
    longLived: _longLived,
    ...request
  } = input;

  return compactObject(request);
}

function omitEpisodicStorageFields(input: Record<string, unknown>): Record<string, unknown> {
  const {
    id: _id,
    status: _status,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...request
  } = input;

  return compactObject(request);
}
