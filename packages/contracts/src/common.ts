import { z } from "zod";

export const stableIdentifierSchema = z
  .string()
  .min(3)
  .max(160)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u, {
    message: "Use lowercase letters, numbers, dots, underscores, or dashes.",
  });

export const opaqueIdentifierSchema = z.string().min(3).max(200);

export const capabilityIdSchema = stableIdentifierSchema;
export const toolIdSchema = stableIdentifierSchema;
export const skillIdSchema = stableIdentifierSchema;
export const uiBlockTypeSchema = stableIdentifierSchema;

export const executionIdSchema = opaqueIdentifierSchema;
export const executionTraceStepIdSchema = opaqueIdentifierSchema;
export const approvalIdSchema = opaqueIdentifierSchema;
export const memoryIdSchema = opaqueIdentifierSchema;
export const workspaceIdSchema = opaqueIdentifierSchema;
export const threadIdSchema = opaqueIdentifierSchema;

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export type StableIdentifier = z.infer<typeof stableIdentifierSchema>;
export type OpaqueIdentifier = z.infer<typeof opaqueIdentifierSchema>;
export type CapabilityId = z.infer<typeof capabilityIdSchema>;
export type ToolId = z.infer<typeof toolIdSchema>;
export type SkillId = z.infer<typeof skillIdSchema>;
export type UiBlockType = z.infer<typeof uiBlockTypeSchema>;
export type ExecutionId = z.infer<typeof executionIdSchema>;
export type ExecutionTraceStepId = z.infer<typeof executionTraceStepIdSchema>;
export type ApprovalId = z.infer<typeof approvalIdSchema>;
export type MemoryId = z.infer<typeof memoryIdSchema>;
export type WorkspaceId = z.infer<typeof workspaceIdSchema>;
export type ThreadId = z.infer<typeof threadIdSchema>;
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;
