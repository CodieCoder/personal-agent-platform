import { z } from "zod";
import {
  capabilityIdSchema,
  executionIdSchema,
  executionTraceStepIdSchema,
  isoDateTimeSchema,
  threadIdSchema,
  workspaceIdSchema,
} from "./common.js";
import { platformErrorCodeSchema } from "./errors.js";
import { jsonValueSchema, type JsonValue } from "./memory.js";

export const executionStatusSchema = z.enum(["running", "completed", "failed", "cancelled"]);

export const traceStepStatusSchema = z.enum(["started", "completed", "failed", "skipped"]);

export const traceStepKindSchema = z.enum([
  "skill",
  "validation",
  "tool",
  "memory",
  "approval",
  "ui",
  "llm",
  "workflow",
]);

export const traceStepMetadataSchema = z
  .record(z.string().min(1).max(80), jsonValueSchema)
  .refine((metadata) => Object.keys(metadata).length <= 25, {
    message: "Trace step metadata may include at most 25 keys.",
  });

export const executionTraceStepSchema = z
  .object({
    id: executionTraceStepIdSchema,
    executionId: executionIdSchema,
    sequence: z.number().int().nonnegative(),
    kind: traceStepKindSchema,
    name: z.string().min(1),
    status: traceStepStatusSchema,
    summary: z.string().min(1).optional(),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.optional(),
    errorCode: platformErrorCodeSchema.optional(),
    errorMessage: z.string().min(1).optional(),
    metadata: traceStepMetadataSchema.optional(),
    createdAt: isoDateTimeSchema,
  })
  .strict();

export const executionTraceSchema = z
  .object({
    id: executionIdSchema,
    capabilityId: capabilityIdSchema,
    status: executionStatusSchema,
    workspaceId: workspaceIdSchema.optional(),
    threadId: threadIdSchema.optional(),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.optional(),
    errorCode: platformErrorCodeSchema.optional(),
    errorMessage: z.string().min(1).optional(),
    output: jsonValueSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    steps: z.array(executionTraceStepSchema).default([]),
  })
  .strict();

export const executionTraceSummarySchema = z
  .object({
    id: executionIdSchema,
    capabilityId: capabilityIdSchema,
    status: executionStatusSchema,
    workspaceId: workspaceIdSchema.optional(),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.optional(),
    stepCount: z.number().int().nonnegative(),
  })
  .strict();

export const executionTraceListQuerySchema = z
  .object({
    workspaceId: workspaceIdSchema.optional(),
    capabilityId: capabilityIdSchema.optional(),
    status: executionStatusSchema.optional(),
    startedFrom: isoDateTimeSchema.optional(),
    startedTo: isoDateTimeSchema.optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine(
    (query) =>
      query.startedFrom === undefined ||
      query.startedTo === undefined ||
      query.startedFrom <= query.startedTo,
    {
      message: "Execution trace start range cannot be inverted.",
      path: ["startedTo"],
    },
  );

export const executionTraceListPageSchema = z
  .object({
    executions: z.array(executionTraceSummarySchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  })
  .strict();

export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type TraceStepStatus = z.infer<typeof traceStepStatusSchema>;
export type TraceStepKind = z.infer<typeof traceStepKindSchema>;
export type TraceStepMetadata = Record<string, JsonValue>;
export type ExecutionTraceStep = z.infer<typeof executionTraceStepSchema>;
export type ExecutionTrace = z.infer<typeof executionTraceSchema>;
export type ExecutionTraceSummary = z.infer<typeof executionTraceSummarySchema>;
export type ExecutionTraceListQuery = z.infer<typeof executionTraceListQuerySchema>;
export type ExecutionTraceListPage = z.infer<typeof executionTraceListPageSchema>;
