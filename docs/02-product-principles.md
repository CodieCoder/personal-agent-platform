Personal Agent Platform — Product Principles

Status: Foundational Product Policy
Depends on: 01-product-foundation.md
Purpose: Define the non-negotiable rules that guide product, architecture, capability, memory, UI, and tool decisions.

⸻

1. Why This Document Exists

Personal Agent Platform will grow through capabilities, tools, skills, memory adapters, UI blocks, and external integrations.

Without shared principles, that growth can drift into:

- A generic chatbot wrapper.
- An uncontrolled autonomous agent.
- A collection of disconnected scripts.
- A system that stores incorrect memories.
- A platform that exposes private data or performs actions without enough control.

This document defines the rules future PRDs, technical designs, and capability packages must follow.

Where another document conflicts with these principles, this document wins unless it is deliberately updated.

⸻

2. Principle One: Deterministic Where Possible

Use deterministic code, schemas, validators, tools, and workflows whenever the task has a reliable non-LLM solution.

Use LLMs only where judgment is genuinely needed.

2.1 LLMs are appropriate for

Ranking
Classification
Summarization
Interpretation
Planning within bounded workflows
Selecting from approved options
Generating drafts
Choosing an appropriate UI block from a known catalog

2.2 LLMs are not appropriate for

Database writes
Permission checks
Approval decisions
Rendering arbitrary HTML or JSX
Executing destructive actions
Accessing tools outside declared capability permissions
Inventing URLs, tool arguments, or facts
Replacing schema validation

2.3 Required design rule

Every capability design must answer:

Which parts are deterministic?
Which parts require model judgment?
Why can those LLM decisions not be replaced by code?
How are LLM outputs validated before use?

2.4 Example

Bad:

Ask the model to read emails, decide who to contact, write a reply,
send it, and update memory.

Good:

Search emails deterministically.
Read selected threads through a typed tool.
Use the model to classify urgency and draft a reply.
Validate the draft structure.
Require approval before sending.
Store the outcome as an episode.

⸻

3. Principle Two: Least Privilege and Explicit Permissions

Capabilities must only access the minimum tools, data, and permissions required for the task.

This is required because agent systems are vulnerable to prompt injection, tool misuse, excessive permissions, and unintended data exposure. OWASP specifically identifies prompt injection, tool abuse, privilege escalation, and data exfiltration as key risks for AI agents. (cheatsheetseries.owasp.org)

3.1 Capability permissions must be declared

Every capability manifest must explicitly list:

Allowed tools
Required permissions
Data scopes
External network access
Memory read/write access
Side effects
Approval requirements
UI blocks it may return

Example:

permissions: [
"profile.read",
"memory.read",
"web.search",
"web.fetch"
]

A capability must not gain access to unrelated permissions merely because another capability needs them.

3.2 Tool permissions must be task-scoped

A tool call should be authorized against:

Current capability
Current task
Declared permission
User approval state
Data scope
Side-effect level

Do not use broad standing permissions where a task-scoped permission is possible.

3.3 Side-effect levels

Every tool must declare one of these classes:

none
draft
write
delete
external_publish
financial

Examples:

searchSearxng: none
draftEmail: draft
saveLowRiskNote: write
sendEmail: external_publish
deleteDocument: delete
payInvoice: financial

3.4 Default deny

If a capability does not declare a tool or permission, it cannot use it.

If a tool call is malformed, outside task scope, or lacks required approval, the runtime must reject it.

⸻

4. Principle Three: User Control Before Side Effects

The system may prepare, recommend, draft, and queue actions.

It must not silently take meaningful external or destructive actions.

4.1 Always require confirmation

Send email
Delete email, documents, or stored data
Publish externally
Post to social platforms
Spend money
Modify calendar events
Share private data
Export sensitive information
Run destructive scripts

4.2 Reusable approval rules are allowed

The user may create scoped approval rules.

Examples:

Automatically archive newsletters from approved senders.
Send this weekly report to this exact recipient.
Allow calendar reminders created by the planning capability.
Never send external email without one-time approval.

Approval rules must be:

Explicit
Scoped
Inspectable
Editable
Revocable
Logged

4.3 Approval is part of task completion

A task can be considered completed when:

The capability produced a validated result,
and any required action is either:

- completed, or
- intentionally waiting for user approval.

The system must distinguish:

completed
awaiting_approval
rejected
failed
cancelled

⸻

5. Principle Four: Memory Must Be Attributable, Inspectable, and Reversible

Memory is a system of record, not hidden context.

The platform must never become “smarter” by silently accumulating unverified assumptions.

5.1 Every memory record needs metadata

Source
Capability
Confidence
Scope
Created time
Updated time
Expiry where applicable
Evidence references
Write reason
Sensitivity level

5.2 Memory categories must remain separate

Semantic memory:
Facts and durable user/entity knowledge.
Episodic memory:
Past events, decisions, outcomes, runs, and interactions.
Procedural memory:
Skills, rules, workflows, examples, and capability behavior.

Do not store workflow instructions as random semantic facts.

Do not treat one-off conversation statements as permanent user facts without confidence or approval.

5.3 Memory writes follow a hybrid policy

Low-risk, stable, high-confidence facts:
May be stored automatically.
Sensitive, ambiguous, consequential, or long-lived facts:
Require user approval or proposal.
Research outcomes:
Store as episodic memory with source evidence.
Workflow changes:
Update procedural memory only through reviewed skill/capability changes.

5.4 Retrieval must be purposeful

The model should not receive an entire user profile on every task.

It should request specific context through tools such as:

getMasterProfile(...)
searchVectorDb(...)
getWorkspaceContext(...)
getCapabilityHistory(...)

This keeps small local models focused and reduces irrelevant context.

⸻

6. Principle Five: Skills Define How Work Is Done

Capabilities must be guided by portable, versioned skills.

Skills should follow the Agent Skills pattern where practical: a folder centered on SKILL.md, with metadata, instructions, and optional supporting scripts or reference material. (agentskills.io)

6.1 Every skill must define

Purpose
When to use it
Inputs
Outputs
Strict workflow order
Allowed tools
Tool call limits
Validation rules
Failure behavior
Examples

6.2 Small-model rule

Local or smaller models must not be given broad freedom to improvise workflow steps.

They should receive:

One capability goal
A narrow allowed toolset
A strict order of operations
Maximum tool call limits
Structured output schema
Examples where useful

6.3 Progressive disclosure

Skill loading should use layers:

Manifest metadata first
SKILL.md when capability is selected
Reference docs only when needed
Examples only when useful

This preserves context budget and reduces confusion.

⸻

7. Principle Six: Capabilities Are Composable but Bounded

A capability may use tools, other capabilities, skills, memory, and UI blocks.

But composition must remain visible and controlled.

7.1 A capability may compose

Tools
Sub-capabilities
Shared skills
Memory services
UI blocks
Validators
Approval requests

7.2 A capability must still expose

Its purpose
Input schema
Output schema
Allowed dependencies
Side effects
Permissions
Approval policy
Memory policy
Trace behavior

7.3 Example

Company Research Capability
├── search-web
├── scrape-url
├── analyze-news
├── get-company-market-data
├── search-vector-db
├── save-insight
└── render-company-dashboard

The outer capability owns the workflow and validates the final result.

⸻

8. Principle Seven: Structured Outputs Before Presentation

Capabilities should return validated structured data first.

Presentation is a separate responsibility.

8.1 Required flow

Tools return typed data
→ capability produces validated structured result
→ UI intent is generated
→ UI block data is validated
→ frontend renders known components

8.2 Never allow arbitrary UI code

Agents must not generate arbitrary HTML, JSX, CSS, or executable frontend code for runtime rendering.

Instead, agents select from a registered component catalog.

This is the model used by constrained generative UI systems such as json-render, where AI can generate within components defined by the developer. (GitHub)

8.3 UI blocks must be typed

Examples:

summary_card
article_list
job_opportunity_card
comparison_table
metric_chart
timeline
email_thread
draft_editor
approval_dialog
document_summary
error_list

Each block must define:

Type
Version
Schema
Supported actions
Renderer
Fallback behavior

⸻

9. Principle Eight: Traceability Is a Product Feature

The platform must explain what it did.

Execution traces are not only for debugging. They are part of user trust.

9.1 Every run should record

Request
Capability selected
Skill version
Tools used
Permission checks
Memory reads
Memory writes
Validation outcomes
Approval requests
Errors
Final output

9.2 Trace visibility

Traces should be visible in the interface and toggleable.

Default user-facing views should remain understandable.

Developer or advanced views may expose deeper technical details.

9.3 Error handling

Failures should be specific and actionable.

Bad:

Research failed.

Good:

Research completed with partial results.
3 of 12 URLs could not be extracted.
Review failed sources in the Errors workspace.

⸻

10. Principle Nine: Privacy by Default, External Services by Choice

Sensitive information should remain local or self-hosted by default.

This includes:

Email contents
Documents
Personal memory
Project notes
Private reports
Credentials
Execution traces

10.1 External access must be explicit

A capability must declare when it needs:

Internet search
External API access
Remote model inference
Cloud vector retrieval
External scraping service
Third-party storage

The user should be able to see and control this.

10.2 Local-first does not mean local-only

The platform may use remote services where they improve results or reduce maintenance burden.

Examples:

Frontier LLMs
Firecrawl
Cloud vector databases
Currency APIs
Market-data APIs
Hosted email providers

But local-compatible alternatives should remain possible where practical.

⸻

11. Principle Ten: Extensibility Without Trust Blindness

The platform should support reusable capability and UI packages.

It must not blindly trust package instructions, manifests, or tool definitions.

OWASP has published dedicated guidance for agentic skills, and agentic security guidance emphasizes risks from prompt injection, unsafe tool use, and over-permissioned agents. (owasp.org)

11.1 Initial capability trust levels

core
trusted_local
trusted_git
reviewed_community
untrusted

Version one should support:

core
trusted_local
trusted_git

11.2 Third-party capability restrictions

At first, external capabilities should be declarative and permission-scoped.

They may provide:

Manifest
SKILL.md
Schemas
Examples
UI block references
Tool requirements
Workflow definitions

They should not receive unrestricted executable access by default.

11.3 Installation review

Before installation, show:

Capability name
Source repository
Version
Requested tools
Requested permissions
Network access
Data access
Side effects
Approval behavior
UI blocks
Skill files

⸻

12. Product Review Checklist

Every new PRD, capability, tool, UI block, or memory feature must answer these questions.

Determinism

Can this be solved reliably without an LLM?
Which parts require model judgment?
How is model output validated?

Permissions

What tools are required?
What is the minimum permission set?
What data scopes are involved?
What side effects exist?

Approval

Which actions require confirmation?
Can approval be scoped into reusable rules?
What happens if approval is not granted?

Memory

What memory is read?
What memory is written?
Why should it persist?
What is the source and confidence?
Can the user inspect and remove it?

UI

What structured result is returned?
Which registered UI blocks are used?
What actions can the user take?
What is the fallback if a UI block fails validation?

Reliability

What happens when a tool fails?
Can partial results still be useful?
How is failure logged?
How can the user correct or improve the workflow?

⸻

13. Non-Goals Reinforced

The platform must not optimize for:

Maximum autonomy
Maximum tool access
Hidden memory accumulation
Unreviewed third-party code execution
Prompt-only workflows
Free-form AI-generated frontend code
Feature count over reliability
SaaS/multi-user complexity before personal usefulness

The product should optimize for:

Reliable completed tasks
Privacy
Clear user control
Composable capabilities
Accurate memory
Useful traces
Reusable skills
Validated UI

⸻

14. Definition of Done for Future Features

A feature is not complete merely because it works in a demo.

A feature is complete when it has:

Clear product purpose
Typed input/output schemas
Permission model
Approval behavior
Memory behavior
Structured UI output
Trace coverage
Error behavior
Tests
Documentation
Compatibility with the product foundation

⸻

15. Change Control

Changes to these principles require deliberate review.

A proposal to weaken one of these rules must document:

Why the current principle is insufficient
What risk is introduced
What safeguards replace it
Which capabilities are affected
How existing user data, approvals, and memory are protected

This document should change slowly.
