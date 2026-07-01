import type {
  CapabilityId,
  EpisodicMemoryQuery,
  EpisodicMemoryRecord,
  ExecutionId,
  JsonValue,
  MemoryId,
  MemoryScope,
  MemorySensitivity,
  MemoryStatus,
  ThreadId,
  WorkspaceId,
} from "@pap/contracts";

export type CreateEpisodicMemoryInput = {
  id?: MemoryId;
  scope: MemoryScope;
  workspaceId?: WorkspaceId;
  capabilityId?: CapabilityId;
  threadId?: ThreadId;
  executionId?: ExecutionId;
  eventType: string;
  summary: string;
  outcome?: string;
  relatedEntities?: JsonValue[];
  evidenceRefs?: JsonValue[];
  confidence?: number;
  sensitivity?: MemorySensitivity;
  sourceType?: string;
  sourceRef?: string;
  sourceCapabilityId?: CapabilityId;
  status?: MemoryStatus;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
};

export type UpdateEpisodicMemoryInput = {
  id: MemoryId;
  eventType?: string;
  summary?: string;
  outcome?: string;
  relatedEntities?: JsonValue[];
  evidenceRefs?: JsonValue[];
  confidence?: number;
  sensitivity?: MemorySensitivity;
  sourceRef?: string;
  expiresAt?: string;
  updatedAt?: string;
};

export type MarkEpisodicMemoryExpiredInput = {
  id: MemoryId;
  expiredAt?: string;
};

export type SoftDeleteEpisodicMemoryInput = {
  id: MemoryId;
  deletedAt?: string;
};

export interface EpisodicMemoryRepository {
  create(input: CreateEpisodicMemoryInput): Promise<EpisodicMemoryRecord>;
  getById(id: MemoryId): Promise<EpisodicMemoryRecord | null>;
  list(query?: EpisodicMemoryQuery): Promise<EpisodicMemoryRecord[]>;
  update(input: UpdateEpisodicMemoryInput): Promise<EpisodicMemoryRecord>;
  markExpired(input: MarkEpisodicMemoryExpiredInput): Promise<EpisodicMemoryRecord>;
  softDelete(input: SoftDeleteEpisodicMemoryInput): Promise<EpisodicMemoryRecord>;
}
