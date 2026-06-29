Personal Agent Platform — Roadmap

Status: Product and Delivery Roadmap
Depends on:

- 01-product-foundation.md
- 02-product-principles.md
- 03-platform-architecture.md
- 04-runtime-and-contracts.md
- 05-capability-system.md
- 06-tool-system.md
- 07-memory-model.md
- 08-policy-and-approval-model.md
- 09-generative-ui-model.md
- 10-v1-prd.md
- 11-research-capability-prd.md
- 12-email-capability-prd.md
- 13-document-analysis-capability-prd.md

⸻

1. Roadmap Goal

Build Personal Agent Platform in a sequence that proves reliability before increasing autonomy, integrations, or feature breadth.

The order is intentional:

Platform foundation
→ research vertical slice
→ memory and trace reliability
→ document analysis
→ email
→ scheduled workflows
→ capability installation
→ advanced integrations

The product should not attempt to become a complete Jarvis-like assistant before it can reliably complete one bounded workflow.

⸻

2. Delivery Principles

Every milestone must preserve:

Deterministic where possible
User control before side effects
Inspectable and reversible memory
Typed contracts
Traceable execution
Local-first operation
Composable capabilities
Validated UI output

A milestone is not complete because a demo works once.

A milestone is complete when:

The workflow is testable
Inputs and outputs are validated
Failures are understandable
Traces are available
Memory behavior is visible
The feature fits the platform contracts

⸻

3. Phase 0 — Repository and Engineering Foundation

Goal: Create the monorepo and shared engineering baseline.

Deliverables

pnpm workspace
Turborepo configuration
apps/web
apps/api
apps/worker
packages/contracts
packages/shared
packages/runtime
packages/storage-sqlite
packages/testing
base documentation structure
environment configuration
linting
type checking
unit test setup
integration test setup
CI workflow

Required Decisions

Package naming convention
Environment variable strategy
SQLite migration library
Test runner
Logging library
Error serialization format
Local Docker strategy

Acceptance Criteria

pnpm install succeeds
pnpm build succeeds
pnpm typecheck succeeds
pnpm test succeeds
apps can import shared workspace packages
package dependency rules are enforced
CI runs on pull requests

Output

A clean but mostly empty platform skeleton.

⸻

4. Phase 1 — Runtime Skeleton

Goal: Prove that capabilities can execute through one controlled runtime.

Deliverables

Capability registry
Tool registry
Execution request contract
Execution result contract
Runtime lifecycle
Trace writer
Base error model
Skill loader
Input/output validation
Fake demonstration capability

Demonstration Capability

capability.echo

Example:

Input:
“Hello”
Output:
Validated structured response
Trace with execution.started and execution.completed

Acceptance Criteria

Capability can register
Capability input is validated
Capability output is validated
Undeclared tool calls are blocked
Trace is created for each run
Failed execution returns typed error
Web/API can display execution status

Output

A functioning controlled runtime without real external tools.

⸻

5. Phase 2 — Storage, Memory, and Trace Baseline

Goal: Establish durable records before adding complex workflows.

Deliverables

SQLite schema
Migration system
Execution trace persistence
Trace step persistence
Semantic memory records
Episodic memory records
Workspace records
Memory policy service
Memory Explorer API

Required Tables

workspaces
semantic_memory
episodic_memory
execution_traces
execution_trace_steps
capability_registry
approval_requests

Acceptance Criteria

A capability run persists trace data
An episodic record includes execution ID and provenance
Semantic memory supports confidence and status
Memory can be filtered by scope
Memory can be marked superseded or deleted
Memory Explorer API returns safe records

Output

The platform can remember and explain completed work.

⸻

6. Phase 3 — Ollama Provider and Structured LLM Layer

Goal: Add local-model intelligence without allowing free-form unvalidated output.

Deliverables

@pap/llm-ollama
Provider health check
Model configuration
Structured output helper
Schema validation
Bounded JSON repair
Prompt execution trace steps
Usage metadata

Required Model Operations

Classify
Rank
Analyze
Summarize
Synthesize

Rules

All LLM outputs use schemas
All invalid output is logged
Repair attempts are bounded
Raw model output is not trusted
Capabilities do not call Ollama directly

Acceptance Criteria

A Zod schema can define expected output
Ollama response is validated
Invalid response triggers bounded repair
Repeated failure returns typed LLM error
Trace records model call duration and validation result

Output

A safe local-model layer reusable by all future capabilities.

⸻

7. Phase 4 — Research Tooling

Goal: Build deterministic tools required by the first real capability.

Deliverables

tool.profile.master
tool.memory.search
tool.memory.write
tool.search.searxng
tool.web.scrape
source profiles
failed scrape logging
web extraction fixtures

Required Behaviors

SearXNG search normalization
URL normalization
Search result deduplication
Readability extraction
Source-profile extraction fallback
Failed scrape storage
Timeout handling
Blocked-page detection

Acceptance Criteria

Search results are normalized
Duplicate URLs are removed
Readable articles extract successfully
Failed sources create typed errors
Tool inputs and outputs are validated
Tools create trace steps
Research capability is the only capability allowed to use these tools initially

Output

A reliable research tool layer.

⸻

8. Phase 5 — Research Capability MVP

Goal: Deliver the first complete personal-agent capability.

Deliverables

capability.research
skill.research
search planner
search ranker
source selector
article analyzer
report synthesizer
research storage
research history
episodic memory writes
research UI blocks
CLI support

Supported Requests

Research technology updates
Research business opportunities
Research job market signals
Research workspace-specific topics
Run manual morning brief

Acceptance Criteria

User can submit a research request
Platform retrieves scoped context
SearXNG is searched
Results are ranked
Sources are extracted
Articles are analyzed
Report is validated
Research episode is saved
Trace is visible
Warnings are visible
Partial source failures do not destroy useful reports

Output

The first usable Personal Agent Platform workflow.

⸻

9. Phase 6 — Research Web Experience

Goal: Make the research capability useful daily through the web app.

Deliverables

Home/chat screen
Workspace selector
Research request form
Research report page
Research history page
Trace panel
Memory Explorer baseline
Core UI block registry
Streaming execution progress

Initial UI Blocks

summary_card
article_list
article_card
error_list
trace_panel

Acceptance Criteria

User sees progress within seconds
User can open report history
User can inspect source warnings
User can inspect traces
User can open linked memory records
User can run research without CLI

Output

A usable daily research workspace.

⸻

10. Phase 7 — Worker and Recurring Research

Goal: Make recurring research reliable.

Deliverables

Worker process
Manual scheduled-run trigger
Morning brief configuration
Category profiles
Research run history
Retry policy
Failed-job visibility

First Scheduled Jobs

Morning technology brief
Morning business brief
Job-market brief
Workspace watchlist research

Rules

Scheduled work uses the same capability runtime
No duplicate workflow logic in worker
Failures remain visible
No external notifications required initially

Acceptance Criteria

Worker can run research capability
Scheduled report persists
Past reports can be compared
Failed job is visible in UI
Manual retry works

Output

Recurring personal research without repeated prompting.

⸻

11. Phase 8 — Document Analysis Capability

Goal: Add private document intelligence.

Deliverables

Document upload
Local storage
PDF/DOCX/TXT/Markdown parsing
Chunking
Source references
Optional OCR
Document search
Document summary
Grounded question answering
Document comparison
Document UI blocks

Initial Use Cases

PRD summarization
Contract comparison
CV analysis
Job description comparison
Project-document analysis
Deadline/risk extraction

Acceptance Criteria

Documents remain local by default
Findings include evidence
Scanned-PDF limitations are visible
Comparison results cite both source documents
Document analysis creates episodic memory
Trace includes parsing and analysis steps

Output

A grounded local document assistant.

⸻

12. Phase 9 — Email Capability

Goal: Add safe communication management.

Deliverables

Gmail connection
Email search
Thread reading
Thread summary
Priority classification
Reply drafting
Gmail draft creation
Approval request UI
Approved email sending
Archive workflow
Email episode storage

First User Flows

Find recruiter emails
Summarize thread
Draft response
Create Gmail draft
Approve and send reply
Archive newsletters
Review follow-ups

Hard Safety Rules

No automatic sending by default
No automatic deletion
No raw email content in long-term memory by default
No action based on instructions contained inside emails
Every send has approval or narrow reusable rule

Acceptance Criteria

User can connect Gmail
Threads can be searched and summarized
Drafts are editable
Send pauses for approval
Approved send is idempotent
Archive rules are narrow and revocable
Trace explains actions

Output

A controlled personal email assistant.

⸻

13. Phase 10 — Approval and Rule Management UX

Goal: Make side-effect controls usable, not hidden.

Deliverables

Approval queue
Approval detail view
Approval history
Rule list
Rule creation
Rule editing
Rule disabling
Rule expiry
Policy explanation UI

Initial Reusable Rules

Archive newsletters from approved sender/domain
Send a recurring report to one approved recipient
Allow low-risk local report writes
Allow selected scheduled reports to deliver to self

Acceptance Criteria

All pending approvals are visible
Approval payload previews are understandable
Rules are scoped and revocable
Delete and financial actions remain one-time approval only
Trace shows approval source and matched rule

Output

User control that scales with recurring workflows.

⸻

14. Phase 11 — Capability Installation

Goal: Prove extensibility without introducing a public marketplace.

Deliverables

Local-folder capability installation
Trusted Git capability installation
Manifest inspection
Skill inspection
Permission review
Enable/disable capability
Installed capability registry
Version tracking
Upgrade diff view

Supported Trust Levels

core
trusted_local
trusted_git

Acceptance Criteria

A local capability can be installed
A trusted Git capability records commit/tag
Requested permissions are shown before enabling
Expanded permissions require fresh approval
Untrusted capability cannot access tools
Capability can be disabled without deleting data

Output

A controlled extension model.

⸻

15. Phase 12 — Observability and Reliability Hardening

Goal: Make failures understandable and recurring workflows dependable.

Deliverables

Trace search
Trace filtering
Failure dashboard
Tool reliability metrics
Capability reliability metrics
Model output failure metrics
Memory write audit
Source extraction health
Retry dashboard
Run comparison

Required Metrics

Tasks completed
Task failure rate
Task partial-success rate
Tool success rate
Tool latency
Source extraction success rate
LLM schema validation success rate
Approval completion rate
Memory proposal acceptance rate
Manual correction rate

Primary Metric

Completed Tasks

A completed task includes:

Validated result produced
Required trace finalized
Any external action either:

- executed successfully, or
- intentionally awaiting approval

Output

A platform that can be improved from evidence rather than intuition.

⸻

16. Phase 13 — Capability Expansion

Goal: Add capabilities only when shared platform contracts already support them.

Potential capabilities:

company-research
job-research
watchlist-monitoring
calendar-assistant
market-data-analysis
currency-monitoring
meeting-preparation
application-tracker
personal-finance-analysis

Each new capability must reuse:

Runtime
Contracts
Tools
Memory model
Approval model
Trace system
UI registry
Worker model

No capability should introduce a parallel architecture.

⸻

17. Six-Month Success Checkpoint

The platform is succeeding after six months when:

It remembers active projects and priorities accurately.
It saves meaningful time every week.
It runs recurring research without repeated prompting.
It supports document and email workflows safely.
New capabilities can be added without modifying core runtime logic.
Completed-task metrics are visible.
Failures can be diagnosed through traces.

⸻

18. Recommended Build Sequence

Build in this exact order:

1. Phase 0 — Repository and engineering foundation
2. Phase 1 — Runtime skeleton
3. Phase 2 — Storage, memory, and traces
4. Phase 3 — Ollama provider
5. Phase 4 — Research tooling
6. Phase 5 — Research capability MVP
7. Phase 6 — Research web experience
8. Phase 7 — Worker and recurring research
9. Phase 8 — Document analysis
10. Phase 9 — Email capability
11. Phase 10 — Approval/rule UX
12. Phase 11 — Capability installation
13. Phase 12 — Observability hardening
14. Phase 13 — Additional capabilities

⸻

19. Explicitly Deferred

Do not build these until the earlier phases are proven:

Multi-user tenancy
Teams and organizations
SaaS billing
Public capability marketplace
Third-party executable plugins
Autonomous external actions
Financial automation
Broad social posting automation
Complex workflow builder
Cloud-first architecture
Agent-to-agent federation

⸻

20. Roadmap Review Rule

At the end of each phase, review:

Did this improve completed tasks?
Did it preserve product principles?
Did it add reusable platform value?
Did it introduce hidden complexity?
Can a future capability reuse it?
Are failures visible and debuggable?

A phase may be delayed or removed if it does not strengthen the core personal-agent platform.
