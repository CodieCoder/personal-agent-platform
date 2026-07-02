import { z } from "zod";
import {
  approvalIdSchema,
  capabilityIdSchema,
  executionIdSchema,
  isoDateTimeSchema,
  skillIdSchema,
  stableIdentifierSchema,
  threadIdSchema,
  toolIdSchema,
  uiBlockTypeSchema,
  workspaceIdSchema,
} from "./common.js";
import { platformErrorCodeSchema, platformErrorSchema } from "./errors.js";
import {
  executionStatusSchema,
  traceStepKindSchema,
  traceStepMetadataSchema,
  traceStepStatusSchema,
} from "./execution.js";

export const capabilityPermissionSchema = z.enum([
  "profile.read",
  "memory.read",
  "memory.write",
  "workspace.read",
  "workspace.write",
  "web.search",
  "web.fetch",
  "file.read",
  "file.write",
  "email.read",
  "email.draft",
  "email.send",
  "calendar.read",
  "calendar.write",
  "finance.read",
  "finance.write",
  "document.read",
  "document.write",
  "llm.generate",
  "ui.render",
]);

export const sideEffectSchema = z.enum([
  "none",
  "draft",
  "write",
  "delete",
  "external_publish",
  "financial",
]);

export const capabilityTrustLevelSchema = z.enum([
  "core",
  "trusted_local",
  "trusted_git",
  "reviewed_community",
  "untrusted",
]);

export const capabilitySkillMetadataSchema = z
  .object({
    id: skillIdSchema,
    version: z.string().min(1),
    path: z.string().min(1),
    entryFile: z.string().min(1).default("SKILL.md"),
  })
  .strict();

export const capabilityManifestSchema = z
  .object({
    id: capabilityIdSchema,
    version: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    skill: capabilitySkillMetadataSchema,
    inputSchemaId: stableIdentifierSchema,
    outputSchemaId: stableIdentifierSchema,
    allowedTools: z.array(toolIdSchema).default([]),
    allowedChildCapabilities: z.array(capabilityIdSchema).default([]),
    supportedUiBlocks: z.array(uiBlockTypeSchema).default([]),
    permissions: z.array(capabilityPermissionSchema).default([]),
    sideEffects: z.array(sideEffectSchema).min(1).default(["none"]),
    approvalPolicyId: stableIdentifierSchema,
    memoryPolicyId: stableIdentifierSchema,
    trustLevel: capabilityTrustLevelSchema,
    tags: z.array(stableIdentifierSchema).default([]),
  })
  .strict();

export const capabilityExecutionSourceSchema = z.enum(["web", "cli", "worker", "api", "scheduled"]);

export const capabilityExecutionRequestContextSchema = z
  .object({
    userRequestId: z.string().min(1).optional(),
    parentExecutionId: executionIdSchema.optional(),
    initiatedBy: z.enum(["user", "system", "capability"]).default("user"),
  })
  .strict();

export const capabilityExecutionRequestSchema = z
  .object({
    capabilityId: capabilityIdSchema,
    input: z.unknown(),
    workspaceId: workspaceIdSchema.optional(),
    threadId: threadIdSchema.optional(),
    source: capabilityExecutionSourceSchema,
    requestedUi: z.boolean().default(true),
    context: capabilityExecutionRequestContextSchema.default({ initiatedBy: "user" }),
  })
  .strict();

export const capabilityExecutionWarningSchema = z
  .object({
    code: platformErrorCodeSchema,
    message: z.string().min(1),
  })
  .strict();

export const capabilityExecutionResultSchema = z
  .object({
    executionId: executionIdSchema,
    traceId: executionIdSchema,
    capabilityId: capabilityIdSchema,
    status: executionStatusSchema,
    data: z.unknown().optional(),
    ui: z.array(z.unknown()).default([]),
    approvals: z.array(approvalIdSchema).default([]),
    warnings: z.array(capabilityExecutionWarningSchema).default([]),
    error: platformErrorSchema.optional(),
  })
  .strict();

export const capabilityTraceStepInputSchema = z
  .object({
    kind: traceStepKindSchema,
    name: z.string().min(1),
    status: traceStepStatusSchema.default("completed"),
    summary: z.string().min(1).optional(),
    startedAt: isoDateTimeSchema.optional(),
    completedAt: isoDateTimeSchema.optional(),
    errorCode: platformErrorCodeSchema.optional(),
    errorMessage: z.string().min(1).optional(),
    metadata: traceStepMetadataSchema.optional(),
  })
  .strict();

export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;
export type CapabilitySkillMetadata = z.infer<typeof capabilitySkillMetadataSchema>;
export type CapabilityPermission = z.infer<typeof capabilityPermissionSchema>;
export type SideEffect = z.infer<typeof sideEffectSchema>;
export type CapabilityTrustLevel = z.infer<typeof capabilityTrustLevelSchema>;
export type CapabilityExecutionSource = z.infer<typeof capabilityExecutionSourceSchema>;
export type CapabilityExecutionRequestContext = z.infer<
  typeof capabilityExecutionRequestContextSchema
>;
export type CapabilityExecutionRequest = z.infer<typeof capabilityExecutionRequestSchema>;
export type CapabilityExecutionWarning = z.infer<typeof capabilityExecutionWarningSchema>;
export type CapabilityExecutionResult = z.infer<typeof capabilityExecutionResultSchema>;
export type CapabilityTraceStepInput = z.infer<typeof capabilityTraceStepInputSchema>;

const traceAddStepFunctionSchema = z.custom<(step: CapabilityTraceStepInput) => Promise<void>>(
  (value) => typeof value === "function",
  { message: "Expected a trace step writer function." },
);

const toolExecuteFunctionSchema = z.custom<
  (toolId: z.infer<typeof toolIdSchema>, input: unknown) => Promise<unknown>
>((value) => typeof value === "function", {
  message: "Expected a tool execution function.",
});

const unknownFunctionSchema = z.custom<(input: unknown) => Promise<unknown>>(
  (value) => typeof value === "function",
  { message: "Expected an async function." },
);

const uiBuildFunctionSchema = z.custom<(blocks: unknown[]) => Promise<unknown[]>>(
  (value) => typeof value === "function",
  { message: "Expected a UI build function." },
);

export const capabilityExecutionContextSchema = z
  .object({
    executionId: executionIdSchema,
    capability: capabilityManifestSchema,
    workspaceId: workspaceIdSchema.optional(),
    threadId: threadIdSchema.optional(),
    source: capabilityExecutionSourceSchema,
    trace: z
      .object({
        addStep: traceAddStepFunctionSchema,
      })
      .strict(),
    tools: z
      .object({
        execute: toolExecuteFunctionSchema,
      })
      .strict(),
    memory: z
      .object({
        getMasterProfile: unknownFunctionSchema,
        search: unknownFunctionSchema,
        write: unknownFunctionSchema,
      })
      .strict(),
    llm: z
      .object({
        generateStructured: unknownFunctionSchema,
      })
      .strict(),
    ui: z
      .object({
        build: uiBuildFunctionSchema,
      })
      .strict(),
    approvals: z
      .object({
        request: unknownFunctionSchema,
      })
      .strict(),
  })
  .strict();

export type CapabilityExecutionContext = z.infer<typeof capabilityExecutionContextSchema>;

export type CapabilityExecuteFunction = (
  input: unknown,
  context: CapabilityExecutionContext,
) => Promise<unknown>;

const zodSchemaSchema = z.custom<z.ZodType<unknown>>(
  (value) => typeof value === "object" && value !== null && "safeParse" in value,
  { message: "Expected a Zod schema." },
);

const executeFunctionSchema = z.custom<CapabilityExecuteFunction>(
  (value) => typeof value === "function",
  { message: "Expected a capability execute function." },
);

export const capabilityDefinitionSchema = z
  .object({
    manifest: capabilityManifestSchema,
    inputSchema: zodSchemaSchema,
    outputSchema: zodSchemaSchema,
    execute: executeFunctionSchema,
  })
  .strict();

export type CapabilityDefinition = z.infer<typeof capabilityDefinitionSchema>;
