Personal Agent Platform — Repository Bootstrap Plan

Status: Build Plan
Depends on:

- 15-architecture-decision-records.md
- 01-product-foundation.md
- 03-platform-architecture.md
- 10-v1-prd.md

Purpose: Define the exact repository structure, package graph, scripts, environment configuration, Docker baseline, CI setup, and first implementation milestones.

⸻

1. Bootstrap Objective

Create a working monorepo that proves the platform spine before real research, memory retrieval, Ollama, SearXNG, scraping, email, or document analysis are added.

The first proof must be:

Web UI
→ server function / route
→ shared runtime
→ echo capability
→ SQLite trace persistence
→ trace visible in UI
→ tests
→ QA-Intel scenario

The first milestone is successful when the user can run a fake capability and inspect a persisted execution trace.

⸻

2. Locked Stack

Runtime:
Node.js LTS
TypeScript
Monorepo:
pnpm workspaces
Turborepo
Web:
React
TanStack Start
Database:
SQLite
better-sqlite3
Drizzle ORM
drizzle-kit migrations
Validation:
Zod
Logging:
Pino
Testing:
Vitest
Playwright
QA-Intel
Deployment:
Docker Compose
External Ollama/SearXNG in local development
Optional Compose services for self-hosting

⸻

3. Repository Name

Recommended repository name:

personal-agent-platform

Recommended package namespace:

@pap/\*

Examples:

@pap/contracts
@pap/runtime
@pap/shared
@pap/storage
@pap/storage-sqlite
@pap/testing

⸻

4. Initial Repository Tree

personal-agent-platform/
├── apps/
│ ├── web/
│ │ ├── src/
│ │ │ ├── routes/
│ │ │ ├── components/
│ │ │ ├── features/
│ │ │ │ └── executions/
│ │ │ ├── lib/
│ │ │ └── styles/
│ │ ├── public/
│ │ ├── package.json
│ │ ├── vite.config.ts
│ │ ├── tsconfig.json
│ │ └── .env.example
│ │
│ ├── worker/
│ │ ├── src/
│ │ │ ├── index.ts
│ │ │ ├── scheduler.ts
│ │ │ └── health.ts
│ │ ├── package.json
│ │ └── tsconfig.json
│ │
│ └── api/
│ ├── README.md
│ └── .gitkeep
│
├── packages/
│ ├── contracts/
│ │ ├── src/
│ │ │ ├── capability.ts
│ │ │ ├── execution.ts
│ │ │ ├── trace.ts
│ │ │ ├── errors.ts
│ │ │ ├── common.ts
│ │ │ └── index.ts
│ │ ├── package.json
│ │ └── tsconfig.json
│ │
│ ├── shared/
│ │ ├── src/
│ │ │ ├── env.ts
│ │ │ ├── ids.ts
│ │ │ ├── logger.ts
│ │ │ ├── result.ts
│ │ │ ├── time.ts
│ │ │ └── index.ts
│ │ ├── package.json
│ │ └── tsconfig.json
│ │
│ ├── runtime/
│ │ ├── src/
│ │ │ ├── capability-registry.ts
│ │ │ ├── execution-service.ts
│ │ │ ├── trace-writer.ts
│ │ │ ├── runtime.ts
│ │ │ └── index.ts
│ │ ├── package.json
│ │ └── tsconfig.json
│ │
│ ├── storage/
│ │ ├── src/
│ │ │ ├── repositories/
│ │ │ ├── interfaces/
│ │ │ └── index.ts
│ │ ├── package.json
│ │ └── tsconfig.json
│ │
│ ├── storage-sqlite/
│ │ ├── src/
│ │ │ ├── db.ts
│ │ │ ├── schema/
│ │ │ │ ├── execution-traces.ts
│ │ │ │ ├── execution-trace-steps.ts
│ │ │ │ └── index.ts
│ │ │ ├── repositories/
│ │ │ ├── migrations/
│ │ │ └── index.ts
│ │ ├── drizzle.config.ts
│ │ ├── package.json
│ │ └── tsconfig.json
│ │
│ ├── capabilities/
│ │ └── echo/
│ │ ├── src/
│ │ │ ├── manifest.ts
│ │ │ ├── schemas.ts
│ │ │ ├── execute.ts
│ │ │ └── index.ts
│ │ ├── skills/
│ │ │ └── echo/
│ │ │ ├── SKILL.md
│ │ │ └── skill.manifest.json
│ │ ├── tests/
│ │ ├── package.json
│ │ └── tsconfig.json
│ │
│ └── testing/
│ ├── src/
│ │ ├── fixtures/
│ │ ├── factories/
│ │ ├── test-runtime.ts
│ │ └── index.ts
│ ├── package.json
│ └── tsconfig.json
│
├── skills/
│ ├── shared/
│ └── capabilities/
│
├── docs/
│ ├── product/
│ ├── architecture/
│ ├── decisions/
│ ├── capabilities/
│ ├── runbooks/
│ └── implementation/
│
├── qa/
│ ├── features/
│ │ └── runtime-echo.feature
│ ├── runner/
│ │ └── src/
│ ├── fixtures/
│ └── README.md
│
├── e2e/
│ ├── execution-trace.spec.ts
│ └── playwright.config.ts
│
├── docker/
│ ├── web.Dockerfile
│ ├── worker.Dockerfile
│ └── entrypoint.sh
│
├── .github/
│ └── workflows/
│ ├── ci.yml
│ └── reusable-quality.yml
│
├── data/
│ └── .gitkeep
│
├── .env.example
├── .gitignore
├── .nvmrc
├── .npmrc
├── biome.json
├── compose.yml
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── vitest.workspace.ts
└── README.md

⸻

5. Workspace Definition

pnpm-workspace.yaml

packages:

- "apps/\*"
- "packages/\*"
- "packages/capabilities/\*"

Do not include skills/, docs/, qa/, or e2e/ as workspace packages.

⸻

6. Package Dependency Graph

apps/web
├── @pap/contracts
├── @pap/runtime
├── @pap/shared
├── @pap/storage
├── @pap/storage-sqlite
└── @pap/capability-echo
apps/worker
├── @pap/contracts
├── @pap/runtime
├── @pap/shared
├── @pap/storage
├── @pap/storage-sqlite
└── @pap/capability-echo
@pap/capability-echo
├── @pap/contracts
└── @pap/shared
@pap/runtime
├── @pap/contracts
├── @pap/shared
└── @pap/storage
@pap/storage-sqlite
├── @pap/contracts
├── @pap/shared
└── @pap/storage
@pap/storage
├── @pap/contracts
└── @pap/shared
@pap/testing
├── @pap/contracts
├── @pap/runtime
├── @pap/storage
└── @pap/storage-sqlite
@pap/contracts
└── zod only

Dependency rules:

contracts:
Must not depend on runtime, apps, concrete capabilities, UI, or storage adapters.
runtime:
Must not depend on concrete capability packages.
capabilities:
May depend on runtime interfaces, contracts, shared, and approved tools.
web:
Must not access SQLite directly.
worker:
Must call shared runtime, not duplicate capability logic.
storage:
Defines interfaces only.
storage-sqlite:
Implements storage interfaces only.

⸻

7. Root package.json

{
"name": "personal-agent-platform",
"private": true,
"packageManager": "pnpm@10.0.0",
"engines": {
"node": ">=22 <25"
},
"scripts": {
"dev": "turbo run dev --parallel",
"dev:web": "pnpm --filter @pap/web dev",
"dev:worker": "pnpm --filter @pap/worker dev",
"build": "turbo run build",
"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p e2e/tsconfig.json && tsc --noEmit -p qa/runner/tsconfig.json && turbo run typecheck",
"lint": "biome lint . && turbo run lint",
"format": "biome format --write .",
"format:check": "biome format .",
"test": "pnpm run test:unit && pnpm run test:integration",
"test:unit": "pnpm run build && vitest run --config vitest.workspace.ts --project=unit",
"test:integration": "pnpm run build && vitest run --config vitest.workspace.ts --project=integration",
"test:e2e": "playwright test --config e2e/playwright.config.ts",
"test:qa": "tsx qa/runner/src/index.ts",
"db:generate": "pnpm --filter @pap/storage-sqlite db:generate",
"db:migrate": "pnpm --filter @pap/storage-sqlite db:migrate",
"db:studio": "pnpm --filter @pap/storage-sqlite db:studio",
"qa": "pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e",
"ci": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test",
"docker:up": "docker compose up --build",
"docker:down": "docker compose down",
"docker:logs": "docker compose logs -f"
},
"devDependencies": {
"@biomejs/biome": "^1.9.0",
"@playwright/test": "^1.55.0",
"@qutecoder/qa-intel": "^0.1.0",
"@types/node": "^22.0.0",
"turbo": "^2.5.0",
"typescript": "^5.8.0",
"vitest": "^3.0.0"
}
}

Version ranges should be finalized during bootstrap using the current compatible releases, not copied blindly from this draft.

⸻

8. Root turbo.json

{
"$schema": "https://turbo.build/schema.json",
"globalDependencies": [
".env",
".env.local",
".env.example",
"pnpm-lock.yaml",
"tsconfig.base.json"
],
"tasks": {
"build": {
"dependsOn": ["^build"],
"outputs": [
"dist/**",
".output/**",
"build/**"
]
},
"dev": {
"cache": false,
"persistent": true
},
"lint": {
"dependsOn": ["^lint"],
"outputs": []
},
"typecheck": {
"dependsOn": ["^typecheck"],
"outputs": []
},
"test": {
"dependsOn": ["^test"],
"outputs": [
"coverage/**"
]
},
"test:unit": {
"dependsOn": ["^test:unit"],
"outputs": [
"coverage/**"
]
},
"test:integration": {
"dependsOn": ["^test:integration"],
"outputs": [
"coverage/**"
]
}
}
}

Rules:

Do not cache dev tasks.
Do not cache tasks that mutate SQLite data.
Keep test fixture output isolated under temporary directories.
Do not add remote cache in Phase 0.

⸻

9. TypeScript Configuration

tsconfig.base.json

{
"compilerOptions": {
"target": "ES2023",
"module": "NodeNext",
"moduleResolution": "NodeNext",
"strict": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true,
"useUnknownInCatchVariables": true,
"forceConsistentCasingInFileNames": true,
"skipLibCheck": true,
"declaration": true,
"declarationMap": true,
"sourceMap": true,
"resolveJsonModule": true,
"verbatimModuleSyntax": true
}
}

Repository rule:

Do not weaken strict TypeScript settings merely to make an early implementation compile.

⸻

10. Environment Variables

Root .env.example

# Runtime

NODE_ENV=development
PAP_ENVIRONMENT=local
PAP_BIND_HOST=127.0.0.1
PAP_PORT=3000
PAP_ALLOW_REMOTE_ACCESS=false
PAP_AUTH_MODE=none
PAP_TRUSTED_PROXY=false

# Database

PAP_DATABASE_URL=file:./data/pap.db
PAP_DATA_DIR=./data

# Logging

PAP_LOG_LEVEL=info
PAP_LOG_PRETTY=true
PAP_TRACE_RAW_PAYLOADS=false

# Worker

PAP_WORKER_ENABLED=true
PAP_SCHEDULER_ENABLED=false
PAP_TIMEZONE=Africa/Lagos

# Future research dependencies

PAP_OLLAMA_BASE_URL=http://127.0.0.1:11434
PAP_OLLAMA_MODEL=
PAP_SEARXNG_BASE_URL=http://127.0.0.1:8080

# Optional future integrations

PAP_SUPABASE_URL=
PAP_SUPABASE_SERVICE_ROLE_KEY=
PAP_EMBEDDING_SERVICE_URL=

Rules:

Never commit .env files.
Never expose secrets to browser code.
Use server-only environment validation.
Do not create Supabase, embedding, email, or Ollama credentials in Phase 0.

⸻

11. Shared Environment Validation

@pap/shared/env.ts must:

Validate environment variables using Zod.
Separate server-only values from browser-safe values.
Fail fast for invalid production/self-hosted configuration.
Warn when remote binding is enabled without configured protection.

Example behavior:

PAP_BIND_HOST=0.0.0.0
PAP_AUTH_MODE=none
PAP_ALLOW_REMOTE_ACCESS=true

Must produce a startup warning and refuse to enable sensitive capabilities later.

⸻

12. Database Bootstrap

Initial database file:

data/pap.db

Initial migrations:

0000_initial_execution_traces.sql
0001_initial_execution_trace_steps.sql
0002_capability_registry.sql

Initial tables only:

execution_traces
execution_trace_steps
capability_registry

Do not create research, memory, approvals, documents, email, vectors, or source-profile tables in the repository bootstrap milestone.

⸻

13. Initial Runtime Contracts

The first contract set must include:

CapabilityManifest
CapabilityExecutionRequest
CapabilityExecutionResult
ExecutionTrace
ExecutionTraceStep
PlatformError

The first status values:

running
completed
failed
cancelled

awaiting_approval is deferred until the approval system milestone.

⸻

14. Echo Capability

The first capability is:

capability.echo

Purpose:

Receive text input.
Return normalized text output.
Create execution trace steps.
Persist trace.
Render simple result in web UI.

Input:

{
message: string;
}

Output:

{
message: string;
echoedAt: string;
}

Workflow:

1. Validate input.
2. Start trace.
3. Create workflow trace step.
4. Return normalized response.
5. Validate output.
6. Finalize trace as completed.

The echo capability must not call LLMs, tools, memory, or external services.

⸻

15. Initial Web Screens

V1 bootstrap web UI needs only:

/
Run Echo form
Recent execution list
/executions/$executionId
Execution result
Compact trace
Detailed trace

The home screen must include:

Text input
Run button
Pending state
Success state
Failure state
Link to execution details

The execution detail screen must show:

Execution ID
Capability ID
Status
Started/completed timestamps
Trace steps
Safe summary
Error state where applicable

No chat UI is required in Phase 0.

⸻

16. Worker Bootstrap

apps/worker must initially support:

Startup logging
Health endpoint or health command
Direct runtime initialization
Manual test execution command
Graceful shutdown

Do not enable real scheduling yet.

Initial worker command:

pnpm --filter @pap/worker dev

Initial success condition:

Worker initializes shared runtime and reports registered capabilities.

⸻

17. Docker Baseline

Initial compose.yml:

services:
web:
build:
context: .
dockerfile: docker/web.Dockerfile
env_file: - .env
ports: - "3000:3000"
volumes: - pap-data:/app/data
depends_on: - worker
worker:
build:
context: .
dockerfile: docker/worker.Dockerfile
env_file: - .env
volumes: - pap-data:/app/data
volumes:
pap-data:

Rules:

Do not containerize Ollama in the first Compose file.
Do not containerize SearXNG in the first Compose file.
Do not expose database files outside the persistent volume.
Add health checks before enabling production self-hosting.

Later Compose profiles may include:

searxng
ollama
reverse-proxy
postgres

⸻

18. Dockerfile Rules

Use multi-stage Docker builds.

Requirements:

Node.js LTS base image
pnpm enabled through Corepack
Build workspace packages before runtime image
Run as non-root user
Mount persistent data volume
Use production dependencies only in runtime stage

The web container starts TanStack Start through its generated Node output.

The worker container starts the compiled TypeScript worker entry point.

⸻

19. CI Pipeline

Initial GitHub Actions workflow:

.github/workflows/ci.yml

Required jobs:

format
lint
typecheck
unit-tests
integration-tests
build
playwright-smoke

Initial pipeline order:

format
→ lint
→ typecheck
→ unit-tests
→ integration-tests
→ build
→ playwright-smoke

QA-Intel should initially run:

Locally before merge.
Nightly or manually in CI once its project adapter is stable.

Do not block every initial pull request on long browser/QA suites until runtime is stable.

⸻

20. Reusable CI Workflow

Create:

.github/workflows/reusable-quality.yml

Purpose:

Centralize Node setup
pnpm cache
dependency installation
format/lint/typecheck
test commands

Use it from ci.yml once a second workflow exists.

Do not over-abstract CI during Phase 0.

⸻

21. QA-Intel Bootstrap

Initial feature file:

qa/features/runtime-echo.feature

Scenario:

Feature: Runtime echo execution
Scenario: User runs the echo capability and sees the echoed result
Given I navigate to "/"
When I wait for css:[data-runtime-ready='true']
And I type "Hello Personal Agent" into the field "Message"
And I click the button "Run echo"
And I wait for css:.result-success
Then css:.result-success should contain text "Completed"
And css:.result-success should contain text "Hello Personal Agent"

Scenario: User opens the latest echo execution and sees its trace
Given I navigate to "/"
When I wait for the link "Latest execution detail"
And I click the link "Latest execution detail"
And I wait for the heading "Execution detail"
Then I should see the heading "Execution detail"
And css:.page-header should contain text "completed"
And css:.trace-list should contain text "validate input"
And css:.trace-list should contain text "finalize execution"

QA-Intel should validate behavior through the UI and trace output.
Use `@qutecoder/qa-intel` for strict Gherkin compilation, browser execution, JSON diagnostics,
screenshots, and SQLite run history. Keep a repo-local runner only for starting the local app with an
isolated test database and passing the feature to QA-Intel.

It should not replace direct Vitest coverage for runtime code.

⸻

22. Phase 0 Bootstrap Milestones

Milestone 0.1 — Initialize Repository

Tasks:

Create Git repository.
Add Node version file.
Enable Corepack.
Create pnpm workspace.
Create root package.json.
Create turbo.json.
Create tsconfig.base.json.
Create .gitignore.
Create .env.example.
Add Biome configuration.

Done when:

pnpm install works.
pnpm lint works.
pnpm typecheck works.
pnpm format:check works.

⸻

Milestone 0.2 — Create Shared Packages

Tasks:

Create @pap/contracts.
Create @pap/shared.
Create @pap/storage.
Create @pap/storage-sqlite.
Create @pap/runtime.
Create @pap/testing.

Done when:

Each package builds.
Dependency direction is valid.
No circular dependency exists.

⸻

Milestone 0.3 — SQLite and Migrations

Tasks:

Configure Drizzle.
Add better-sqlite3 connection.
Add migration generation.
Create execution trace schema.
Create trace step schema.
Create repositories.

Done when:

pnpm db:generate works.
pnpm db:migrate creates pap.db.
Trace record can be created and read.

⸻

Milestone 0.4 — Runtime and Echo Capability

Tasks:

Create capability registry.
Create trace writer.
Create execution service.
Create echo manifest.
Create echo input/output schema.
Create echo execute function.
Register echo capability.

Done when:

Runtime executes echo.
Input is validated.
Output is validated.
Trace is persisted.
Invalid input returns typed failure.

⸻

Milestone 0.5 — Web Application

Tasks:

Create TanStack Start app.
Create echo form.
Create execution result view.
Create execution trace view.
Wire server function to runtime.

Done when:

User can run echo from browser.
User sees completion state.
User can open trace detail.
Trace persists after refresh.

⸻

Milestone 0.6 — Test Baseline

Tasks:

Add Vitest workspace.
Add contract tests.
Add runtime integration tests.
Add Playwright smoke test.
Add QA-Intel feature.

Done when:

Echo success test passes.
Echo invalid-input test passes.
Persisted-trace test passes.
Browser smoke test passes.
QA-Intel scenario passes locally.

⸻

Milestone 0.7 — Docker Baseline

Tasks:

Add web Dockerfile.
Add worker Dockerfile.
Add compose.yml.
Add persistent data volume.
Add startup scripts.

Done when:

docker compose up --build starts web and worker.
Web can execute echo.
SQLite data survives container restart.

⸻

23. Definition of Bootstrap Complete

Repository bootstrap is complete when:

The monorepo installs cleanly.
The web app starts.
The worker starts.
SQLite migrations run.
Echo capability is registered.
Echo can run through shared runtime.
Trace is persisted.
Trace appears in the web UI.
Vitest tests pass.
Playwright smoke test passes.
QA-Intel scenario passes locally.
Docker Compose runs web and worker.
SQLite data persists across restart.

At that point, begin the next implementation document:

17-phase-0-1-backlog.md

That document should break these milestones into small executable tickets for Codex.
