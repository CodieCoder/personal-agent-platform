Personal Agent Platform — Runtime and Shared Contracts

Status: Foundational Architecture Contract
Depends on: 01-product-foundation.md, 02-product-principles.md, 03-platform-architecture.md
Purpose: Define the shared runtime contracts that capabilities, tools, memory services, approvals, traces, and UI blocks must use.

⸻

1. Purpose

The runtime exists to make capabilities plug-and-play without allowing them to bypass:

- permissions
- approval rules
- memory policies
- schema validation
- trace logging
- UI validation
- tool restrictions

A capability should be able to focus on its workflow while the runtime enforces platform rules.

The runtime is not an autonomous agent. It is a controlled execution environment.

⸻

2. Runtime Responsibilities

The runtime must:

Resolve capabilities
Load skills and references
Validate inputs and outputs
Register and authorize tools
Apply approval policies
Read/write memory through policy-aware services
Create execution traces
Validate UI blocks
Return structured results

The runtime must not:

Contain capability-specific business logic
Invent workflows
Directly render arbitrary HTML or JSX
Allow undeclared tool access
Allow unvalidated memory writes
Silently execute side-effect tools

⸻

3. Contract Design Rules

All external boundaries use Zod schemas.

This includes:

API requests
Capability input
Capability output
Tool input
Tool output
LLM structured output
Memory write requests
UI block data
Approval requests
Trace events

Zod is selected because it provides TypeScript-first runtime validation and inferred static types from the same schema definitions. (Zod)

Every contract must have:

Stable ID
Version
Zod schema
TypeScript inferred type
Validation error behavior
Migration strategy if breaking

⸻

4. Package Ownership

Shared contracts live in:

packages/contracts

Suggested package name:

@pap/contracts

This package must not depend on:

apps
concrete capabilities
concrete tools
concrete storage adapters
concrete UI components

It may depend only on low-level schema utilities such as Zod.

⸻

5. Core Identifiers

All major objects must use stable identifiers.

export type CapabilityId = string;
export type ToolId = string;
export type SkillId = string;
export type UiBlockType = string;
export type ExecutionId = string;
export type ApprovalId = string;
export type MemoryId = string;
export type WorkspaceId = string;
export type ThreadId = string;

Recommended identifier format:

capability.research
tool.search.searxng
tool.profile.master
skill.research.morning-brief
ui.article-list
ui.approval-dialog

Avoid IDs that depend on display names.

⸻

6. Capability Manifest Contract

Every capability package must export a capability manifest.

import { z } from "zod";
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
"ui.render"
]);
export const sideEffectSchema = z.enum([
"none",
"draft",
"write",
"delete",
"external_publish",
"financial"
]);
export const capabilityManifestSchema = z.object({
id: z.string().min(3),
version: z.string().min(1),
name: z.string().min(1),
description: z.string().min(1),
skill: z.object({
id: z.string().min(3),
version: z.string().min(1),
rootPath: z.string().min(1),
entryFile: z.string().default("SKILL.md")
}),
inputSchemaId: z.string().min(1),
outputSchemaId: z.string().min(1),
allowedTools: z.array(z.string()).default([]),
allowedChildCapabilities: z.array(z.string()).default([]),
supportedUiBlocks: z.array(z.string()).default([]),
permissions: z.array(capabilityPermissionSchema).default([]),
sideEffects: z.array(sideEffectSchema).default(["none"]),
approvalPolicyId: z.string().min(1),
memoryPolicyId: z.string().min(1),
trustLevel: z.enum([
"core",
"trusted_local",
"trusted_git",
"reviewed_community",
"untrusted"
]),
tags: z.array(z.string()).default([])
});
export type CapabilityManifest = z.infer<
typeof capabilityManifestSchema

> ;

Required rules

A capability:

Must declare all tools it can call.
Must declare all UI block types it can produce.
Must declare requested permissions.
Must declare its skill package.
Must declare approval and memory policies.
Must have a version.

A capability cannot call a tool that is absent from allowedTools.

⸻

7. Skill Manifest Contract

Skills should be portable folders compatible with the Agent Skills format.

The skill folder must contain:

SKILL.md

The standard skill format uses YAML frontmatter followed by Markdown instructions. (agentskills.io)

Platform-specific metadata may be added through a separate manifest file:

skill.manifest.json

Example:

export const skillManifestSchema = z.object({
id: z.string().min(3),
version: z.string().min(1),
capabilityId: z.string().min(3),
title: z.string().min(1),
description: z.string().min(1),
rootPath: z.string().min(1),
entryFile: z.string().default("SKILL.md"),
references: z.array(
z.object({
id: z.string(),
path: z.string(),
when: z.string()
})
).default([]),
examples: z.array(
z.object({
id: z.string(),
path: z.string(),
description: z.string()
})
).default([]),
allowedTools: z.array(z.string()).default([]),
maxToolCalls: z.number().int().positive().optional()
});
export type SkillManifest = z.infer<typeof skillManifestSchema>;

Skill loading rules

The runtime loads:

1. Skill metadata
2. SKILL.md after capability selection
3. References only when workflow requires them
4. Examples only when necessary

Keep core skill instructions concise. The Agent Skills guidance recommends keeping SKILL.md focused and moving deeper content to reference files when necessary. (agentskills.io)

⸻

8. Tool Manifest Contract

Every tool must export a manifest and an execution function.

export const toolManifestSchema = z.object({
id: z.string().min(3),
version: z.string().min(1),
name: z.string().min(1),
description: z.string().min(1),
inputSchemaId: z.string().min(1),
outputSchemaId: z.string().min(1),
requiredPermission: capabilityPermissionSchema,
sideEffect: sideEffectSchema,
requiresApproval: z.boolean().default(false),
supportsOffline: z.boolean().default(false),
tags: z.array(z.string()).default([])
});
export type ToolManifest = z.infer<typeof toolManifestSchema>;

Tool interface:

export type ToolExecutionContext = {
executionId: ExecutionId;
capabilityId: CapabilityId;
workspaceId?: WorkspaceId;
threadId?: ThreadId;
approvedPermissions: string[];
approvalId?: ApprovalId;
trace: {
addStep: (step: TraceStepInput) => Promise<void>;
};
};
export type ToolDefinition<TInput, TOutput> = {
manifest: ToolManifest;
inputSchema: z.ZodType<TInput>;
outputSchema: z.ZodType<TOutput>;
execute: (
input: TInput,
context: ToolExecutionContext
) => Promise<TOutput>;
};

Tool execution rules

Before executing a tool, the runtime must validate:

The capability declared the tool.
The capability has the required permission.
Input matches tool schema.
Approval exists when required.
The side effect is allowed by current policy.

⸻

9. Capability Execution Request

All capability runs begin with a typed request.

export const capabilityExecutionRequestSchema = z.object({
capabilityId: z.string().min(3),
input: z.unknown(),
workspaceId: z.string().optional(),
threadId: z.string().optional(),
source: z.enum([
"web",
"cli",
"worker",
"api",
"scheduled"
]),
requestedUi: z.boolean().default(true),
context: z.object({
userRequestId: z.string().optional(),
parentExecutionId: z.string().optional(),
initiatedBy: z.enum(["user", "system", "capability"]).default("user")
}).default({})
});
export type CapabilityExecutionRequest = z.infer<
typeof capabilityExecutionRequestSchema

> ;

⸻

10. Capability Execution Result

Every successful capability run returns structured output.

export const capabilityExecutionStatusSchema = z.enum([
"completed",
"awaiting_approval",
"failed",
"cancelled"
]);
export const capabilityExecutionResultSchema = z.object({
executionId: z.string(),
capabilityId: z.string(),
status: capabilityExecutionStatusSchema,
data: z.unknown().optional(),
ui: z.array(z.unknown()).default([]),
approvals: z.array(z.string()).default([]),
warnings: z.array(
z.object({
code: z.string(),
message: z.string()
})
).default([]),
traceId: z.string(),
error: z.object({
code: z.string(),
message: z.string(),
retryable: z.boolean()
}).optional()
});
export type CapabilityExecutionResult = z.infer<
typeof capabilityExecutionResultSchema

> ;

A result is not complete until:

Output schema validation passed.
Required UI block data validation passed.
Required approval state is recorded.
Trace finalization occurred.

⸻

11. Workflow Contract

Capabilities must define their workflow explicitly.

export const workflowStepKindSchema = z.enum([
"validate_input",
"load_skill",
"resolve_context",
"plan",
"tool",
"sub_capability",
"llm",
"validate_output",
"memory_read",
"memory_write",
"build_ui",
"approval",
"finalize"
]);
export const workflowStepDefinitionSchema = z.object({
id: z.string().min(1),
kind: workflowStepKindSchema,
name: z.string().min(1),
required: z.boolean().default(true),
allowedTools: z.array(z.string()).default([]),
allowedChildCapabilities: z.array(z.string()).default([]),
maxAttempts: z.number().int().positive().default(1),
timeoutMs: z.number().int().positive().optional(),
onFailure: z.enum([
"fail_execution",
"continue_with_warning",
"skip"
]).default("fail_execution")
});
export type WorkflowStepDefinition = z.infer<
typeof workflowStepDefinitionSchema

> ;

Standard lifecycle

Every workflow must include:

validate_input
load_skill
validate_output
finalize

Most workflows should also include:

resolve_context
tool execution
build_ui

⸻

12. Memory Contracts

Memory must remain separate by type.

12.1 Common memory metadata

export const memoryMetadataSchema = z.object({
id: z.string(),
scope: z.enum([
"personal",
"workspace",
"capability",
"thread"
]),
workspaceId: z.string().optional(),
capabilityId: z.string().optional(),
threadId: z.string().optional(),
source: z.string(),
sourceExecutionId: z.string().optional(),
confidence: z.number().min(0).max(1),
sensitivity: z.enum([
"low",
"moderate",
"sensitive"
]).default("low"),
createdAt: z.string(),
updatedAt: z.string(),
expiresAt: z.string().optional()
});

12.2 Semantic memory

export const semanticMemorySchema = z.object({
metadata: memoryMetadataSchema,
subject: z.string(),
predicate: z.string(),
value: z.unknown(),
evidenceRefs: z.array(z.string()).default([]),
status: z.enum([
"active",
"superseded",
"expired",
"deleted"
]).default("active")
});

12.3 Episodic memory

export const episodicMemorySchema = z.object({
metadata: memoryMetadataSchema,
eventType: z.string(),
summary: z.string(),
outcome: z.string().optional(),
evidenceRefs: z.array(z.string()).default([]),
relatedEntities: z.array(z.string()).default([])
});

12.4 Procedural memory

Procedural memory should be represented by versioned skills, capability definitions, workflow definitions, and policies.

Do not write procedural memory through unreviewed free-text LLM output.

⸻

13. Memory Write Request

export const memoryWriteRequestSchema = z.object({
memoryType: z.enum([
"semantic",
"episodic"
]),
record: z.unknown(),
reason: z.string().min(1),
writeMode: z.enum([
"automatic",
"propose_for_approval"
]),
sourceExecutionId: z.string()
});

The memory policy service decides whether a write can proceed.

⸻

14. Approval Contracts

export const approvalStatusSchema = z.enum([
"pending",
"approved",
"rejected",
"expired",
"cancelled",
"executed"
]);
export const approvalRequestSchema = z.object({
id: z.string(),
executionId: z.string(),
capabilityId: z.string(),
toolId: z.string(),
actionSummary: z.string(),
payloadPreview: z.unknown(),
scope: z.object({
recipient: z.string().optional(),
resourceId: z.string().optional(),
actionType: z.string()
}),
status: approvalStatusSchema,
createdAt: z.string(),
expiresAt: z.string().optional(),
decidedAt: z.string().optional()
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

Approval decisions:

export const approvalDecisionSchema = z.object({
approvalId: z.string(),
decision: z.enum(["approved", "rejected"]),
note: z.string().optional()
});

⸻

15. Execution Trace Contracts

export const traceStatusSchema = z.enum([
"running",
"completed",
"awaiting_approval",
"failed",
"cancelled"
]);
export const traceStepStatusSchema = z.enum([
"started",
"completed",
"failed",
"skipped"
]);
export const executionTraceStepSchema = z.object({
id: z.string(),
executionId: z.string(),
kind: z.enum([
"skill",
"validation",
"tool",
"memory",
"approval",
"ui",
"llm",
"workflow"
]),
name: z.string(),
status: traceStepStatusSchema,
summary: z.string().optional(),
startedAt: z.string(),
completedAt: z.string().optional(),
errorCode: z.string().optional(),
errorMessage: z.string().optional()
});
export const executionTraceSchema = z.object({
id: z.string(),
capabilityId: z.string(),
status: traceStatusSchema,
workspaceId: z.string().optional(),
threadId: z.string().optional(),
startedAt: z.string(),
completedAt: z.string().optional(),
steps: z.array(executionTraceStepSchema)
});

Trace events should avoid exposing sensitive raw content by default.

Detailed tool input/output payloads may be stored separately and redacted.

⸻

16. UI Block Contracts

The platform uses constrained generative UI.

The agent/capability returns registered block types and schema-valid data.

This approach matches json-render, which constrains generated UI to a developer-defined catalog and schema-driven JSON output. (GitHub)

export const uiActionSchema = z.object({
id: z.string(),
label: z.string(),
type: z.enum([
"link",
"capability",
"tool",
"approval",
"navigate"
]),
payload: z.record(z.unknown()).optional()
});
export const uiBlockSchema = z.object({
id: z.string(),
type: z.string(),
version: z.string(),
data: z.unknown(),
actions: z.array(uiActionSchema).default([])
});
export type UiBlock = z.infer<typeof uiBlockSchema>;

Every UI block package must define:

export type UiBlockDefinition<TData> = {
type: string;
version: string;
schema: z.ZodType<TData>;
allowedActions: string[];
fallbackType?: string;
};

The backend validates a UI block against its registered definition before returning it to the web app.

⸻

17. UI Action Contract

UI actions never execute privileged work directly in the browser.

A UI action must call the API, which creates a new capability execution or approval decision.

export const uiActionRequestSchema = z.object({
blockId: z.string(),
actionId: z.string(),
executionId: z.string().optional(),
payload: z.record(z.unknown()).optional()
});

Examples:

Open article
Start a follow-up research capability
Draft email
Approve email send
Open trace
Review failed scrape

⸻

18. LLM Structured Output Contract

All LLM outputs used by the platform must be validated.

export type StructuredLlmRequest<TOutput> = {
purpose: string;
systemInstruction: string;
prompt: string;
outputSchema: z.ZodType<TOutput>;
maxRetries?: number;
temperature?: number;
};

Rules:

Never trust raw model output.
Parse and validate against schema.
Reject unknown fields where practical.
Retry only with bounded repair attempts.
Record validation failure in trace.
Do not allow model output to bypass tool or policy checks.

⸻

19. Error Contract

export const platformErrorSchema = z.object({
code: z.string(),
message: z.string(),
category: z.enum([
"validation",
"permission",
"approval",
"tool",
"llm",
"memory",
"storage",
"network",
"capability",
"unknown"
]),
retryable: z.boolean().default(false),
details: z.record(z.unknown()).optional()
});

Examples:

CAPABILITY_NOT_FOUND
TOOL_NOT_ALLOWED
PERMISSION_DENIED
APPROVAL_REQUIRED
APPROVAL_REJECTED
TOOL_INPUT_INVALID
TOOL_OUTPUT_INVALID
LLM_OUTPUT_INVALID
MEMORY_WRITE_DENIED
UI_BLOCK_NOT_REGISTERED
UI_BLOCK_INVALID

⸻

20. Capability Package Export Contract

A capability package should export:

export const manifest: CapabilityManifest;
export const inputSchema: z.ZodType<unknown>;
export const outputSchema: z.ZodType<unknown>;
export const workflow: WorkflowStepDefinition[];
export async function execute(
input: unknown,
context: CapabilityExecutionContext
): Promise<unknown>;

Execution context:

export type CapabilityExecutionContext = {
executionId: ExecutionId;
capability: CapabilityManifest;
tools: {
execute: <TInput, TOutput>(
toolId: ToolId,
input: TInput
) => Promise<TOutput>;
};
memory: {
getMasterProfile: (input: unknown) => Promise<unknown>;
search: (input: unknown) => Promise<unknown>;
write: (input: MemoryWriteRequest) => Promise<unknown>;
};
llm: {
generateStructured: <TOutput>(
request: StructuredLlmRequest<TOutput>
) => Promise<TOutput>;
};
ui: {
build: (blocks: UiBlock[]) => Promise<UiBlock[]>;
};
approvals: {
request: (input: Omit<ApprovalRequest, "id" | "status">) => Promise<ApprovalRequest>;
};
trace: {
addStep: (step: Omit<
z.infer<typeof executionTraceStepSchema>,
"id" | "executionId" >) => Promise<void>;
};
};

⸻

21. Versioning Rules

Use semantic versioning for:

Capabilities
Tools
Skills
UI blocks
Shared contracts

Breaking changes require:

Major version increment
Migration note
Compatibility analysis
Test updates
Documentation update

Do not silently change:

Tool input schema
Capability output schema
Approval behavior
Memory write behavior
UI block data schema
Permission requirements

⸻

22. Contract Acceptance Criteria

This contract layer is complete when:

1. @pap/contracts exports schemas and inferred types.
2. Capabilities can declare manifests and validate input/output.
3. Tools can declare manifests and validate input/output.
4. Runtime can deny undeclared tool calls.
5. Runtime can deny missing permissions.
6. Runtime can pause for approval.
7. Runtime can create and finalize traces.
8. Memory write requests include source and confidence.
9. UI blocks are validated against registered schemas.
10. LLM structured outputs are schema validated.
11. API and web app can use shared contracts without duplicate definitions.
12. A sample research capability can execute through these contracts end-to-end.

⸻

23. Deferred Decisions

Do not settle these in this document:

Public capability registry protocol
Third-party executable plugin sandboxing
Remote package signing
Capability marketplace
Cross-instance federation
Multi-user identity models
Billing
Distributed tracing vendor
Production observability vendor
