import { z } from "zod";
import {
  capabilityIdSchema,
  executionIdSchema,
  isoDateTimeSchema,
  memoryIdSchema,
  stableIdentifierSchema,
  threadIdSchema,
  workspaceIdSchema,
} from "./common.js";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonArraySchema = z.array(jsonValueSchema);

export const memoryScopeSchema = z.enum(["personal", "workspace", "capability", "thread"]);

export const memoryStatusSchema = z.enum([
  "active",
  "proposed",
  "rejected",
  "superseded",
  "expired",
  "deleted",
]);

export const memorySensitivitySchema = z.enum(["low", "moderate", "sensitive"]);

export const memoryConfidenceSchema = z.number().finite().min(0).max(1);

export const memorySourceTypeSchema = stableIdentifierSchema;

const optionalTextSchema = z.string().trim().min(1).max(1_000).optional();

const memoryContextShape = {
  scope: memoryScopeSchema,
  workspaceId: workspaceIdSchema.optional(),
  capabilityId: capabilityIdSchema.optional(),
  threadId: threadIdSchema.optional(),
} as const;

const memoryProvenanceShape = {
  sourceType: memorySourceTypeSchema.default("manual"),
  sourceRef: optionalTextSchema,
  sourceExecutionId: executionIdSchema.optional(),
  sourceCapabilityId: capabilityIdSchema.optional(),
  evidenceRefs: jsonArraySchema.default([]),
} as const;

const memoryStateShape = {
  confidence: memoryConfidenceSchema.default(1),
  sensitivity: memorySensitivitySchema.default("low"),
  status: memoryStatusSchema.default("active"),
  expiresAt: isoDateTimeSchema.optional(),
} as const;

const timestampFieldsShape = {
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
} as const;

export const semanticMemorySubjectSchema = z.string().trim().min(1).max(240);

export const semanticMemoryPredicateSchema = stableIdentifierSchema;

export const semanticMemoryRecordSchema = z
  .object({
    id: memoryIdSchema,
    ...memoryContextShape,
    subject: semanticMemorySubjectSchema,
    predicate: semanticMemoryPredicateSchema,
    value: jsonValueSchema,
    ...memoryProvenanceShape,
    createdBy: z.string().trim().min(1).max(160).default("user"),
    ...memoryStateShape,
    supersedesMemoryId: memoryIdSchema.optional(),
    supersededByMemoryId: memoryIdSchema.optional(),
    ...timestampFieldsShape,
  })
  .strict()
  .superRefine(validateMemoryScope);

export const createSemanticMemoryRequestSchema = z
  .object({
    ...memoryContextShape,
    subject: semanticMemorySubjectSchema,
    predicate: semanticMemoryPredicateSchema,
    value: jsonValueSchema,
    ...memoryProvenanceShape,
    createdBy: z.string().trim().min(1).max(160).default("user"),
    confidence: memoryStateShape.confidence,
    sensitivity: memoryStateShape.sensitivity,
    expiresAt: memoryStateShape.expiresAt,
  })
  .strict()
  .superRefine(validateMemoryScope);

export const updateSemanticMemoryRequestSchema = z
  .object({
    id: memoryIdSchema,
    subject: semanticMemorySubjectSchema.optional(),
    predicate: semanticMemoryPredicateSchema.optional(),
    value: jsonValueSchema.optional(),
    confidence: memoryConfidenceSchema.optional(),
    sensitivity: memorySensitivitySchema.optional(),
    sourceRef: optionalTextSchema,
    evidenceRefs: jsonArraySchema.optional(),
    expiresAt: isoDateTimeSchema.optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.subject !== undefined ||
      input.predicate !== undefined ||
      input.value !== undefined ||
      input.confidence !== undefined ||
      input.sensitivity !== undefined ||
      input.sourceRef !== undefined ||
      input.evidenceRefs !== undefined ||
      input.expiresAt !== undefined,
    { message: "At least one semantic memory field must be provided." },
  );

export const episodicMemoryEventTypeSchema = stableIdentifierSchema;

export const episodicMemorySummarySchema = z.string().trim().min(1).max(1_000);

export const episodicMemoryOutcomeSchema = z.string().trim().min(1).max(2_000);

export const episodicMemoryRecordSchema = z
  .object({
    id: memoryIdSchema,
    ...memoryContextShape,
    executionId: executionIdSchema.optional(),
    eventType: episodicMemoryEventTypeSchema,
    summary: episodicMemorySummarySchema,
    outcome: episodicMemoryOutcomeSchema.optional(),
    relatedEntities: jsonArraySchema.default([]),
    sourceType: memoryProvenanceShape.sourceType,
    sourceRef: memoryProvenanceShape.sourceRef,
    sourceCapabilityId: memoryProvenanceShape.sourceCapabilityId,
    evidenceRefs: memoryProvenanceShape.evidenceRefs,
    ...memoryStateShape,
    ...timestampFieldsShape,
  })
  .strict()
  .superRefine(validateMemoryScope);

export const createEpisodicMemoryRequestSchema = z
  .object({
    ...memoryContextShape,
    executionId: executionIdSchema.optional(),
    eventType: episodicMemoryEventTypeSchema,
    summary: episodicMemorySummarySchema,
    outcome: episodicMemoryOutcomeSchema.optional(),
    relatedEntities: jsonArraySchema.default([]),
    sourceType: memoryProvenanceShape.sourceType,
    sourceRef: memoryProvenanceShape.sourceRef,
    sourceCapabilityId: memoryProvenanceShape.sourceCapabilityId,
    evidenceRefs: memoryProvenanceShape.evidenceRefs,
    confidence: memoryStateShape.confidence,
    sensitivity: memoryStateShape.sensitivity,
    expiresAt: memoryStateShape.expiresAt,
  })
  .strict()
  .superRefine(validateMemoryScope);

export const updateEpisodicMemoryRequestSchema = z
  .object({
    id: memoryIdSchema,
    eventType: episodicMemoryEventTypeSchema.optional(),
    summary: episodicMemorySummarySchema.optional(),
    outcome: episodicMemoryOutcomeSchema.optional(),
    relatedEntities: jsonArraySchema.optional(),
    confidence: memoryConfidenceSchema.optional(),
    sensitivity: memorySensitivitySchema.optional(),
    sourceRef: optionalTextSchema,
    evidenceRefs: jsonArraySchema.optional(),
    expiresAt: isoDateTimeSchema.optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.eventType !== undefined ||
      input.summary !== undefined ||
      input.outcome !== undefined ||
      input.relatedEntities !== undefined ||
      input.confidence !== undefined ||
      input.sensitivity !== undefined ||
      input.sourceRef !== undefined ||
      input.evidenceRefs !== undefined ||
      input.expiresAt !== undefined,
    { message: "At least one episodic memory field must be provided." },
  );

const memoryQueryBaseShape = {
  scope: memoryScopeSchema.optional(),
  workspaceId: workspaceIdSchema.optional(),
  capabilityId: capabilityIdSchema.optional(),
  threadId: threadIdSchema.optional(),
  status: memoryStatusSchema.default("active"),
  sensitivity: memorySensitivitySchema.optional(),
  confidenceMin: memoryConfidenceSchema.optional(),
  confidenceMax: memoryConfidenceSchema.optional(),
  createdFrom: isoDateTimeSchema.optional(),
  createdTo: isoDateTimeSchema.optional(),
  includeExpired: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
} as const;

export const semanticMemoryQuerySchema = z
  .object({
    ...memoryQueryBaseShape,
    subject: semanticMemorySubjectSchema.optional(),
    predicate: semanticMemoryPredicateSchema.optional(),
    sourceExecutionId: executionIdSchema.optional(),
    sourceCapabilityId: capabilityIdSchema.optional(),
  })
  .strict()
  .superRefine(validateMemoryQueryRange);

export const episodicMemoryQuerySchema = z
  .object({
    ...memoryQueryBaseShape,
    executionId: executionIdSchema.optional(),
    eventType: episodicMemoryEventTypeSchema.optional(),
    sourceCapabilityId: capabilityIdSchema.optional(),
  })
  .strict()
  .superRefine(validateMemoryQueryRange);

export type MemoryScope = z.infer<typeof memoryScopeSchema>;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;
export type MemorySensitivity = z.infer<typeof memorySensitivitySchema>;
export type MemorySourceType = z.infer<typeof memorySourceTypeSchema>;
export type SemanticMemoryRecord = z.infer<typeof semanticMemoryRecordSchema>;
export type CreateSemanticMemoryRequest = z.infer<typeof createSemanticMemoryRequestSchema>;
export type UpdateSemanticMemoryRequest = z.infer<typeof updateSemanticMemoryRequestSchema>;
export type SemanticMemoryQuery = z.infer<typeof semanticMemoryQuerySchema>;
export type EpisodicMemoryRecord = z.infer<typeof episodicMemoryRecordSchema>;
export type CreateEpisodicMemoryRequest = z.infer<typeof createEpisodicMemoryRequestSchema>;
export type UpdateEpisodicMemoryRequest = z.infer<typeof updateEpisodicMemoryRequestSchema>;
export type EpisodicMemoryQuery = z.infer<typeof episodicMemoryQuerySchema>;

function validateMemoryScope(
  input: {
    scope: z.infer<typeof memoryScopeSchema>;
    workspaceId?: string | undefined;
    capabilityId?: string | undefined;
    threadId?: string | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (input.scope === "workspace" && input.workspaceId === undefined) {
    context.addIssue({
      code: "custom",
      path: ["workspaceId"],
      message: "Workspace-scoped memory requires a workspace ID.",
    });
  }

  if (input.scope === "capability" && input.capabilityId === undefined) {
    context.addIssue({
      code: "custom",
      path: ["capabilityId"],
      message: "Capability-scoped memory requires a capability ID.",
    });
  }

  if (input.scope === "thread" && input.threadId === undefined) {
    context.addIssue({
      code: "custom",
      path: ["threadId"],
      message: "Thread-scoped memory requires a thread ID.",
    });
  }
}

function validateMemoryQueryRange(
  input: {
    confidenceMin?: number | undefined;
    confidenceMax?: number | undefined;
    createdFrom?: string | undefined;
    createdTo?: string | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (
    input.confidenceMin !== undefined &&
    input.confidenceMax !== undefined &&
    input.confidenceMin > input.confidenceMax
  ) {
    context.addIssue({
      code: "custom",
      path: ["confidenceMin"],
      message: "confidenceMin must be less than or equal to confidenceMax.",
    });
  }

  if (
    input.createdFrom !== undefined &&
    input.createdTo !== undefined &&
    Date.parse(input.createdFrom) > Date.parse(input.createdTo)
  ) {
    context.addIssue({
      code: "custom",
      path: ["createdFrom"],
      message: "createdFrom must be earlier than or equal to createdTo.",
    });
  }
}
