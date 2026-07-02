Personal Agent Platform — Platform Architecture

Status: Foundational Architecture
Depends on: 01-product-foundation.md, 02-product-principles.md
Purpose: Define the high-level architecture, monorepo structure, core platform boundaries, runtime flow, and ownership rules for the Personal Agent Platform.

⸻

1. Architecture Goal

Personal Agent Platform must support a growing set of personal-agent capabilities without turning into:

- A large monolithic chatbot backend.
- A collection of disconnected scripts.
- A generic workflow builder.
- A system where each new capability reimplements memory, permissions, UI rendering, traces, and tool calling.

The architecture must allow new capabilities to plug into shared platform services:

Capabilities
→ skills
→ tools
→ memory
→ approvals
→ traces
→ structured outputs
→ generative UI blocks

The system should remain personal-first, self-hostable, local-first, and modular.

⸻

2. Core Architectural Principles

The architecture must preserve these rules:

Deterministic code handles deterministic work.
Capabilities own workflows.
Tools perform narrow actions.
Skills explain how to use capabilities and tools.
Memory is explicit and inspectable.
UI is generated through validated block schemas.
External side effects pass through approval policy.
Every run produces a trace.

The runtime is not responsible for solving every task itself.

The runtime should instead:

Resolve a capability
Load its skill
Validate its request
Enforce permissions
Execute its workflow
Record trace events
Validate outputs
Return structured UI-ready results

⸻

3. High-Level System Model

User
↓
Web App / CLI / Scheduled Worker
↓
API Gateway
↓
Agent Runtime
├── Capability Registry
├── Skill Loader
├── Tool Registry
├── Policy + Approval Engine
├── Memory Service
├── Execution Trace Service
├── LLM Provider Layer
└── UI Intent Validator
↓
Capability Workflow
↓
Tools / Sub-capabilities / Storage / External APIs
↓
Structured Result + UI Blocks + Trace
↓
React + TanStack Start UI

⸻

4. Monorepo Structure

Use:

pnpm workspaces
Turborepo
TypeScript
React + TanStack Start

Repository structure:

personal-agent-platform/
├── apps/
│ ├── api/
│ ├── web/
│ └── worker/
│
├── packages/
│ ├── contracts/
│ ├── runtime/
│ ├── shared/
│ ├── storage/
│ ├── memory/
│ ├── llm/
│ ├── tools/
│ ├── capabilities/
│ ├── ui/
│ └── testing/
│
├── skills/
│ ├── shared/
│ └── capabilities/
│
├── docs/
│ ├── architecture/
│ ├── capabilities/
│ ├── decisions/
│ ├── product/
│ └── runbooks/
│
├── examples/
│ ├── capabilities/
│ ├── skills/
│ ├── ui-blocks/
│ └── tools/
│
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── tsconfig.base.json

⸻

5. Application Boundaries

5.1 apps/web

The primary user interface.

Responsibilities:

Chat and command interface
Workspace/dashboard
Capability result rendering
Generated UI block rendering
Approval dialogs
Trace viewer
Memory explorer
Report views
Capability management
Source/error review

Technology direction:

React
TanStack Start
TypeScript
json-render integration

The web app should never directly call privileged tools.

All privileged work must flow through the API/runtime.

⸻

5.2 apps/api

The runtime-facing API.

Responsibilities:

Receive user requests
Authenticate user later
Resolve capability
Create execution trace
Invoke runtime
Enforce permissions
Handle approval requests
Stream execution updates
Return structured capability output
Expose memory, trace, and capability APIs

The API should remain thin.

It should not contain business logic unique to a capability.

Capability-specific workflow logic belongs in capability packages.

⸻

5.3 apps/worker

The background execution process.

Responsibilities:

Scheduled research
Long-running capability runs
Monitoring
Document indexing
Vector indexing
Report generation
Retryable non-destructive tasks
Watchlist checks

The worker must invoke capabilities through the same runtime contracts used by the API.

No duplicated workflow logic.

⸻

6. Shared Package Map

6.1 @pap/contracts

The stable shared language of the platform.

Contains:

Capability manifests
Tool manifests
Skill manifests
Permission types
Approval contracts
Memory contracts
UI block contracts
Execution trace contracts
Error contracts
API schemas

Every package must depend on contracts rather than redefining core types.

⸻

6.2 @pap/runtime

The orchestration engine.

Responsibilities:

Capability resolution
Capability registration
Tool registration
Skill loading
Permission checks
Workflow execution
Sub-capability composition
Approval gating
Trace event creation
Output validation
UI block validation

The runtime must not embed product-specific workflows.

It provides infrastructure for capabilities to run safely.

⸻

6.3 @pap/shared

Cross-cutting utilities.

Contains:

Configuration
Logging
Error helpers
Date/time helpers
Result types
ID generation
Safe JSON parsing
Schema helpers
Environment validation

⸻

6.4 @pap/storage

Storage adapters and repositories.

Initial adapters:

SQLite
Local file storage
Migration support
Repository interfaces

Future adapters:

Postgres
Cloud object storage
Remote database
Encrypted local stores

Capabilities should depend on repository interfaces where possible, not direct database implementation details.

⸻

6.5 @pap/memory

Memory services and policies.

Contains:

Semantic memory service
Episodic memory service
Procedural memory loader
Vector retrieval adapter
Memory write policy
Memory explorer queries
Memory provenance utilities

The memory package must preserve the separation between:

Semantic memory
Episodic memory
Procedural memory

⸻

6.6 @pap/ai

AI provider abstraction.

Initial provider:

Ollama

Future providers:

OpenAI
Anthropic
Google
Groq
Other local inference endpoints

Responsibilities:

Structured output generation
Provider configuration
Model policy
Prompt execution
JSON repair fallback
Token/context limits
Usage telemetry

Capabilities must not call Ollama directly.

They should use the AI provider abstraction.

⸻

6.7 @pap/tools/\*

Narrow deterministic tool packages.

Initial packages:

@pap/tool-profile
@pap/tool-memory
@pap/tool-searxng
@pap/tool-scraper

Future packages:

@pap/tool-email
@pap/tool-documents
@pap/tool-calendar
@pap/tool-currency
@pap/tool-market-data
@pap/tool-files

Each tool package must expose:

Manifest
Input schema
Output schema
Permission requirement
Side-effect classification
Execution function
Error behavior
Tests
Documentation

⸻

6.8 @pap/capabilities/\*

Capability packages own domain workflows.

Initial package:

@pap/capability-research

Future packages:

@pap/capability-email
@pap/capability-document-analysis
@pap/capability-company-research
@pap/capability-job-research
@pap/capability-watchlist-monitoring

Each capability package must include:

Capability manifest
Workflow definition
Input/output schemas
Skill reference
Allowed tools
Allowed sub-capabilities
Approval policy
Memory policy
Supported UI blocks
Validators
Examples
Tests

⸻

6.9 @pap/ui/\*

UI contracts and renderers.

Initial packages:

@pap/ui-contracts
@pap/ui-renderer-react
@pap/ui-blocks-core

Future packages:

@pap/ui-block-article-list
@pap/ui-block-job-card
@pap/ui-block-email-thread
@pap/ui-block-document-summary
@pap/ui-block-approval-dialog
@pap/ui-block-chart

The UI system must use registered, validated components only.

No arbitrary HTML or JSX from model output.

⸻

7. Capability Runtime Flow

Every capability run follows the same top-level lifecycle.

1. Receive request
2. Resolve capability
3. Validate request input
4. Load capability manifest
5. Load skill instructions
6. Check permissions
7. Initialize trace
8. Load only required memory/profile context
9. Execute capability workflow
10. Validate output
11. Apply memory-write policy
12. Validate UI blocks
13. Return result
14. Finalize trace

Not every capability uses every service, but every run must follow this contract.

⸻

8. Capability Workflow Contract

Capabilities own their internal workflow.

Example shape:

type CapabilityWorkflow = {
validateInput: WorkflowStep;
resolveContext?: WorkflowStep;
plan?: WorkflowStep;
execute: WorkflowStep[];
synthesize?: WorkflowStep;
validateOutput: WorkflowStep;
persist?: WorkflowStep;
buildUi?: WorkflowStep;
};

A capability can use tools and sub-capabilities, but it must remain bounded.

Example:

Research Capability

1. Validate request
2. Load relevant profile preferences
3. Create bounded research plan
4. Search SearXNG
5. Rank candidates
6. Scrape selected pages
7. Analyze selected news
8. Rank report
9. Save episodes/insights
10. Build UI blocks

⸻

9. Skill Loading Model

Skills should be portable folders using the Agent Skills pattern.

Example:

skills/
research/
SKILL.md
references/
ranking-rules.md
analysis-rules.md
examples/
business-brief.json
technology-brief.json

Skills load progressively:

Manifest metadata
→ SKILL.md
→ targeted reference files
→ examples only when needed

The runtime must record:

Skill ID
Skill version
Files loaded
Capability run ID

This supports traceability and reproducibility.

⸻

10. Tool Runtime Model

Tools are deterministic actions.

A tool call is valid only when:

The capability declares the tool.
The capability has the required permission.
The task is within scope.
Required approval exists.
Input matches schema.
Tool side-effect policy allows execution.

Tool execution flow:

Capability requests tool
→ Runtime validates manifest access
→ Runtime validates permission
→ Runtime checks approval
→ Tool executes
→ Output validated
→ Trace event written
→ Result returned to capability

⸻

11. Approval Architecture

Approval is a shared runtime concern.

Capabilities declare intent.

The approval engine decides whether a tool call can proceed.

Capability requests sendEmail
→ Tool manifest marks external_publish
→ Approval engine checks policy
→ If approval required:
create ApprovalRequest
pause capability
→ UI renders approval dialog
→ User approves/rejects
→ Runtime resumes or terminates run

Approval state must be durable.

Required states:

pending
approved
rejected
expired
cancelled
executed

⸻

12. Memory Architecture

Memory is accessed through services, not directly through database tables.

12.1 Semantic Memory

Structured facts.

Examples:

User preferences
Profile facts
Project facts
Workspace facts
Capability configuration
Entity facts

12.2 Episodic Memory

Events and outcomes.

Examples:

Research run
Email draft created
Approval requested
Document analyzed
Source scrape failed
Task completed

12.3 Procedural Memory

Versioned instructions.

Examples:

Skills
Capability workflows
Tool usage rules
Validation rules
Examples

12.4 Retrieval Rule

The model must retrieve memory through tools:

getMasterProfile(...)
searchVectorDb(...)
getWorkspaceContext(...)
getCapabilityHistory(...)

The platform must not dump all personal memory into prompts.

⸻

13. Generative UI Architecture

The platform uses constrained generative UI.

Flow:

Capability produces structured result
→ Capability selects supported UI block types
→ Backend validates data against UI block schema
→ UI renderer resolves registered React component
→ User sees validated UI

The UI block catalog should begin small:

summary_card
article_list
article_card
error_list
approval_dialog
trace_panel

Future blocks:

job_card
email_list
email_thread
draft_editor
document_summary
comparison_table
metric_chart
timeline
gallery

json-render should be used as the initial framework/reference for this layer because it supports model-selected UI constrained to predefined components and actions. (GitHub)

⸻

14. Execution Traces

Every capability run creates a trace.

A trace records:

Run ID
Request summary
Capability ID/version
Skill ID/version
Input validation
Tools used
Permissions checked
Memory reads
Memory writes
Approval events
Errors
Output validation
UI blocks produced
Final status

Trace statuses:

running
completed
awaiting_approval
failed
cancelled

Traces must be queryable by:

Run
Capability
Workspace
Thread
Date range
Status
Tool
Error type

⸻

15. Initial Deployment Model

The platform must support:

Local Mac development
Local Ollama
SQLite
Local files
Docker-based self-hosted server
Linux deployment

The platform should support future replacement of:

SQLite → Postgres
Local vector retrieval → cloud vector DB
Local Ollama → external LLM provider
Local files → object storage

Adapters should isolate these changes.

⸻

16. Package Dependency Rules

To preserve modularity:

apps may depend on packages.
capabilities may depend on contracts, runtime interfaces, tools, memory, llm, shared, and ui contracts.
tools may depend on contracts, shared, and storage interfaces.
ui blocks may depend on ui contracts and shared.
contracts must not depend on capabilities, apps, or concrete storage.
runtime must not depend on a specific capability.

Forbidden dependency direction:

contracts → apps
contracts → capability implementation
tools → web app
ui blocks → capability internals
runtime → concrete tool implementation

⸻

17. Initial V1 Package Set

Build only these first:

@pap/contracts
@pap/shared
@pap/runtime
@pap/storage-sqlite
@pap/memory
@pap/ai
@pap/ai-ollama
@pap/tool-profile
@pap/tool-memory
@pap/tool-searxng
@pap/tool-scraper
@pap/capability-research
@pap/ui-contracts
@pap/ui-renderer-react
@pap/ui-blocks-core
apps/api
apps/web
apps/worker

Do not build email, document analysis, market data, public plugin installation, or multi-user tenancy in the first architecture milestone.

⸻

18. Architecture Acceptance Criteria

The architecture is considered established when:

1. The monorepo installs and builds through pnpm workspaces and Turborepo.
2. The API can register a capability through the runtime.
3. The runtime can load a skill from a portable skill folder.
4. A capability can call an approved typed tool.
5. A tool call is rejected when undeclared or unauthorized.
6. A capability run produces an execution trace.
7. The capability returns validated structured output.
8. The web app renders validated UI blocks.
9. The UI can display trace data.
10. SQLite persists runs, traces, approvals, and initial memory records.
11. The worker can invoke the same capability through the same runtime.
12. The research capability can run end-to-end without embedding business logic in the API or web app.

⸻

19. Architecture Decisions Deferred

Do not decide these yet:

Public package marketplace
Third-party executable plugins
Multi-user tenancy
Organization/team memory
Full plugin sandboxing
Remote capability registry
Distributed task queues
Cloud-first deployment
Fine-grained billing
Public authentication model

These decisions should be made only after the personal single-user runtime proves reliable.

⸻

20. Next Documents

The next documents should define the contracts that make this architecture real:

04-runtime-and-contracts.md
05-capability-system.md
06-tool-system.md
07-memory-model.md
08-policy-and-approval-model.md
09-generative-ui-model.md
