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
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    steps: z.array(executionTraceStepSchema).default([]),
  })
  .strict();

export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type TraceStepStatus = z.infer<typeof traceStepStatusSchema>;
export type TraceStepKind = z.infer<typeof traceStepKindSchema>;
export type ExecutionTraceStep = z.infer<typeof executionTraceStepSchema>;
export type ExecutionTrace = z.infer<typeof executionTraceSchema>;
