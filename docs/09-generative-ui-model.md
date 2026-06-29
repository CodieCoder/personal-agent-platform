Personal Agent Platform — Generative UI Model

Status: Foundational Platform Specification
Depends on:

- 01-product-foundation.md
- 02-product-principles.md
- 03-platform-architecture.md
- 04-runtime-and-contracts.md
- 05-capability-system.md
- 06-tool-system.md
- 07-memory-model.md
- 08-policy-and-approval-model.md

Purpose: Define how capabilities return structured UI intent, how the platform validates and renders it, how UI packages are added, and how users interact safely with agent-generated outputs.

⸻

1. Purpose

Personal Agent Platform needs interfaces that adapt to the work being done.

A research result may be best shown as:

article list
opportunity cards
timeline
comparison table
chart

An email task may be best shown as:

email thread
draft editor
approval dialog
action summary

A document task may be best shown as:

document summary
key facts table
risk list
comparison view

The platform must support flexible interfaces without allowing agents to generate arbitrary HTML, JSX, scripts, or uncontrolled actions.

The model should produce UI intent, not frontend code.

This follows the core idea behind json-render: the application defines a component catalog and validation rules, while the model produces constrained JSON that selects from those components. (GitHub)

⸻

2. Core UI Principle

The platform follows this flow:

Capability produces structured result
→ Capability proposes UI blocks
→ UI block schemas validate the data
→ Policy validates actions
→ React renderer resolves registered components
→ User interacts through safe API-backed actions

The platform must never allow:

Arbitrary HTML from models
Arbitrary JSX from models
Arbitrary CSS from models
Browser-side execution of model-generated scripts
Unvalidated hidden actions
Direct privileged tool calls from UI components

⸻

3. Architecture Overview

Capability Result
↓
UI Intent Builder
↓
UI Block Validation
↓
UI Action Validation
↓
json-render Catalog / Platform Registry
↓
React + TanStack Start Renderer
↓
Safe API Action Request
↓
Runtime / Approval Engine / Capability Execution

The UI system has four layers:

1. UI contracts
2. UI block registry
3. React renderer
4. Action routing and approval handling

⸻

4. json-render Integration Strategy

The platform will use json-render as the initial generative UI framework and compatibility layer.

json-render is built around a developer-defined catalog of components, actions, and validation functions. It supports rendering structured JSON progressively as the response arrives. (json-render)

The platform should not tightly couple all internal contracts to a single third-party framework.

Use this approach:

Platform UI contracts
→ adapter to json-render
→ React renderer

This allows future replacement or extension without changing capability output contracts.

4.1 Internal Contract First

Capabilities return platform-defined UiBlock objects.

Example:

{
"id": "block_01",
"type": "article_list",
"version": "1.0.0",
"data": {
"title": "Technology Signals",
"items": [
{
"title": "AI coding-agent release",
"source": "Example Source",
"summary": "What changed and why it matters.",
"url": "https://example.com/article"
}
]
},
"actions": []
}

The UI package maps this to a json-render component definition.

4.2 Why Not Let the Model Generate Raw UI

Schema-valid JSON alone is not enough to guarantee safe UX. A block can be technically valid but still expose confusing, misleading, or dangerous actions.

Therefore the platform must validate:

Block type
Block data schema
Action type
Action payload schema
Action visibility
Action permission requirements
Approval requirements
Destination/URL safety where applicable

Research on structured agent UI protocols has highlighted this distinction: syntactic validation alone does not prevent deceptive labels, unsafe bindings, or misleading workflow actions. (arXiv)

⸻

5. UI Package Structure

Recommended workspace structure:

packages/ui/
├── contracts/
├── renderer-react/
├── catalog-core/
├── blocks/
│ ├── summary-card/
│ ├── article-list/
│ ├── article-card/
│ ├── error-list/
│ ├── trace-panel/
│ ├── approval-dialog/
│ ├── data-table/
│ ├── metric-chart/
│ ├── email-thread/
│ ├── draft-editor/
│ ├── document-summary/
│ └── job-card/
│
└── adapters/
└── json-render/

Suggested package names:

@pap/ui-contracts
@pap/ui-renderer-react
@pap/ui-catalog-core
@pap/ui-json-render-adapter
@pap/ui-block-summary-card
@pap/ui-block-article-list
@pap/ui-block-approval-dialog

⸻

6. UI Block Contract

Every UI block must have:

Type
Version
Data schema
Action schema
Renderer
Fallback behavior
Capability compatibility

Example definition:

import { z } from "zod";
export const articleListDataSchema = z.object({
title: z.string(),
description: z.string().optional(),
items: z.array(
z.object({
id: z.string(),
title: z.string(),
source: z.string().optional(),
url: z.string().url().optional(),
summary: z.string(),
tags: z.array(z.string()).default([]),
score: z.number().min(0).max(10).optional()
})
)
});
export type ArticleListData = z.infer<
typeof articleListDataSchema

> ;
> export const articleListBlockDefinition = {
> type: "article_list",
> version: "1.0.0",
> schema: articleListDataSchema,
> allowedActions: [

    "open_link",
    "run_capability",
    "view_trace"

],
fallbackType: "summary_card"
};

⸻

7. Initial UI Block Catalog

Version one should start small.

7.1 Core Blocks

summary_card
article_list
article_card
error_list
trace_panel
approval_dialog

7.2 First Expansion Blocks

data_table
metric_card
metric_chart
timeline
job_card
email_list
email_thread
draft_editor
document_summary
comparison_table

7.3 Later Blocks

gallery
map
kanban
calendar_view
workflow_graph
source_profile_editor
memory_graph

The first version should not try to support every data visualization type.

⸻

8. UI Block Selection

Capabilities may select UI blocks only from the list declared in their manifest.

Example:

supportedUiBlocks: [
"summary_card",
"article_list",
"article_card",
"error_list"
]

The runtime must reject blocks that are:

Not registered
Not allowed for the capability
Using unsupported versions
Failing schema validation
Containing unapproved actions

A capability should return a text fallback when no rich UI block is suitable.

⸻

9. UI Action Model

UI actions are declarative instructions for the frontend.

They never execute privileged work directly in the browser.

Examples:

Open article
Open report
Run follow-up capability
Draft email
Request approval
Approve action
Reject action
Open trace
Open memory record
Review failed source

Example action:

{
"id": "action_open_article",
"label": "Open source",
"type": "link",
"payload": {
"url": "https://example.com/article"
}
}

Example capability action:

{
"id": "action_research_company",
"label": "Research company",
"type": "capability",
"payload": {
"capabilityId": "capability.company-research",
"input": {
"company": "Example Company"
}
}
}

Example approval action:

{
"id": "action_approve_send",
"label": "Approve send",
"type": "approval",
"payload": {
"approvalId": "approval_123",
"decision": "approved"
}
}

⸻

10. UI Action Safety Rules

Every action must be validated by the backend.

The browser must not be trusted to decide whether an action is allowed.

10.1 Link Actions

Validate:

URL protocol
Allowed domain rules where relevant
No javascript: URLs
No hidden data URLs
No unsafe redirect targets

10.2 Capability Actions

Validate:

Capability exists
Capability is enabled
User has access
Input matches schema
Current workspace/thread scope is valid

10.3 Tool Actions

The frontend should rarely invoke a tool action directly.

Preferred model:

UI action
→ API request
→ capability execution
→ runtime validates tool access

10.4 Approval Actions

Validate:

Approval exists
Approval belongs to current user
Approval is pending
Approval is not expired
Decision is valid

⸻

11. Human-in-the-Loop UI

The UI must actively support user control.

Important interactions include:

Review result
Inspect sources
Open trace
Approve action
Reject action
Edit draft
Correct memory
Pin result
Save opportunity
Mark irrelevant
Retry failed task

Human-in-the-loop interfaces are especially important for agents that can browse, execute tools, and act on real-world systems. Research on agentic interfaces emphasizes interaction patterns such as co-planning, action guards, and long-term memory review. (arXiv)

The product should not make approval feel like a technical exception.

Approval and review are normal product interactions.

⸻

12. Execution Trace UI

Trace visibility is a required product feature.

The UI should support a compact and detailed view.

12.1 Compact Trace

Show:

Capability used
Current status
Tools used
Warnings
Approval state
Duration

12.2 Detailed Trace

Show:

Capability version
Skill version
Workflow steps
Tool calls
Validation outcomes
Memory reads/writes
Approval events
Errors
Retry attempts
Output blocks

Raw sensitive payloads should be hidden or redacted by default.

⸻

13. Streaming and Real-Time Updates

The web app should receive execution updates while work runs.

TanStack Start supports typed server functions and streaming using ReadableStream or async generators, which is suitable for showing capability progress in the web app. (TanStack)

The platform should use a platform event model, then optionally adapt it to AG-UI-compatible events.

AG-UI is an open, event-based protocol for agent-to-frontend communication, covering messages, tool calls, lifecycle events, and state updates. (GitHub)

13.1 Initial Event Types

execution.started
execution.progress
execution.warning
execution.awaiting_approval
execution.completed
execution.failed
tool.started
tool.completed
tool.failed
ui.block_added
ui.block_updated
approval.created
approval.updated
trace.step_added

13.2 Initial Transport

Version one may use:

Server-Sent Events
ReadableStream
TanStack Start streaming server functions

WebSockets can be added later if bidirectional real-time interaction becomes necessary.

⸻

14. Platform Event Contract

Recommended internal event shape:

type PlatformUiEvent = {
id: string;
executionId: string;
type:
| "execution.started"
| "execution.progress"
| "execution.warning"
| "execution.awaiting_approval"
| "execution.completed"
| "execution.failed"
| "tool.started"
| "tool.completed"
| "tool.failed"
| "ui.block_added"
| "ui.block_updated"
| "approval.created"
| "approval.updated"
| "trace.step_added";
timestamp: string;
data: unknown;
};

The platform should avoid making AG-UI a hard runtime dependency initially.

Instead:

Internal event contract
→ AG-UI adapter when needed
→ frontend streaming transport

This keeps the core platform flexible while allowing interoperability later.

⸻

15. UI Data Binding Rules

UI blocks should receive only the data they need.

Do not pass entire tool responses or raw personal memory into frontend block props.

Example:

Bad:

{
"type": "article_list",
"data": {
"rawAgentContext": "...",
"fullToolResponse": "...",
"allMemoryRecords": []
}
}

Good:

{
"type": "article_list",
"data": {
"title": "Technology Signals",
"items": [
{
"title": "Article title",
"summary": "Relevant summary",
"url": "https://..."
}
]
}
}

This limits accidental data leakage.

⸻

16. Capability-to-UI Mapping

Capabilities should produce UI based on task result, not visual novelty.

Examples:

Research:
summary_card
article_list
opportunity cards
error list
Email:
email list
thread reader
draft editor
approval dialog
Document analysis:
document summary
key facts table
comparison table
risk list
Company research:
company summary
market chart
timeline
article list
Jobs:
job cards
fit comparison table
application action list

The LLM may recommend a UI block, but the capability should apply deterministic rules where obvious.

Example:

More than 3 comparable records:
Use comparison_table.
Time-series data:
Use metric_chart.
Single decision requiring confirmation:
Use approval_dialog.
List of sources:
Use article_list.

⸻

17. UI Fallback Strategy

Every block should define fallback behavior.

Examples:

metric_chart fails validation
→ render data_table
article_list has no valid items
→ render summary_card
unsupported block type
→ render generic_result_block
approval dialog unavailable
→ render safe text action with no execution path

The platform must degrade safely.

Never silently discard important approval or error information.

⸻

18. UI Package Contribution Model

UI packages should be independently installable later.

Each UI block package must include:

Block manifest
Zod data schema
React renderer
Action definitions
Examples
Tests
Accessibility notes
Version
Fallback type

Example package:

packages/ui/blocks/job-card/
├── package.json
├── src/
│ ├── manifest.ts
│ ├── schema.ts
│ ├── JobCard.tsx
│ ├── actions.ts
│ └── index.ts
├── examples/
├── tests/
└── README.md

Version one should allow only core UI packages.

Trusted external UI packages can be considered later.

⸻

19. Accessibility Requirements

Every UI block must support:

Keyboard navigation
Clear labels
Semantic HTML
Screen-reader-friendly actions
Visible focus state
Color-independent meaning
Error messages in text
Approval actions with explicit consequences

Generated UI should not be allowed to hide important safety information behind visual styling.

⸻

20. Privacy Requirements for UI

The UI must avoid exposing sensitive data unnecessarily.

Examples:

Mask email addresses in broad overview lists where possible.
Redact credentials and tokens.
Hide sensitive tool payloads in default trace view.
Require explicit reveal for private document snippets.
Avoid rendering full sensitive memory records unless requested.

UI blocks must respect the sensitivity level attached to their data.

⸻

21. Initial V1 Scope

Version one should implement:

json-render integration or adapter
Platform UI block contract
Core UI registry
summary_card
article_list
article_card
error_list
trace_panel
approval_dialog
Basic streaming execution updates
Safe action routing
UI schema validation
Fallback rendering

Do not implement yet:

Visual UI builder
Arbitrary layout generation
Third-party UI marketplace
User-created component catalog
Advanced dashboard builder
Interactive graph editor
Cross-device synchronized UI state

⸻

22. Acceptance Criteria

The generative UI system is complete for v1 when:

1. Capabilities return validated UI block intent.
2. Only registered block types render.
3. UI block data is validated before rendering.
4. Capabilities cannot return unsupported block types.
5. Browser actions route through the backend.
6. Privileged actions cannot execute directly from frontend payloads.
7. Approval dialogs are clear and safe.
8. Traces can stream into the UI.
9. The UI can display partial progress and failures.
10. A fallback exists for invalid or unsupported blocks.
11. Sensitive data is redacted or minimized by default.
12. Core blocks work with the research capability.
13. The design remains compatible with plug-in UI packages.
