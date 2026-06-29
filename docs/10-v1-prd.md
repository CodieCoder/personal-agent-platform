Personal Agent Platform — V1 Product Requirements Document

Status: Buildable V1 PRD
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

Purpose: Define the first usable vertical slice of Personal Agent Platform.

⸻

1. V1 Objective

Build a local-first personal research agent that can:

Accept a research request
Retrieve relevant personal/project context
Search the web through SearXNG
Rank and select useful sources
Scrape and extract article content
Analyze selected content using Ollama
Generate a structured report
Save useful episodic memory
Show validated UI blocks
Expose execution traces
Handle partial failures safely

The V1 goal is not to build a complete personal assistant.

The V1 goal is to prove that the platform architecture supports a reliable, reusable capability end to end.

⸻

2. Primary User Outcome

The user should be able to ask:

Research AI coding-agent updates that may affect QA Intel.

And receive:

A structured summary
Relevant articles
Why each article matters
Potential opportunities or risks
A saved research episode
A visible execution trace
Warnings for failed sources

The user should not need to manually repeat:

Their product context
Their research preferences
Their business interests
Their technical background
Their desired report format

⸻

3. V1 Scope

V1 includes:

Monorepo foundation
React + TanStack Start web app
API/runtime layer
Worker process
SQLite persistence
Ollama provider
Research capability
SearXNG search tool
Web scraping/extraction tool
Profile/context retrieval
Basic semantic and episodic memory
Execution traces
Core UI block registry
Streaming progress updates
Memory Explorer baseline

V1 excludes:

Email capability
Document analysis capability
Calendar support
Financial tools
Public plugin marketplace
Trusted Git capability installation
External third-party capability execution
Multi-user support
Team workspaces
Complex approval rules
Cloud-first deployment

⸻

4. V1 User Flows

4.1 Research Request

User enters request
→ system routes to capability.research
→ runtime validates input
→ relevant personal/workspace context is retrieved
→ SearXNG search runs
→ results are ranked
→ selected pages are scraped
→ content is analyzed
→ report is generated
→ episodic memory is stored
→ UI blocks render
→ trace completes

⸻

4.2 Scheduled Morning Brief

Worker starts scheduled research job
→ capability.research runs with saved category configuration
→ report is stored
→ report appears in dashboard/history
→ failed sources are recorded

The first implementation may expose this as a manual “Run Morning Brief” action before enabling cron scheduling.

⸻

4.3 Trace Review

User opens completed research report
→ sees compact trace
→ expands detailed trace
→ sees tools used
→ sees warnings
→ sees failed source extraction
→ sees memory writes
→ sees report completion state

⸻

4.4 Memory Review

User opens Memory Explorer
→ sees saved research episodes
→ opens one episode
→ views source execution and evidence
→ edits or deletes memory where needed

⸻

5. V1 Capability: capability.research

5.1 Capability Purpose

The research capability gathers, evaluates, analyzes, and presents relevant public information using personal context and approved tools.

5.2 Inputs

type ResearchRequest = {
request: string;
category?: "business" | "technology" | "jobs";
depth?: "quick" | "normal" | "deep";
workspaceId?: string;
threadId?: string;
maxSources?: number;
};

5.3 Defaults

category: technology
depth: normal
maxSources: 8

5.4 Outputs

type ResearchResult = {
title: string;
executiveSummary: string;
findings: Array<{
id: string;
title: string;
source: string;
url: string;
publishedAt?: string;
relevanceScore: number;
importanceScore: number;
summary: string;
whyItMatters: string;
tags: string[];
}>;
opportunities: Array<{
title: string;
type: "opportunity" | "risk" | "watch";
explanation: string;
recommendedAction?: string;
}>;
warnings: Array<{
code: string;
message: string;
}>;
status:
| "completed"
| "completed_with_warnings"
| "failed";
};

⸻

6. Research Workflow

The V1 research workflow must be deterministic where possible.

1. Validate request
2. Resolve workspace/project context
3. Retrieve relevant personal preferences
4. Generate or select search queries
5. Search SearXNG
6. Normalize results
7. Rank results with Ollama
8. Select top sources
9. Scrape/extract source content
10. Analyze extracted articles with Ollama
11. Generate final report with Ollama
12. Validate structured output
13. Store episodic memory
14. Build UI blocks
15. Finalize trace

6.1 Workflow Limits

Maximum search queries per run: 5
Maximum search results fetched: 30
Maximum pages scraped in normal mode: 8
Maximum pages scraped in deep mode: 15
Maximum retry attempts per source: 1
Maximum LLM repair attempts per structured response: 2

The platform must not continue indefinitely when sources fail or models return invalid output.

⸻

7. Context Retrieval

The research capability should retrieve only relevant context.

Required profile retrieval

newsPreference
businessInterest
professionalCareer
basic

Workspace retrieval

When workspaceId exists, retrieve:

Workspace name
Description
Current goals
Relevant technical stack
Prior research
Pinned memories
Related watchlists

Context rule

Do not inject the full user profile or all memory into the model prompt.

Use concise structured summaries.

⸻

8. Initial Tools

V1 includes only these tools.

8.1 tool.profile.master

Purpose:

Retrieve selected personal profile sections.

Permissions:

profile.read

⸻

8.2 tool.memory.search

Purpose:

Search scoped semantic and episodic memory.

Permissions:

memory.read

⸻

8.3 tool.memory.write

Purpose:

Store low-risk research episodes and proposed semantic memory.

Permissions:

memory.write

⸻

8.4 tool.search.searxng

Purpose:

Search a configured SearXNG instance.

Permissions:

web.search

Constraints:

Public web search only
Normalized result format
No raw provider payload returned to capability

⸻

8.5 tool.web.scrape

Purpose:

Fetch and extract readable content from an approved public URL.

Permissions:

web.fetch

Extraction strategy:

1. Check source profile
2. Fetch page
3. Use known selectors if configured
4. Apply Readability extraction
5. Fall back to generic content extraction
6. Validate usable text length
7. Return normalized article

⸻

9. Ollama Requirements

Ollama is the only LLM provider required in V1.

Required LLM jobs:

Search result ranking
Article analysis
Final report generation
Optional query refinement

All model outputs must be schema validated.

9.1 Required structured outputs

SearchRankResult
ArticleAnalysis
ResearchReport

9.2 Model policy

Use smaller local model by default.
Use low temperature for ranking and structured extraction.
Use bounded prompts.
Use schema-constrained output.
Do not permit model-generated arbitrary tool calls.

9.3 Failure behavior

Invalid model output:
Retry with bounded repair prompt.
Repeated invalid output:
Return partial result with warning or fail safely.
Ollama unavailable:
Mark run failed with actionable error.

⸻

10. Storage Requirements

Initial storage uses SQLite.

Required tables:

workspaces
semantic_memory
episodic_memory
research_runs
research_findings
source_profiles
failed_scrapes
execution_traces
execution_trace_steps
capability_registry
approval_requests

10.1 Required research_runs fields

id
workspace_id
request
category
depth
status
started_at
completed_at
summary
warnings_json
execution_id

10.2 Required source_profiles fields

id
domain
title_selector
body_selector
author_selector
published_at_selector
last_success_at
last_failure_at
failure_count
notes

10.3 Required failed_scrapes fields

id
url
domain
reason
http_status
execution_id
created_at
retryable

⸻

11. Memory Requirements

11.1 Automatic Writes

The system may automatically save:

Research run completed
Research report summary
Source extraction failure
Source profile success/failure statistics
Finding references
Opportunity records with evidence

11.2 Proposed Writes

The system should propose, not automatically persist:

New long-term user preference
New career preference
New business direction
New personal priority
Inferred strategic interest

11.3 Memory Explorer V1

The user must be able to:

View research episodes
View provenance
View workspace/project scope
Delete an episode
Mark an episode irrelevant
Open the linked report

Semantic-memory editing can be basic in V1.

⸻

12. UI Requirements

The V1 web app uses React + TanStack Start.

The primary screens are:

Home / Chat
Research Report
Research History
Memory Explorer
Trace Viewer
Settings

12.1 Home / Chat

Must support:

Research request input
Workspace selection
Research category selection
Depth selection
Run status
Recent reports

12.2 Research Report

Must render:

summary_card
article_list
article_card
error_list
trace_panel

12.3 Research History

Must show:

Past research runs
Status
Date
Category
Workspace
Warnings
Open report action

12.4 Trace Viewer

Must show:

Capability
Skill
Workflow steps
Tool calls
Warnings
Memory writes
Errors
Duration
Final status

Sensitive raw payloads should remain hidden by default.

⸻

13. Streaming Requirements

The web app must receive progress updates while research runs.

Required events:

execution.started
execution.progress
tool.started
tool.completed
tool.failed
execution.warning
ui.block_added
execution.completed
execution.failed

Example progress messages:

Loading relevant project context
Searching the web
Ranking 24 results
Extracting 8 selected articles
Analyzing articles
Building research report
Saving research history

The user must not see only a blank loading state for long tasks.

⸻

14. Capability Registry Requirements

V1 supports only core capabilities.

Required registry behavior:

Register capability.research
Validate manifest
Enable/disable capability
Expose capability metadata
Reject missing skill folder
Reject unknown tools
Reject unsupported UI blocks

V1 does not require local-folder or Git capability installation to be exposed through UI yet.

The architecture should keep this possible later.

⸻

15. Error Handling

The research capability must tolerate partial failure.

Example:

Search results found: 30
Selected sources: 8
Successfully extracted: 6
Failed sources: 2
Report generated: yes
Final status: completed_with_warnings

The report should still be useful.

Required user-facing error states:

SearXNG unavailable
Ollama unavailable
No search results
All sources failed extraction
Some sources failed extraction
Invalid model output
SQLite unavailable
Capability registration failure

⸻

16. V1 Non-Functional Requirements

Privacy

Sensitive local memory remains local by default.
No external LLM required.
No cloud database required.
No raw credentials exposed in traces or UI.

Reliability

Every tool call is schema validated.
Every model output is schema validated.
Every run has a trace.
Every failure produces safe actionable feedback.

Performance Targets

Initial targets:

Quick research run: under 60 seconds where possible
Normal research run: under 180 seconds where possible
Deep research run: under 420 seconds where possible
UI first progress event: under 2 seconds after run start

These are development targets, not strict production SLAs.

Local Runtime

Must run on Mac.
Must support Linux self-hosting.
Must run with local Ollama.
Must support Docker for self-hosted deployment.

⸻

17. Suggested Repository Milestone Order

Milestone 1 — Monorepo Bootstrap

Create pnpm workspace
Add Turborepo
Create apps/web
Create apps/api
Create apps/worker
Create @pap/contracts
Create @pap/shared
Add lint, typecheck, test, build scripts

Acceptance:

pnpm install works
pnpm build works
pnpm typecheck works
pnpm test works

⸻

Milestone 2 — Runtime Skeleton

Create capability registry
Create tool registry
Create execution contract
Create trace writer
Create base error model
Register a fake sample capability

Acceptance:

A sample capability can execute through runtime.
Undeclared tool calls are rejected.
Trace starts and finalizes.

⸻

Milestone 3 — SQLite and Memory

Add SQLite adapter
Add migrations
Store semantic memory
Store episodic memory
Store execution traces
Add minimal Memory Explorer API

Acceptance:

Research episode can be stored.
Episode includes provenance and execution ID.
Memory record can be retrieved by workspace.

⸻

Milestone 4 — Ollama Provider

Add Ollama client
Add structured output support
Add bounded repair logic
Add model configuration
Add provider health check

Acceptance:

A Zod schema can be supplied.
Valid structured response is returned.
Invalid output is handled safely.
Provider failure appears in trace.

⸻

Milestone 5 — Research Tools

Build SearXNG search tool
Build scraper/extractor tool
Build source profile storage
Build failed scrape logging

Acceptance:

Search results are normalized.
Valid article extraction works.
Failed extraction is logged.
Tool output passes schema validation.

⸻

Milestone 6 — Research Capability

Create capability.research package
Create research skill folder
Implement workflow
Implement ranking
Implement article analysis
Implement final report generation
Store research episode

Acceptance:

User request produces validated research result.
Partial failures produce warnings.
Research run persists.
Trace includes every workflow stage.

⸻

Milestone 7 — Web UI

Create home/chat page
Create report page
Create history page
Create trace panel
Create Memory Explorer
Create UI block registry
Add streaming progress events

Acceptance:

User can submit request.
User sees progress.
User receives structured report.
User can inspect trace.
User can view saved research history.

⸻

Milestone 8 — Worker and Morning Brief

Add worker execution
Add manual scheduled-job trigger
Add morning brief configuration
Add report history

Acceptance:

Worker invokes same research capability.
Report appears in history.
Failure is visible in UI and trace.

⸻

18. V1 Acceptance Tests

V1 is complete when all tests below pass.

Research Completion

Given a valid research request
When the user runs research
Then the system returns a validated report
And saves a research episode
And renders summary/article/error/trace UI blocks
And records an execution trace

Partial Failure

Given some source URLs fail extraction
When the research report is generated
Then the system returns completed_with_warnings
And lists failed sources
And preserves successful findings
And stores source failure records

Tool Restriction

Given capability.research
When it attempts to call an undeclared tool
Then runtime rejects the call
And records TOOL_NOT_ALLOWED in trace

Invalid LLM Output

Given Ollama returns invalid structured output
When repair attempts fail
Then the run returns safe failure or partial result
And trace records LLM_OUTPUT_INVALID

Memory Provenance

Given a completed research run
When an episodic memory record is created
Then it includes capability ID
And execution ID
And source references
And created timestamp

UI Validation

Given a capability returns an unsupported UI block
When the runtime validates output
Then the block is rejected
And a safe fallback or error result is returned

Offline Limitation

Given internet access is unavailable
When user runs web research
Then the system reports web search unavailable
And local memory/history remains accessible

⸻

19. V1 Definition of Done

V1 is done when the user can reliably:

Open the web app
Submit a research request
Select a workspace and category
Watch real-time progress
Receive a structured report
Review sources and warnings
Inspect execution trace
View saved research history
View related memory
Run a manual morning briefing
Use the system entirely with local Ollama, SQLite, and SearXNG

The system must demonstrate that a new capability can later reuse:

Runtime
Contracts
Tools
Memory
Traces
UI blocks
Streaming
Storage
LLM provider abstraction

without changing core runtime behavior.

⸻

20. Immediate Next PRDs

After V1 is accepted, create:

11-research-capability-prd.md
12-email-capability-prd.md
13-document-analysis-capability-prd.md
14-roadmap.md

The next document should be 11-research-capability-prd.md, which expands the research workflow into exact prompts, schemas, database records, CLI commands, source extraction logic, and test fixtures.
