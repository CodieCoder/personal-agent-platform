Personal Agent Platform

A private, local-first platform for building reliable personal AI agents.

Personal Agent Platform (PAP) is a modular, self-hostable agent system designed for one person.

It brings together personal context, local models, approved tools, reusable capabilities, memory, execution traces, and structured UI so agent workflows can be useful, inspectable, and safe.

Rather than being another generic chatbot wrapper, PAP is designed as a personal AI operating environment for research, work, career, communication, documents, and recurring workflows.

Build agent workflows that can use your context, call approved tools, show their work, and remain under your control.

⸻

Why PAP?

Most AI assistants are prompt-driven and stateless. They can produce useful answers, but they often lack:

- Reliable access to your actual context, projects, and preferences
- Clear boundaries around tools and external actions
- Inspectable memory and execution history
- Reusable workflows beyond a single prompt
- Local and self-hosted deployment options
- Structured, validated outputs instead of arbitrary model-generated interfaces

PAP is built to solve those problems.

Its core promise is:

A private personal agent that understands your context, uses approved tools, completes repeatable work, and improves over time without becoming uncontrolled.

⸻

What It Is Designed To Do

The platform is intended to support modular capabilities such as:

- Research and opportunity monitoring
- Business, technology, and job-market intelligence
- Personal knowledge retrieval
- Document analysis and comparison
- Email search, summarization, and drafting
- Recurring reports and scheduled workflows
- Career and business decision support
- Project context retrieval
- Personal memory and workflow history

The first vertical slice focuses on a local-first research capability.

Example request:

Research AI coding-agent updates that may affect QA Intel.

Expected result:

- A structured research report
- Relevant sources and summaries
- Why each finding matters
- Opportunities, risks, and recommended actions
- Saved research history
- Warnings for partial failures
- A visible execution trace of what happened

⸻

Core Principles

Local-first, not local-only

PAP is designed to work with local models, local storage, local files, and self-hosted services by default.

It can also connect to external services when explicitly configured, including hosted models, APIs, search providers, scraping tools, and cloud storage.

Deterministic where possible

LLMs are used for work that benefits from judgment, such as:

- Ranking
- Classification
- Analysis
- Summarization
- Planning within bounded workflows

Deterministic code handles predictable work such as validation, permissions, schemas, storage, tool execution, and policy enforcement.

User control before side effects

Meaningful external or destructive actions should require approval.

Examples include:

- Sending email
- Deleting data
- Publishing externally
- Modifying calendar events
- Sharing private information
- Running destructive scripts

Low-risk work such as reading, searching, drafting, summarizing, and generating reports can run without interruption.

Memory must be inspectable

Memory is not treated as an invisible black box.

Stored information should include provenance, confidence, scope, timestamps, expiry where relevant, and the ability to edit or delete it.

Every run should be traceable

Every capability run should produce an execution trace showing:

- Capability and skill selected
- Tools used
- Permissions checked
- Memory reads and writes
- Validation results
- Approval requests
- Errors and warnings
- Final structured output

⸻

Architecture

PAP is a TypeScript monorepo built around reusable platform services.

User
↓
Web App / CLI / Scheduled Worker
↓
API
↓
Agent Runtime
├── Capability Registry
├── Skill Loader
├── Tool Registry
├── Policy and Approval Engine
├── Memory Service
├── Execution Trace Service
├── AI Provider Layer
└── UI Intent Validator
↓
Capability Workflow
↓
Tools / Storage / External Services / Local Models
↓
Structured Result + Validated UI Blocks + Trace

The runtime provides the safety and orchestration layer.

Capabilities own domain workflows.

Tools perform narrow, typed actions.

Skills define the instructions and operating rules for capabilities and tools.

⸻

Current V1 Focus

The initial V1 is a local-first personal research agent.

It is intended to prove the platform architecture end to end:

Research request
→ retrieve relevant personal and project context
→ search the web through SearXNG
→ rank sources with Ollama
→ scrape and extract selected pages
→ analyze findings
→ generate a structured report
→ save research memory
→ render validated UI blocks
→ expose a complete execution trace

Included platform areas

- Modular TypeScript monorepo
- React and TanStack Start web application
- API and runtime layer
- Background worker
- SQLite persistence
- Ollama provider integration
- SearXNG search integration
- Web scraping and extraction
- Semantic and episodic memory foundations
- Capability, tool, and UI contracts
- Execution traces
- Docker workflow
- Unit, integration, E2E, and QA validation paths

Intentionally out of scope for the first release

- Multi-user SaaS tenancy
- Team workspaces
- Public capability marketplace
- Unrestricted third-party plugins
- Email automation
- Calendar automation
- Financial tools
- Full document-analysis workflows
- Cloud-first deployment
- Autonomous side-effect execution

⸻

Repository Structure

personal-agent-platform/
├── apps/
│ ├── api/ # Runtime-facing API
│ ├── web/ # React + TanStack Start application
│ └── worker/ # Scheduled and background capability runs
│
├── packages/
│ ├── contracts/ # Shared platform contracts and schemas
│ ├── runtime/ # Capability orchestration runtime
│ ├── shared/ # Shared utilities and infrastructure helpers
│ ├── storage/ # Storage abstractions and SQLite implementation
│ ├── memory/ # Semantic, episodic, and procedural memory
│ ├── ai/ # Provider abstractions
│ ├── tools/ # Typed deterministic tools
│ ├── capabilities/ # Modular agent capabilities
│ ├── ui/ # UI contracts, renderers, and blocks
│ └── testing/ # Shared testing utilities
│
├── agents/ # Coding-agent rules and reusable skills
├── docs/ # Product, architecture, backlog, and runbook docs
├── e2e/ # Playwright end-to-end tests
├── qa/ # QA-Intel validation runner and suites
└── docker-compose.yml # Local self-hosted environment

⸻

Technology Direction

- Language: TypeScript
- Package manager: pnpm
- Build orchestration: Turborepo
- Frontend: React + TanStack Start
- Validation: Zod and typed contracts
- Local AI: Ollama
- Search: SearXNG
- Storage: SQLite, with a Postgres-compatible future path
- Testing: Vitest, Playwright, QA-Intel
- Formatting and linting: Biome
- Deployment: Local development and Docker-based self-hosting

⸻

Getting Started

Prerequisites

- Node.js >=22.13 <25
- pnpm 11.x
- Docker and Docker Compose, for the full local stack
- Ollama, for local model execution
- A configured SearXNG instance, when using research capabilities

Install

corepack enable
pnpm install

Configure environment variables

cp .env.example .env

Review .env.example and provide the required local service configuration.

Run locally

pnpm dev

Run the web application only:

pnpm dev:web

Run the background worker only:

pnpm dev:worker

Run with Docker

pnpm docker:up

Stop services:

pnpm docker:down

View logs:

pnpm docker:logs

⸻

Quality Checks

Run the complete local verification gate:

pnpm verify

Individual checks:

pnpm format:check
pnpm lint
pnpm typecheck
pnpm test

Run unit tests:

pnpm test:unit

Run integration tests:

pnpm test:integration

Run end-to-end tests:

pnpm test:e2e

Run QA validation:

pnpm test:qa

⸻

Database Commands

Generate database artifacts:

pnpm db:generate

Run migrations:

pnpm db:migrate

⸻

Documentation

The product and architecture are documented in docs/.

Recommended reading order:

1. Product Foundation
2. Product Principles
3. Platform Architecture
4. Runtime and Contracts
5. Capability System
6. Tool System
7. Memory Model
8. Policy and Approval Model
9. Generative UI Model
10. V1 Product Requirements
11. Roadmap

Implementation backlogs are available in docs/backlogs/.

Accepted implementation plans are stored in docs/plans/.

⸻

Contribution and Development Rules

PAP is being built with a deliberate planning-first workflow.

Before implementation begins:

1. Review the relevant product and architecture documentation.
2. Create or update an implementation plan in docs/plans/.
3. Keep changes scoped to the relevant backlog ticket or phase.
4. Add or update validation coverage.
5. Run the appropriate quality checks before considering work complete.

See AGENTS.md for repository-specific agent and development rules.

⸻

Project Status

Personal Agent Platform is under active development.

The project is currently focused on establishing a reliable personal-agent runtime and validating the first end-to-end research capability before expanding into email, document analysis, calendar, financial, and broader automation capabilities.

The priority is not maximum autonomy.

The priority is reliable, private, traceable, and reusable agent workflows.
