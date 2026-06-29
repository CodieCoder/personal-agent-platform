Personal Agent Platform — Product Foundation

Status: Source of Truth
Project Name: Personal Agent Platform
Product Name: Internal working name only; public name may change later
Primary User: One person
Initial Deployment: Local machine and self-hosted server
Primary Interface: React + TanStack Start web application
Architecture Direction: Modular monorepo with plug-in capabilities, tools, skills, UI blocks, and memory services

⸻

1. Product Definition

Personal Agent Platform is a private, modular personal agent system that helps one person manage information, tools, recurring work, decisions, communication, research, documents, and personal workflows.

It is designed to function as your personal agent: a reliable environment where local models, external APIs, personal data, tools, and reusable capabilities work together under clear permissions, memory rules, validation, and user control.

The product is inspired internally by the idea of a highly capable personal assistant, but it is not intended to imitate a fictional assistant or depend on unrestricted autonomy.

The platform is:

- A personal AI operating system for one user.
- A private/local-first agent platform for advanced personal workflows.
- A modular developer framework for building personal and business agent capabilities.
- An open GitHub project that others can inspect, self-host, adapt, and extend.

The first version is not a SaaS product and does not need multi-user or team features.

⸻

2. Product Promise

Personal Agent Platform turns personal information, connected tools, recurring work, and explicit goals into reliable, reviewable, reusable workflows.

It should help the user do more than a generic chat assistant by providing:

- Private access to personal data and tools.
- Flexible local or self-hosted execution.
- Reusable modular capabilities.
- Persistent but controllable memory.
- Tool-backed work rather than prompt-only answers.
- Clear approval before meaningful external side effects.
- Structured outputs and suitable UI presentations.
- Execution traces that explain what happened.

The core promise is:

A private personal agent that can understand your context, use approved tools, complete repeatable work, and improve over time without becoming uncontrolled.

⸻

3. Primary User

The initial product is built for one user: the project owner.

The platform should understand and support personal goals, projects, work history, career activity, business interests, research preferences, communication workflows, and documents.

The architecture must still be modular enough that other users can self-host their own instance later.

The initial implementation should assume:

One user
One private environment
One personal memory graph
Multiple projects/workspaces
Multiple capabilities
Multiple connected tools

It should not assume:

Teams
Organizations
Shared workspaces
Multi-user permissions
Public SaaS tenancy
Enterprise administration

⸻

4. Core User Value

The platform should reliably support the following categories of work.

4.1 Research and Opportunity Monitoring

Examples:

- Morning business, technology, and jobs briefings.
- Company and competitor research.
- Regulatory and market monitoring.
- Opportunity discovery.
- Product idea research.
- Career and job-market intelligence.
- Trend analysis across saved research history.

  4.2 Email and Communication Management

Examples:

- Search and summarize emails.
- Identify recruiter, client, or urgent communication.
- Draft replies.
- Suggest follow-ups.
- Classify and organize messages.
- Send or archive only after approval or approved rules.

  4.3 Document Understanding

Examples:

- Analyze uploaded documents.
- Extract facts, risks, actions, deadlines, and structured data.
- Compare documents.
- Answer grounded questions from documents.
- Save reusable findings to memory.

  4.4 Personal Knowledge Retrieval

Examples:

- Retrieve current project context.
- Recall previous decisions, research, and plans.
- Surface past opportunities and follow-ups.
- Retrieve relevant career, business, or technical context when needed.

  4.5 Workflow Automation

Examples:

- Recurring research.
- Scheduled monitoring.
- Draft generation.
- Report generation.
- Follow-up preparation.
- Personal operational workflows.

  4.6 Business and Career Decision Support

Examples:

- Assessing opportunities.
- Evaluating job fit.
- Comparing companies or tools.
- Identifying risks and next actions.
- Turning news or documents into practical recommendations.

⸻

5. Product Principles

The following principles are non-negotiable.

5.1 Deterministic Where Possible

Use deterministic tools, workflows, validators, schemas, and code for tasks that do not require model judgment.

Use LLMs primarily for:

- Ranking.
- Classification.
- Analysis.
- Interpretation.
- Planning within bounded workflows.
- Summarization.
- Selecting suitable UI blocks from approved options.

Do not use LLMs for deterministic work when a reliable tool or rule exists.

5.2 User Control Before Side Effects

The platform must require approval for meaningful external or destructive actions.

Always require confirmation for:

Sending email
Deleting email, documents, or stored data
Publishing or posting externally
Spending money
Modifying calendar events
Sharing or exporting private data
Running destructive scripts

The platform may perform low-risk tasks without approval:

Read
Search
Draft
Summarize
Classify
Research
Save low-risk notes
Generate reports
Prepare recommendations

The user can create reusable approval rules, such as:

Automatically archive newsletters from selected senders.
Send a weekly report to one approved recipient.
Never send external email without one-time approval.

5.3 Memory Must Be Inspectable and Reversible

No memory should become an invisible permanent belief.

Every memory write must support:

Source
Confidence
Scope
Created time
Updated time
Expiry where relevant
Capability that created it
Ability to edit or delete it

The user must be able to inspect memory from the web application.

5.4 Privacy by Default

Sensitive email, document, and personal content must remain on the local machine or self-hosted server by default.

External models, APIs, crawlers, vector databases, and data services may be enabled per capability or per task, but only with explicit configuration.

The platform is local-first, not local-only.

5.5 Modular by Design

Capabilities, tools, skills, memory adapters, UI blocks, and storage providers must be independently replaceable where practical.

Adding a new capability should not require rewriting the core runtime.

5.6 Traceable Execution

The system should provide execution traces for capability runs.

Traces should show:

Capability selected
Skill loaded
Tools used
Tool inputs and outputs where safe
Validation results
Memory reads and writes
Approval requests
Errors
Final structured result

Execution traces should be visible in the user interface and toggleable.

⸻

6. Local-First and Hybrid Execution Model

The platform is local-first with optional external integrations.

6.1 Local and Self-Hosted Support

The platform must support:

Mac development environment
Linux self-hosted server
Local Ollama models
Local files
Local SQLite or Postgres
Local tools and scripts
Private self-hosted services

6.2 Offline Support

The core platform should remain useful offline for:

Local documents
Local memory
Installed capabilities
Local models
Local tools
Local reports
Previously indexed content

Some capabilities will require internet access, such as:

Web research
Email synchronization
Market data
Currency data
External APIs
Cloud vector databases
Remote LLMs

Offline limitations should be explicit in capability metadata and UI feedback.

6.3 External Services

The platform may use paid or external services when configured, including:

Frontier LLM providers
Firecrawl or other scraping services
Cloud vector databases
Market-data APIs
Currency APIs
Email providers
Hosted storage

Core platform behavior should remain compatible with free and open-source local alternatives where possible.

⸻

7. Capabilities

A capability is a modular unit of agent work.

A capability may represent any useful agent behavior, including:

Research
Email management
Document analysis
Company analysis
Calendar support
Financial data lookup
Job research
Personal knowledge retrieval
Workflow automation
Monitoring
Reporting

Capabilities are not just prompts. Each capability should include:

Manifest
Skill documentation
Input schema
Output schema
Allowed tools
Required permissions
Workflow definition
Validation rules
Approval policy
Memory policy
Supported UI blocks
Examples and tests

Capabilities may compose other capabilities and tools.

For example:

Morning Research Capability
├── Search capability
├── Search result ranker
├── Scraper tool
├── Analyze-news capability
├── Report ranker
├── Report renderer
└── Memory writer

7.1 Capability Installation

Initial capability installation should support:

Local folder
Trusted Git repository

Public or community capabilities are a future goal.

Third-party capabilities should initially be declarative and permission-scoped rather than unrestricted executable plugins.

Each capability must declare:

Requested tools
Permissions
Required data access
External network access
Side effects
Approval requirements
Supported UI blocks
Skill version
Capability version

Skills should follow the portable Agent Skills pattern where practical: a folder centered on SKILL.md, with metadata and instructions, plus supporting scripts, references, and examples where needed. (agentskills.io)

⸻

8. Tools

Tools perform narrow, deterministic actions.

Examples:

getMasterProfile(...)
searchVectorDb(...)
searchSearxng(...)
scrapeUrl(...)
extractArticle(...)
getCurrencyRate(...)
getCompanyMarketData(...)
searchEmails(...)
readEmailThread(...)
createDraft(...)
sendEmail(...)
parseDocument(...)
compareDocuments(...)
saveInsight(...)
requestConfirmation(...)

A tool must have:

Typed input schema
Typed output schema
Permission requirement
Side-effect classification
Error behavior
Rate-limit or usage constraints where relevant
Documentation
Tests

Tools should not silently perform actions outside their declared contract.

⸻

9. Skills

Skills provide the operating instructions needed for an agent or capability to use tools correctly.

A skill should include:

Purpose
When to use it
Strict workflow order
Available tools
Tool usage rules
Validation rules
Failure behavior
Examples
Expected output format

Skills should support progressive disclosure:

Metadata first
Full SKILL.md only when selected
Reference files only when needed
Examples only when useful

This keeps small local models focused and reduces unnecessary prompt context. The Agent Skills specification defines SKILL.md as a Markdown file with YAML frontmatter, while related guidance recommends keeping core instructions concise and moving deeper references into separate files. (agentskills.io)

⸻

10. Memory Model

The platform uses three distinct memory types.

10.1 Semantic Memory

Semantic memory stores durable facts.

Examples:

The user is based in Nigeria.
The user prefers remote/global roles.
The user builds AI implementation and business automation products.
The user uses TypeScript, React, NestJS, Python, and FastAPI.
The user prefers local/private AI where practical.

Semantic memory should be structured, attributable, editable, and confidence-scored.

10.2 Episodic Memory

Episodic memory stores events, outcomes, and historical context.

Examples:

A research run identified a fintech automation opportunity.
A recruiter message was drafted but not sent.
A source profile failed scraping three times.
A job was rejected because the location requirement did not support Nigeria.

Episodic memory helps the platform avoid repeated work and identify change over time.

10.3 Procedural Memory

Procedural memory stores how the platform should work.

Examples:

For job analysis, verify remote eligibility before scoring fit.
For email sending, draft first unless an approved rule allows sending.
For research, use search, rank, scrape, analyze, then report.
For failed scrapes, log failure and avoid repeated retries in one run.

Procedural memory should mainly live in versioned skills, workflow definitions, capability manifests, and tool rules.

10.4 Required Memory Scopes

Version one must support:

Personal
Workspace/project
Capability
Conversation/thread

The product is not required to support team or organization memory in the initial roadmap.

10.5 Memory Ownership Policy

Memory writes use a hybrid model:

Low-risk, high-confidence stable facts:
May be stored automatically.
Sensitive, important, ambiguous, or long-lived facts:
Require approval or proposal.
Research outcomes:
Store as episodic memory with evidence.
Workflow improvements:
Update procedural memory only through reviewed capability or skill changes.

The user must have a visible Memory Explorer that includes:

Semantic facts
Episodes
Stored opportunities
Source profiles
Skills and procedural rules
Provenance
Confidence
Expiry
Edit/delete controls

⸻

11. User Experience and Generative UI

The primary interaction model is hybrid:

Chat
Workspace/dashboard
Task execution
Generated UI blocks
Reports
History
Approvals
Memory explorer
Trace viewer

The system should not rely on raw AI-generated HTML or JSX.

Instead, it should use constrained generative UI.

Capabilities and agents return structured UI intent using registered UI blocks, such as:

summary_card
article_list
article_card
job_opportunity_card
comparison_table
metric_chart
timeline
gallery
email_list
email_thread
draft_editor
approval_dialog
document_summary
error_list

The backend validates UI block data against schemas. The frontend renders only known components.

The platform will use json-render as an initial generative UI framework/reference because it supports AI-generated interfaces constrained to a developer-defined component catalog. (GitHub)

The frontend stack is:

React
TanStack Start
TypeScript
Validated UI block registry

TanStack Start is selected because it provides a router-first full-stack React architecture with server-side rendering, streaming, server functions, server routes, and deployable runtime outputs. (tanstack.com)

⸻

12. Product Boundaries

Personal Agent Platform must not become:

A generic chatbot wrapper
An uncontrolled autonomous agent
A no-code workflow builder before core reliability exists
A replacement for human judgment
A social-media spam automation tool
A public SaaS marketplace before the core runtime is reliable
A system that silently performs destructive or external actions
A black-box memory system with no review controls

The product should prioritize reliability, privacy, extensibility, and user control over novelty or broad feature count.

⸻

13. Success Criteria

Six months after the first usable version, the product succeeds if:

It remembers projects and priorities accurately.
It saves meaningful time every week.
New capabilities can be added without changing the core runtime.

Supporting evidence may include:

Recurring tasks run without repeated prompting.
The user relies on the platform for research, email, documents, or planning.
Capabilities reuse shared tools, memory, UI blocks, and approval rules.
Memory retrieval is accurate enough to be trusted.
Execution traces make failures understandable and fixable.

⸻

14. Primary Product Metric

The primary measurable metric from day one is:

Completed Tasks

A task is completed when:

A capability returns a validated result,
and any required approval is either:

- completed successfully, or
- intentionally pending user approval.

Examples:

A research report is generated and saved.
An email draft is created successfully.
A document analysis result is produced and validated.
A report is ready for approval before sending.
A request is paused correctly while awaiting confirmation.

Task completion does not require that every external action has already happened. A task waiting for required user approval is still a valid completed workflow state.

⸻

15. Initial Technical Direction

The platform will be implemented as a modular TypeScript monorepo.

Core direction:

pnpm workspaces
Turborepo
React + TanStack Start
TypeScript
Zod schemas
Local Ollama support
SQLite for local-first development
Postgres-compatible storage path
Pluggable memory adapters
Modular capability packages
Modular UI block packages
Local folder and trusted Git capability installation

The initial structure should support:

apps/
api/
web/
worker/
packages/
contracts/
runtime/
capabilities/
tools/
memory/
ui/
storage/
llm/
shared/
skills/
docs/
examples/

⸻

16. Document Hierarchy

This document is the product source of truth.

Future documents must remain consistent with it.

Planned documentation sequence:

01-product-foundation.md
02-product-principles.md
03-platform-architecture.md
04-runtime-and-contracts.md
05-capability-system.md
06-tool-system.md
07-memory-model.md
08-policy-and-approval-model.md
09-generative-ui-model.md
10-v1-prd.md
11-research-capability-prd.md
12-email-capability-prd.md
13-document-analysis-capability-prd.md
14-roadmap.md

Where a future document conflicts with this foundation, this foundation should be updated deliberately before implementation changes are accepted.
