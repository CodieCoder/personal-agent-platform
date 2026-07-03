import type {
  CapabilityId,
  ExecutionId,
  JsonValue,
  MemoryId,
  MemoryScope,
  MemorySensitivity,
  MemoryStatus,
  SemanticMemoryQuery,
  SemanticMemoryRecord,
  ThreadId,
  WorkspaceId,
} from "@pap/contracts";

export type CreateSemanticMemoryInput = {
  id?: MemoryId;
  scope: MemoryScope;
  workspaceId?: WorkspaceId;
  capabilityId?: CapabilityId;
  threadId?: ThreadId;
  subject: string;
  predicate: string;
  value: JsonValue;
  confidence?: number;
  sensitivity?: MemorySensitivity;
  sourceType?: string;
  sourceRef?: string;
  sourceExecutionId?: ExecutionId;
  sourceCapabilityId?: CapabilityId;
  createdBy?: string;
  evidenceRefs?: JsonValue[];
  status?: MemoryStatus;
  supersedesMemoryId?: MemoryId;
  supersededByMemoryId?: MemoryId;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
};

export type UpdateSemanticMemoryInput = {
  id: MemoryId;
  subject?: string;
  predicate?: string;
  value?: JsonValue;
  confidence?: number;
  sensitivity?: MemorySensitivity;
  sourceRef?: string;
  evidenceRefs?: JsonValue[];
  expiresAt?: string;
  updatedAt?: string;
};

export type SupersedeSemanticMemoryInput = {
  id: MemoryId;
  replacement: CreateSemanticMemoryInput;
  supersededAt?: string;
};

export type MarkSemanticMemoryExpiredInput = {
  id: MemoryId;
  expiredAt?: string;
};

export type ApproveSemanticMemoryProposalInput = {
  id: MemoryId;
  approvedAt?: string;
};

export type RejectSemanticMemoryProposalInput = {
  id: MemoryId;
  rejectedAt?: string;
};

export type SoftDeleteSemanticMemoryInput = {
  id: MemoryId;
  deletedAt?: string;
};

export type SupersedeSemanticMemoryResult = {
  previous: SemanticMemoryRecord;
  replacement: SemanticMemoryRecord;
};

export interface SemanticMemoryRepository {
  create(input: CreateSemanticMemoryInput): Promise<SemanticMemoryRecord>;
  getById(id: MemoryId): Promise<SemanticMemoryRecord | null>;
  list(query?: SemanticMemoryQuery): Promise<SemanticMemoryRecord[]>;
  update(input: UpdateSemanticMemoryInput): Promise<SemanticMemoryRecord>;
  supersede(input: SupersedeSemanticMemoryInput): Promise<SupersedeSemanticMemoryResult>;
  approveProposal(input: ApproveSemanticMemoryProposalInput): Promise<SemanticMemoryRecord>;
  rejectProposal(input: RejectSemanticMemoryProposalInput): Promise<SemanticMemoryRecord>;
  markExpired(input: MarkSemanticMemoryExpiredInput): Promise<SemanticMemoryRecord>;
  softDelete(input: SoftDeleteSemanticMemoryInput): Promise<SemanticMemoryRecord>;
}
