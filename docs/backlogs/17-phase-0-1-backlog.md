Personal Agent Platform — Phase 0–1 Implementation Backlog

Status: Execution Backlog
Depends on:

- 15-architecture-decision-records.md
- 16-repository-bootstrap-plan.md
- 01-product-foundation.md
- 03-platform-architecture.md
- 04-runtime-and-contracts.md

Purpose: Break Phase 0 and Phase 1 into small, buildable tickets for Codex or manual implementation.

⸻

1. Delivery Rules

Each ticket must:

Have one clear responsibility
Avoid unrelated refactors
Include acceptance criteria
Include automated verification where applicable
Preserve architecture dependency rules
Avoid adding future capability scope early

Do not begin research, Ollama, SearXNG, memory retrieval, approval flows, generative UI, or email work until this backlog is complete.

⸻

2. Definition of Ready

A ticket is ready when:

Its dependencies are completed
Its expected package location is known
Its acceptance criteria are testable
Its API/schema impact is explicit
It does not conflict with accepted ADRs

⸻

Milestone 0.1 — Repository Initialization

PAP-001 — Initialize Git Repository and Root Metadata

Goal: Create the repository root configuration.

Scope

Create package.json
Create pnpm-workspace.yaml
Create turbo.json
Create tsconfig.base.json
Create .nvmrc
Create .gitignore
Create .env.example
Create README.md
Create docs folder structure

Acceptance Criteria

pnpm install succeeds
pnpm -r list runs successfully
Node version is documented
No .env file is tracked
Repository opens without TypeScript config errors

Validation

corepack enable
pnpm install
pnpm -r list

Depends On

None

⸻

PAP-002 — Configure Formatting and Static Analysis

Goal: Add consistent formatting and lint rules.

Scope

Install Biome
Create biome.json
Add root format scripts
Add root lint scripts
Configure TypeScript strictness

Acceptance Criteria

pnpm format:check passes
pnpm lint passes
pnpm format modifies intentionally malformed test file
Strict TypeScript options remain enabled

Validation

pnpm format:check
pnpm lint

Depends On

PAP-001

⸻

PAP-003 — Configure Turbo Tasks

Goal: Make root commands run predictable package tasks.

Scope

Define build task
Define dev task
Define lint task
Define typecheck task
Define test task
Configure task dependency order
Disable caching for dev tasks

Acceptance Criteria

turbo run lint executes package lint scripts
turbo run typecheck executes package typecheck scripts
turbo run test executes package test scripts
dev task is persistent and uncached

Validation

pnpm turbo run lint
pnpm turbo run typecheck
pnpm turbo run test

Depends On

PAP-001
PAP-002

⸻

Milestone 0.2 — Shared Packages

PAP-004 — Create @pap/contracts

Goal: Create the dependency-free platform contract package.

Scope

Create package structure
Add Zod dependency
Add common identifier schemas
Add PlatformError schema
Add execution status schema
Export package entry point

Required Initial Files

packages/contracts/src/common.ts
packages/contracts/src/errors.ts
packages/contracts/src/execution.ts
packages/contracts/src/index.ts

Acceptance Criteria

Package builds independently
Package only depends on Zod
Execution status schema exports successfully
Platform error schema validates typed errors

Validation

pnpm --filter @pap/contracts build
pnpm --filter @pap/contracts typecheck

Depends On

PAP-001
PAP-002

⸻

PAP-005 — Create @pap/shared

Goal: Create shared low-level utilities.

Scope

Create ID generator
Create time utility
Create Result helper
Create environment validation skeleton
Create Pino logger factory
Create safe error serializer

Required Rules

No capability logic
No database access
No web framework dependency
No imports from runtime or apps

Acceptance Criteria

Logger can create structured execution-aware logs
ID generator produces stable unique IDs
Environment schema can validate PAP_ENVIRONMENT
Result helper supports success/failure outcomes

Validation

pnpm --filter @pap/shared test
pnpm --filter @pap/shared typecheck

Depends On

PAP-004

⸻

PAP-006 — Create @pap/storage Interfaces

Goal: Define persistence contracts without SQLite implementation.

Scope

Create ExecutionTraceRepository interface
Create CapabilityRegistryRepository interface
Create transaction abstraction if required
Export storage interfaces only

Acceptance Criteria

No Drizzle import
No better-sqlite3 import
Runtime can depend on storage interfaces without concrete implementation

Validation

pnpm --filter @pap/storage typecheck

Depends On

PAP-004
PAP-005

⸻

PAP-007 — Create @pap/testing

Goal: Create shared test factories and temporary test runtime helpers.

Scope

Execution request factory
Trace factory
Temporary SQLite database helper placeholder
Capability test helper placeholder
Fixture loader utility

Acceptance Criteria

Tests can import factory helpers
Fixtures can be loaded from JSON
No production package depends on testing package

Depends On

PAP-004
PAP-005
PAP-006

⸻

Milestone 0.3 — SQLite and Migrations

PAP-008 — Create @pap/storage-sqlite Package

Goal: Establish SQLite connection and Drizzle setup.

Scope

Install Drizzle ORM
Install drizzle-kit
Install better-sqlite3
Create database factory
Create Drizzle config
Support PAP_DATABASE_URL
Ensure data directory exists

Acceptance Criteria

Database opens from configured local path
Invalid database configuration fails clearly
SQLite file is created when missing
Package does not expose raw DB globally

Validation

pnpm --filter @pap/storage-sqlite typecheck
pnpm --filter @pap/storage-sqlite test

Depends On

PAP-004
PAP-005
PAP-006

⸻

PAP-009 — Add Execution Trace Schema and Migration

Goal: Persist top-level execution records.

Scope

Create execution_traces Drizzle schema
Create migration generation command
Generate initial SQL migration
Create migration apply command

Required Fields

id
capability_id
status
workspace_id nullable
thread_id nullable
started_at
completed_at nullable
error_code nullable
error_message nullable
created_at
updated_at

Acceptance Criteria

Migration creates execution_traces table
Migration can run against empty database
Migration can run safely twice
Trace record can be inserted and read

Validation

pnpm db:generate
pnpm db:migrate

Depends On

PAP-008

⸻

PAP-010 — Add Trace Step Schema and Migration

Goal: Persist ordered trace steps.

Scope

Create execution_trace_steps schema
Add foreign-key relation to execution_traces
Add trace step repository

Required Fields

id
execution_id
sequence
kind
name
status
summary nullable
started_at
completed_at nullable
error_code nullable
error_message nullable
created_at

Acceptance Criteria

Trace steps preserve execution order
Foreign key references valid trace
Trace retrieval returns ordered steps
Invalid execution ID cannot create trace step

Validation

pnpm --filter @pap/storage-sqlite test:integration

Depends On

PAP-009

⸻

PAP-011 — Implement SQLite Trace Repository

Goal: Implement storage interface for traces.

Scope

Create trace
Append trace step
Mark trace completed
Mark trace failed
Get trace by ID
List recent traces

Acceptance Criteria

Repository implements @pap/storage interface
Completed trace persists timestamps
Failed trace persists typed error
Recent traces return descending start time
No runtime package imports Drizzle directly

Validation

pnpm --filter @pap/storage-sqlite test

Depends On

PAP-006
PAP-009
PAP-010

⸻

Milestone 0.4 — Runtime and Echo Capability

PAP-012 — Define Capability Contracts

Goal: Add the minimum capability contract to @pap/contracts.

Scope

CapabilityManifest schema
CapabilityExecutionRequest schema
CapabilityExecutionResult schema
Capability interface
Capability execution status types

Required Statuses

running
completed
failed
cancelled

Acceptance Criteria

Manifest requires ID, version, name, description
Request validates capability ID and input payload
Result includes execution ID, status, trace ID
Contracts do not depend on runtime package

Depends On

PAP-004

⸻

PAP-013 — Build Capability Registry

Goal: Register and resolve capabilities safely.

Scope

Register capability definition
Reject duplicate capability IDs
Resolve capability by ID
List registered capabilities
Reject missing capability

Acceptance Criteria

Capability registry is in @pap/runtime
Registry does not import concrete capability packages
Unknown capability returns CAPABILITY_NOT_FOUND
Duplicate registration fails safely

Depends On

PAP-005
PAP-006
PAP-012

⸻

PAP-014 — Build Trace Writer

Goal: Give runtime and capabilities a controlled trace API.

Scope

Start trace
Add trace step
Complete trace
Fail trace
Generate ordered step sequence
Redact unsafe error detail

Acceptance Criteria

Trace writer uses repository interface only
Every step gets deterministic sequence number
Completion cannot happen twice
Failure after completion is rejected

Depends On

PAP-011
PAP-012

⸻

PAP-015 — Build Runtime Execution Service

Goal: Execute a registered capability through validation and tracing.

Scope

Validate execution request
Resolve capability
Validate capability input
Start trace
Call capability execute function
Validate capability output
Complete trace
Return typed result
Fail trace safely on error

Acceptance Criteria

Unknown capability fails before trace execution
Invalid input creates failed trace
Valid capability output returns completed result
Invalid output returns typed validation failure
Unhandled error is serialized safely

Depends On

PAP-012
PAP-013
PAP-014

⸻

PAP-016 — Create @pap/capability-echo

Goal: Build the first zero-dependency capability.

Scope

Create package
Create manifest
Create input schema
Create output schema
Create execute function
Create SKILL.md
Create skill.manifest.json

Behavior

Input:
message string
Output:
normalized message
echoedAt timestamp

Acceptance Criteria

Capability has no tool access
Capability has no memory access
Capability has no LLM usage
Capability writes workflow trace steps
Whitespace is normalized
Empty input fails validation

Depends On

PAP-004
PAP-005
PAP-012

⸻

PAP-017 — Register Echo Capability in Runtime Bootstrap

Goal: Create one composition root that wires storage, runtime, and core capabilities.

Scope

Create runtime bootstrap factory
Instantiate SQLite repository
Instantiate trace writer
Instantiate capability registry
Register echo capability
Return configured runtime service

Acceptance Criteria

One factory creates usable runtime
Echo is listed as registered
Runtime can execute echo through factory
No web app owns dependency wiring

Depends On

PAP-011
PAP-013
PAP-014
PAP-015
PAP-016

⸻

Milestone 0.5 — Web Application

PAP-018 — Initialize TanStack Start Web App

Goal: Create the web application shell.

Scope

Initialize React + TanStack Start
Add root layout
Add root route
Add basic styling
Add health/status display
Configure server-only environment usage

Acceptance Criteria

pnpm dev:web starts application
Root route renders
No database access happens in browser bundle
Application can call server function

Depends On

PAP-001
PAP-005

⸻

PAP-019 — Add Echo Execution Server Function

Goal: Connect web app to shared runtime.

Scope

Create server function
Validate form input
Call runtime bootstrap
Execute capability.echo
Return typed result
Map typed errors to safe UI result

Acceptance Criteria

Server function executes echo
Browser never receives raw database errors
Invalid message displays safe validation error
Execution ID is returned after success

Depends On

PAP-017
PAP-018

⸻

PAP-020 — Build Echo Run Screen

Goal: Allow a user to run echo from the browser.

Scope

Message form
Run button
Pending state
Success state
Failure state
Execution detail link

Acceptance Criteria

User can enter text
User can submit
Button disables while request is running
Completed message renders
Failure state renders safely

Depends On

PAP-019

⸻

PAP-021 — Build Execution Detail Screen

Goal: Show persisted trace data.

Scope

Route /executions/$executionId
Server data loader
Execution summary component
Trace step list
Empty/not-found state
Failure display

Acceptance Criteria

Completed trace remains visible after refresh
Steps render in sequence order
Unknown execution ID shows safe not-found state
No raw sensitive payload is rendered

Depends On

PAP-011
PAP-018
PAP-019

⸻

Milestone 0.6 — Worker Bootstrap

PAP-022 — Create Worker App

Goal: Start a standalone Node worker using the same runtime bootstrap.

Scope

Create worker package
Add startup logger
Load environment
Initialize runtime
List registered capabilities
Handle graceful shutdown

Acceptance Criteria

pnpm dev:worker starts worker
Worker logs registered capabilities
Worker exits cleanly on SIGTERM
Worker does not start scheduler yet

Depends On

PAP-005
PAP-017

⸻

PAP-023 — Add Worker Health Command

Goal: Confirm worker/runtime/database health.

Scope

Add health command
Check environment
Check SQLite connection
Check runtime bootstrap
Return non-zero status on failure

Acceptance Criteria

Healthy environment exits with code 0
Bad database path exits non-zero
Health output does not expose secrets

Depends On

PAP-022

⸻

Milestone 0.7 — Tests and QA

PAP-024 — Add Contract Tests

Goal: Test shared schema behavior.

Scope

Capability manifest validation tests
Execution request validation tests
Execution result validation tests
Platform error validation tests

Acceptance Criteria

Invalid IDs fail
Missing required fields fail
Unknown status fails
Fixture examples remain valid

Depends On

PAP-012
PAP-007

⸻

PAP-025 — Add Runtime Integration Tests

Goal: Test echo execution against temporary SQLite.

Scope

Successful echo execution test
Invalid echo input test
Unknown capability test
Trace persistence test
Trace step ordering test
Unhandled error serialization test

Acceptance Criteria

Tests use isolated temporary database
No state leaks between tests
Trace includes validation and finalization steps

Depends On

PAP-017
PAP-007

⸻

PAP-026 — Add Playwright Echo Smoke Test

Goal: Test the visible web flow.

Scope

Start app for test
Open root page
Enter echo message
Submit form
Verify response
Open execution page
Verify trace steps

Acceptance Criteria

Test passes locally
Test does not depend on Ollama or SearXNG
Test uses isolated test database
Screenshots/traces are saved on failure

Depends On

PAP-020
PAP-021

⸻

PAP-027 — Add QA-Intel Echo Feature

Goal: Validate behavior with Gherkin and browser evidence.

Scope

Create runtime-echo.feature
Compile through QA-Intel
Configure local app target
Run scenario
Store screenshots and JSON result

Required Scenario

Feature: Runtime echo execution
Scenario: User runs the echo capability and sees its trace
Given the Personal Agent Platform web app is running
When the user enters "Hello Personal Agent"
And the user runs the echo capability
Then the user should see "Hello Personal Agent"
And the execution status should be "completed"
And the trace should include "validate input"
And the trace should include "finalize execution"

Acceptance Criteria

QA-Intel scenario passes locally
Failure output includes screenshot path and fix hint
Scenario does not use mocked frontend behavior

Depends On

PAP-020
PAP-021
PAP-026

⸻

Milestone 0.8 — Docker and CI

PAP-028 — Add Docker Build for Web

Goal: Containerize the TanStack Start web app.

Scope

Create multi-stage Dockerfile
Enable Corepack
Install workspace dependencies
Build web app
Run as non-root user
Expose configured port
Mount data directory

Acceptance Criteria

Web image builds
Container starts successfully
Web can execute echo
Database path is configurable

Depends On

PAP-020
PAP-021

⸻

PAP-029 — Add Docker Build for Worker

Goal: Containerize the worker.

Scope

Create worker Dockerfile
Build worker package
Run worker entry point
Mount shared data volume
Handle graceful shutdown

Acceptance Criteria

Worker image builds
Worker starts with same environment
Worker can access shared SQLite volume

Depends On

PAP-022

⸻

PAP-030 — Add Docker Compose Baseline

Goal: Run web and worker together.

Scope

Create compose.yml
Add web service
Add worker service
Add pap-data volume
Pass environment configuration
Add basic health checks

Acceptance Criteria

docker compose up --build starts both services
Web executes echo successfully
Worker starts successfully
SQLite data persists after restart
docker compose down does not delete persisted data

Depends On

PAP-028
PAP-029

⸻

PAP-031 — Add GitHub Actions CI

Goal: Add baseline quality checks.

Scope

Checkout repository
Set up Node from .nvmrc
Set up pnpm
Cache pnpm store
Install with frozen lockfile
Run format check
Run lint
Run typecheck
Run unit/integration tests
Run build

Acceptance Criteria

Workflow runs on pull requests
Workflow runs on push to main
Dependency cache is enabled
Build failure blocks workflow
No deployment step exists

Depends On

PAP-002
PAP-003
PAP-025

⸻

3. Recommended Execution Order

PAP-001
PAP-002
PAP-003
PAP-004
PAP-005
PAP-006
PAP-007
PAP-008
PAP-009
PAP-010
PAP-011
PAP-012
PAP-013
PAP-014
PAP-015
PAP-016
PAP-017
PAP-018
PAP-019
PAP-020
PAP-021
PAP-022
PAP-023
PAP-024
PAP-025
PAP-026
PAP-027
PAP-028
PAP-029
PAP-030
PAP-031

⸻

4. Suggested Pull Request Boundaries

Keep pull requests narrow.

PR 1:
PAP-001 to PAP-003
PR 2:
PAP-004 to PAP-007
PR 3:
PAP-008 to PAP-011
PR 4:
PAP-012 to PAP-017
PR 5:
PAP-018 to PAP-021
PR 6:
PAP-022 to PAP-023
PR 7:
PAP-024 to PAP-027
PR 8:
PAP-028 to PAP-031

Do not merge a PR that introduces a new architectural direction without updating the ADRs first.

⸻

5. Bootstrap Exit Criteria

Phase 0–1 is complete only when:

The monorepo installs and builds.
The web app runs.
The worker runs.
SQLite migrations run.
The echo capability executes through the runtime.
Execution traces are persisted.
The web app displays execution traces.
Runtime contract and integration tests pass.
Playwright smoke tests pass.
QA-Intel echo scenario passes locally.
Docker Compose runs web and worker.
SQLite data persists across restart.
CI runs format, lint, typecheck, test, and build.

⸻

6. Next Build Document

After this backlog is implemented, create:

18-phase-2-storage-memory-trace-backlog.md

That backlog should introduce:

Workspace records
Semantic memory records
Episodic memory records
Memory Explorer API
Memory Explorer UI
Trace filtering
Capability registry persistence
