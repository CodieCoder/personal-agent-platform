Personal Agent Platform — Architecture Decision Records

Status: Accepted
Depends on: 01-product-foundation.md through 14-roadmap.md
Purpose: Lock the technical decisions needed to bootstrap the Personal Agent Platform without prematurely overengineering it.

⸻

1. Decision Record Format

Each ADR records:

Context
Decision
Rationale
Consequences
Rejected Alternatives
Revisit Trigger

A decision should be revisited only when its stated trigger occurs.

⸻

ADR-001 — Runtime and Package Manager

Status: Accepted

Context

The platform must support:

React + TanStack Start
Node-based self-hosting
SQLite native bindings
Docker
Linux deployment
CLI and worker execution

The initial architecture needs predictable compatibility more than raw runtime speed.

Decision

Use:

Node.js LTS
pnpm
Turborepo

Node.js LTS is the supported production baseline.

Rationale

Strong ecosystem compatibility
Reliable Docker and Linux support
Straightforward support for native SQLite bindings
Good compatibility with TanStack Start
Good compatibility with Playwright and QA tooling
Mature package and debugging ecosystem

Consequences

All apps and packages target Node.js LTS.
CI must test against the selected Node LTS version.
Bun is not required for V1.
Runtime-specific APIs must not be used unless isolated behind adapters.

Rejected Alternatives

Bun + pnpm:
Deferred. May be evaluated later for tooling speed or specific workloads.
Mixed runtime support:
Rejected for V1 because it increases debugging and deployment complexity.

Revisit Trigger

Revisit when:

Bun provides clear measurable benefits for this repository
A required dependency has better Bun support than Node
Deployment/runtime performance becomes a verified bottleneck

⸻

ADR-002 — Monorepo Tooling

Status: Accepted

Context

The platform contains:

Web app
API/runtime layer
Worker
Shared contracts
Capabilities
Tools
Memory services
UI packages
Testing packages

These must evolve together while remaining modular.

Decision

Use:

pnpm workspaces
Turborepo
TypeScript project references where useful

Rationale

Shared package dependency management
Single lockfile
Fast local linking
Task orchestration
Build caching
Clear package boundaries
Simple extraction path for future reusable packages

Consequences

All reusable logic lives in workspace packages.
No copied contracts between apps.
No independent package publishing in V1.
Root scripts orchestrate lint, test, typecheck, build, and QA validation.

Revisit Trigger

Revisit when:

Packages need independent public releases
Repository build time becomes unacceptable
A capability ecosystem requires external publishing workflow

⸻

ADR-003 — Database and SQLite Driver

Status: Accepted

Context

V1 is single-user, local-first, and self-hostable.

It needs durable storage for:

Workspaces
Memory
Research runs
Findings
Source profiles
Traces
Approvals
Capability registry
Configuration

Decision

Use:

SQLite
better-sqlite3

for initial local and self-hosted persistence.

Rationale

Simple local deployment
No external database dependency
Excellent fit for one-user workloads
Straightforward backup and portability
Works well in Docker with persistent volumes
Suitable for structured records and SQLite FTS

Consequences

Database access remains server-side only.
The database file is mounted as a Docker volume in self-hosted deployments.
Long-running writes should remain bounded.
Storage access is wrapped behind repository interfaces.

Rejected Alternatives

node:sqlite:
Deferred. It may be reconsidered after its ecosystem maturity and deployment ergonomics are proven for this stack.
libSQL/Turso:
Deferred because V1 does not need cloud synchronization or remote replicas.
Postgres:
Deferred because V1 does not need multi-user concurrency or cloud-first operation.

Revisit Trigger

Revisit when:

Concurrent worker activity causes SQLite contention
Multiple users or tenants are introduced
Remote/cloud deployment becomes primary
Large-scale vector search becomes required

⸻

ADR-004 — ORM and Migrations

Status: Accepted

Context

The platform needs:

Type-safe queries
Schema ownership in TypeScript
Generated SQL migrations
SQLite compatibility
Future Postgres path

Decision

Use:

Drizzle ORM
drizzle-kit
Generated SQL migrations committed to Git

Rationale

Strong TypeScript integration
SQLite and Postgres support
Generated migration files are inspectable
Schema changes are reviewable
Avoids hidden runtime schema mutation

Consequences

Schema definitions live in @pap/storage.
Migration SQL is committed to source control.
Production/self-hosted startup applies migrations explicitly.
No drizzle push in production environments.

Rejected Alternatives

Kysely + handwritten SQL:
Good option, but slower to establish for this project.
Prisma:
Rejected for V1 due to extra runtime/tooling weight and less direct migration preference.

Revisit Trigger

Revisit when:

Drizzle limits a required query or migration workflow
Postgres migration requirements become significantly more complex

⸻

ADR-005 — API and Runtime Boundary

Status: Accepted

Context

The web app, CLI, and worker must all execute the same capabilities through the same policy, trace, memory, and tool contracts.

The platform should not duplicate business logic between routes, CLI commands, and workers.

Decision

Use:

TanStack Start server functions and server routes for web-facing work
A shared runtime package for all capability execution
A thin API boundary only where CLI, worker, or external access needs it

Do not build a large standalone REST API in V1.

Rationale

Fastest route to a working full-stack app
Keeps web integration simple
Avoids premature REST surface design
Allows CLI and worker to call runtime directly
Preserves option to add Hono/Fastify later

Consequences

apps/web owns user-facing route handlers and server functions.
@pap/runtime owns capability execution.
apps/worker calls @pap/runtime directly.
CLI calls @pap/runtime directly.
apps/api remains optional/minimal in early phases.

Rejected Alternatives

Separate Hono/Fastify API from day one:
Rejected because it adds network, authentication, serialization, and deployment complexity before needed.
Server functions only forever:
Rejected because worker, CLI, integrations, and future external consumers may need an explicit API boundary.

Revisit Trigger

Revisit when:

CLI must run remotely from web runtime
External integrations require stable HTTP API
Worker and web process need separate deployment
Multiple clients need API access

⸻

ADR-006 — Background Jobs and Scheduling

Status: Accepted

Context

V1 needs manual and recurring research runs but does not yet need high-volume queues, distributed workers, or multi-user scheduling.

Decision

Use:

Manual trigger
Simple cron/process scheduler
Worker process
SQLite-backed run records

Do not introduce Redis or BullMQ in V1.

Rationale

Lowest operational complexity
Enough for personal morning briefs
Avoids Redis dependency
Matches one-user workload
Allows worker/runtime pattern to be proven first

Consequences

Scheduled jobs must be idempotent.
Each scheduled run receives a stable idempotency key.
Failures are persisted in execution traces.
Retries remain bounded.
No parallel unbounded job fan-out.

Rejected Alternatives

BullMQ + Redis:
Deferred until durable retries, concurrent workloads, or email sync justify it.
In-process timers inside web app:
Rejected because web process restarts should not silently lose scheduled work.

Revisit Trigger

Revisit when:

Recurring jobs need durable retry queues
Email synchronization is introduced
More than one worker is required
Jobs need prioritization or delayed execution

⸻

ADR-007 — Logging and Observability

Status: Accepted

Context

The platform handles private documents, email, profile context, tool calls, and traces.

Logging must aid debugging without leaking private content.

Decision

Use:

Pino structured logging
Trace records in SQLite
Redaction configuration by default

Required Redaction Targets

API keys
OAuth tokens
Authorization headers
Cookie values
Email body content
Document raw text
Sensitive memory values
Full tool payloads unless explicitly enabled

Rationale

Structured logs are easier to filter and inspect.
Pino is lightweight and suitable for Node services.
Persistent execution traces provide user-facing observability.
Logs remain operational diagnostics, not a second memory store.

Consequences

Every runtime execution includes executionId and capabilityId.
Every tool call includes toolId and executionId.
Logs and traces must use safe summaries.
Raw payload retention must be opt-in and sensitivity-aware.

Revisit Trigger

Revisit when:

Centralized logging is required
Self-hosted instances need external observability export
Trace volume becomes too large for SQLite

⸻

ADR-008 — Testing and Validation

Status: Accepted

Context

The platform needs reliable behavior across:

Contracts
Capabilities
Tools
Runtime policy
Web UI
Streaming
Self-hosted deployment

Decision

Use:

Vitest for unit and integration tests
Playwright for browser end-to-end tests
JSON fixtures and test helpers for contract tests
QA-Intel for full-stack behavior validation

Rationale

Vitest fits the TypeScript/Vite ecosystem.
Playwright validates real browser behavior.
Fixtures make capability/tool outputs reproducible.
QA-Intel validates product behavior through Gherkin-driven scenarios and browser evidence.

Consequences

Every capability gets contract fixtures.
Every tool gets unit/integration coverage.
Critical user flows get Playwright coverage.
Platform behavior scenarios are written as Gherkin for QA-Intel.
QA-Intel becomes a verification layer, not a replacement for unit tests.

Required Validation Layers

Layer 1: Typecheck and lint
Layer 2: Unit tests
Layer 3: Integration tests
Layer 4: Contract fixture tests
Layer 5: Playwright end-to-end tests
Layer 6: QA-Intel behavior scenarios

Initial QA-Intel Scenarios

User can run a research request.
User sees streaming progress.
Partial source failures still show a useful report.
Undeclared tool calls are blocked.
Invalid UI blocks are rejected safely.
Research episode is visible in Memory Explorer.
Trace shows the expected workflow steps.

Revisit Trigger

Revisit when:

QA-Intel needs custom adapters for this runtime
Browser tests become too slow for pull requests
Separate smoke and full regression pipelines are required

⸻

ADR-009 — Docker and Self-Hosting Topology

Status: Accepted

Context

The product must support:

Mac local development
Linux self-hosting
Optional local Ollama
Optional local SearXNG
Persistent SQLite storage

Decision

Support both modes:

Local development:
Platform runs locally.
Ollama and SearXNG may run externally.
Self-hosting:
Docker Compose runs platform services.
Ollama and SearXNG may be included or configured as external services.

Initial Compose Services

web
worker
optional searxng
persistent data volume

Ollama should be configurable as:

External host URL
Optional local container
Separate host machine/service

Rationale

Keeps Mac development lightweight
Avoids forcing duplicate local models
Allows one-command self-hosting later
Keeps service boundaries explicit

Consequences

All service endpoints use environment variables.
No service assumes localhost in production.
SQLite data path must be configurable.
Compose volumes must persist data and reports.
Health checks are required for web, worker, and optional dependencies.

Revisit Trigger

Revisit when:

GPU-enabled Ollama container setup becomes required
Multiple worker services are needed
Postgres replaces SQLite
Reverse proxy is bundled with standard deployment

⸻

ADR-010 — Search and Retrieval Strategy

Status: Accepted

Context

The platform needs personal/project retrieval, but V1 should avoid premature vector infrastructure.

Decision

Use:

Structured memory records
SQLite FTS
Scoped metadata filtering
A VectorStore interface with no default implementation in V1

Do not use a vector database in the first vertical slice.

Rationale

Research V1 works with structured context and FTS.
Vector infrastructure adds operational and evaluation complexity.
The right embedding model and retrieval quality are not yet proven.
SQLite is sufficient for personal metadata and text search initially.

Consequences

Memory APIs must not expose SQLite-specific assumptions.
Search interfaces must support structured and semantic retrieval later.
Vector retrieval remains optional.
No embedding generation job is required for Phase 0–5.

Future Direction

When semantic retrieval proves necessary, evaluate:

Supabase Postgres with pgvector
Python/FastAPI embedding service
Local embedding model
Cloud embedding provider where explicitly enabled

The embedding service must remain behind a provider interface and obey local-first privacy configuration.

Revisit Trigger

Revisit when:

SQLite FTS retrieval is insufficient for project/document history
Document chunk retrieval requires semantic search
Cross-workspace semantic recall becomes a real user need

⸻

ADR-011 — Authentication and Network Exposure

Status: Accepted

Context

V1 is a personal single-user system.

Local development should remain frictionless, but self-hosted public exposure must not be unsafe.

Decision

Use:

Local mode:
No application login required.
Bind only to localhost by default.
Self-hosted mode:
Use reverse-proxy authentication or private-network access.
Do not expose the application directly to the public internet by default.

Required Environment Controls

PAP_BIND_HOST
PAP_ENVIRONMENT
PAP_ALLOW_REMOTE_ACCESS
PAP_TRUSTED_PROXY
PAP_AUTH_MODE

Rationale

Avoids unnecessary auth work for local use.
Protects self-hosted deployment from accidental public exposure.
Allows future application-level auth without changing capability runtime.

Consequences

Remote binding must require explicit configuration.
Startup must warn when bound publicly without configured protection.
Sensitive tools remain unavailable if secure deployment requirements are not met.

Revisit Trigger

Revisit when:

Remote access is required without reverse proxy
Mobile clients are introduced
Multiple users are introduced
Public SaaS direction begins

⸻

ADR-012 — Capability Installation Scope

Status: Accepted

Context

The long-term product supports reusable, community-contributed capabilities.

V1 must prove internal capabilities before introducing supply-chain and permission complexity.

Decision

V1 supports:

Core capabilities only
Internal workspace packages
Skill folders in the repository

Local-folder and trusted-Git installation are deferred until after the first stable research capability.

Rationale

Capability installation adds trust, hashing, upgrade, compatibility, and permission-review work.
The first goal is proving the capability/runtime pattern.

Consequences

Capability registry must still store source and trust metadata.
Runtime contracts must already support trust levels.
No public capability installer UI in V1.

Revisit Trigger

Revisit when:

Research capability is stable
At least one second capability reuses the runtime successfully
The permission-review UI exists
Manifest validation is complete

⸻

2. Locked Initial Stack

Runtime:
Node.js LTS
Monorepo:
pnpm workspaces
Turborepo
TypeScript
Web:
React
TanStack Start
Storage:
SQLite
better-sqlite3
Drizzle ORM
drizzle-kit migrations
LLM:
Ollama
Structured output schemas
Logging:
Pino
SQLite execution traces
Testing:
Vitest
Playwright
Fixture-driven contract tests
QA-Intel behavioral validation
Scheduling:
Worker process
Manual trigger + cron/process scheduler
Search:
SearXNG
Retrieval:
Structured memory
SQLite FTS
Future VectorStore adapter
Deployment:
Local development with external Ollama/SearXNG
Docker Compose for self-hosting
Auth:
No local auth
Reverse-proxy/private-network protection for self-hosting

⸻

3. Immediate Implementation Consequences

The repository bootstrap plan must now create:

apps/web
apps/worker
packages/contracts
packages/shared
packages/runtime
packages/storage
packages/storage-sqlite
packages/testing
skills/shared
skills/capabilities
docker/
docs/

The first code milestone is:

Echo capability
→ runtime execution
→ SQLite trace persistence
→ simple TanStack Start page
→ visible completed trace
→ Vitest coverage
→ Playwright smoke test
→ QA-Intel Gherkin scenario

⸻

4. ADR Review Rule

Do not revisit accepted ADRs during implementation unless a documented revisit trigger occurs.

Any proposed change must state:

Which ADR changes
Why current decision is insufficient
What evidence supports the change
Migration impact
Testing impact
Deployment impact
Rollback plan

ADR-005 — Backend Runtime and API Boundary

Status: Accepted
Supersedes: Previous ADR-005 API and Runtime Boundary
Depends on: 01-product-foundation.md through 14-roadmap.md

⸻

Context

Personal Agent Platform needs a backend architecture that supports:

Capability execution
Tool orchestration
Permission and approval enforcement
Execution traces
Memory services
SQLite repositories
Background worker execution
CLI commands
Streaming UI updates
Future Python-based ML and document-processing workloads

The platform is built around React + TanStack Start, TypeScript contracts, Drizzle/SQLite, and reusable capability packages.

The backend must remain modular without creating unnecessary service boundaries in V1.

⸻

Decision

Use a TypeScript/Node.js core backend.

Use:

React + TanStack Start
TypeScript
Shared runtime packages
Node.js worker process
Drizzle + SQLite

for the core platform backend.

Do not use NestJS for V1.

Do not use FastAPI as the primary platform backend.

Use Python/FastAPI only for specialized sidecar services when Python-specific workloads justify it.

⸻

Core Backend Ownership

The TypeScript/Node backend owns:

Capability runtime
Capability registry
Skill loading
Tool registry
Tool authorization
Permission checks
Approval engine
Execution traces
Memory services
Drizzle repositories
SQLite access
Research orchestration
Worker scheduling
SearXNG integration
Ollama integration
Streaming execution events
UI block validation
CLI execution

This keeps the runtime, web app, shared schemas, UI contracts, tools, and capabilities in one language.

⸻

Application Structure

apps/
web/
React + TanStack Start
Server functions
Server routes
Streaming UI events
User-facing screens
worker/
Node.js + TypeScript
Cron/manual scheduled runs
Calls shared runtime directly
api/
Optional thin TypeScript API boundary
Added only when external HTTP consumers require it
packages/
runtime/
Capability execution and policy enforcement
contracts/
Shared Zod schemas and inferred TypeScript types
storage/
Drizzle repositories and migrations
capabilities/
Research, email, document analysis, future capabilities
tools/
Typed deterministic tool packages
memory/
Semantic, episodic, procedural memory services
services/
embeddings-api/
Future Python + FastAPI sidecar
document-ml-api/
Future Python + FastAPI sidecar

⸻

TanStack Start Role

TanStack Start is the initial full-stack application layer.

It provides:

Server functions
Server routes
SSR
Streaming
Node-server deployment support

Use TanStack Start server functions and server routes for the web-facing backend needs in V1.

The runtime itself must remain framework-neutral and live in @pap/runtime.

The web app, worker, CLI, and future API service must all call the same runtime contracts.

⸻

API Boundary Rule

V1 does not require a large standalone REST API.

The initial model is:

Web UI
→ TanStack Start server function/server route
→ @pap/runtime
→ capabilities/tools/storage/memory

The worker and CLI call @pap/runtime directly:

Worker
→ @pap/runtime
CLI
→ @pap/runtime

A dedicated API service may be added later when there is a verified need for:

Remote CLI execution
External integrations
Mobile clients
Public/local API consumers
Separate web and worker deployments
Stable HTTP API contracts
Webhook receivers

When that point arrives, prefer a thin TypeScript API built with:

Fastify or Hono

before considering NestJS.

⸻

NestJS Decision

NestJS is not part of V1.

NestJS may be evaluated later if the platform reaches a point where it needs:

Large independently deployed API surface
Complex module boundaries
Many external integrations
Formal dependency-injection architecture
Multiple long-lived services
Large team conventions around Nest modules

Until then, NestJS would duplicate concerns already covered by:

TanStack Start server layer
Shared runtime package
Drizzle repositories
Worker process
Zod contracts

⸻

FastAPI Decision

FastAPI is not the core backend framework.

FastAPI is reserved for specialized Python services, such as:

Embedding generation
Local reranking models
OCR workflows
Document ML pipelines
Computer vision
Video inference
Python-only NLP libraries
Data-science utilities

Example future flow:

capability.document-analysis
→ tool.embedding.generate
→ FastAPI embedding service
→ validated response
→ runtime trace event
→ vector store adapter

FastAPI services must not own:

Capability routing
Permission policy
Approval policy
Memory policy
Execution trace authority
UI contracts
Primary application authentication

Those remain owned by the TypeScript runtime.

⸻

Why This Split

TypeScript core:
One language across UI, runtime, contracts, tools, and storage.
Less context switching.
Shared Zod schemas from backend to frontend.
Simpler initial deployment.
Closer fit with existing project strengths.
FastAPI sidecars:
Best used where Python libraries or ML workloads provide a real advantage.
Keeps Python complexity isolated.
Allows independent scaling or GPU deployment later.

⸻

Consequences

All core capabilities are TypeScript packages.
All core tools are TypeScript packages.
All platform contracts use Zod and TypeScript.
The worker is Node/TypeScript.
The initial web backend is TanStack Start server functions/routes.
No NestJS module structure is introduced in V1.
Python services communicate through typed HTTP adapters.
Python services must return validated structured output.
Python sidecar calls must be traced by the TypeScript runtime.

⸻

Rejected Alternatives

NestJS as Primary Backend

Rejected for V1 because it introduces another application framework and module layer before the runtime boundaries are proven.

FastAPI as Primary Backend

Rejected because it would split the core platform between:

React/TypeScript frontend
TypeScript contracts
Python backend
Separate validation models
Separate tooling and package ecosystems

This would slow down the first vertical slice without solving a current problem.

Server Functions Only Forever

Rejected because future external clients, integrations, webhooks, remote CLI use, or independently deployed workers may require a stable API boundary.

⸻

Revisit Triggers

Revisit this ADR when one or more of the following becomes true:

A public or remote API is required.
Worker and web deployments must scale independently.
A mobile or desktop client needs backend access.
Multiple external integrations require HTTP/webhook endpoints.
Fastify/Hono API routes become large enough to justify NestJS.
Embedding, OCR, vision, or ML workloads need Python dependencies or GPU deployment.

⸻

Locked Backend Summary

Core backend:
TypeScript + Node.js
Web backend:
TanStack Start server functions and server routes
Runtime:
Framework-neutral TypeScript packages
Worker:
Node.js + TypeScript
Dedicated API later:
Fastify or Hono
NestJS:
Not V1; evaluate only after verified service complexity
Python/FastAPI:
Specialized sidecar services only
