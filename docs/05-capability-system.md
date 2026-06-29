Personal Agent Platform — Capability System

Status: Foundational Platform Specification
Depends on:

- 01-product-foundation.md
- 02-product-principles.md
- 03-platform-architecture.md
- 04-runtime-and-contracts.md

Purpose: Define how capabilities are packaged, installed, discovered, executed, composed, versioned, trusted, and reviewed.

⸻

1. Purpose

A capability is the platform’s reusable unit of useful agent work.

Capabilities may support research, email, document analysis, planning, monitoring, reporting, data lookup, communication, or future workflows.

A capability is not only a prompt.

It is a governed package containing:

Manifest
Skill instructions
Input/output schemas
Workflow definition
Allowed tools
Allowed child capabilities
Permissions
Approval rules
Memory rules
UI block support
Examples
Tests
Version metadata

The capability system exists so the platform can grow without rebuilding the runtime for every new use case.

⸻

2. Core Principle

The platform must follow this model:

Router selects capability.
Capability defines the workflow.
Skill explains how to perform the work.
Tools execute deterministic actions.
Runtime enforces permissions and approvals.
Memory provides scoped context.
UI renders validated output.
Trace records the run.

A capability should never bypass the runtime.

⸻

3. Capability Definition

A capability is a package that answers:

What problem does this solve?
What input does it accept?
What output does it return?
Which tools can it use?
Which permissions does it require?
Which actions need approval?
Which memory may it read or write?
Which UI blocks may it produce?
What workflow order must it follow?
How should failure be handled?

Examples:

research
email
document-analysis
company-research
job-research
calendar-assistant
watchlist-monitoring
meeting-preparation

⸻

4. Capability Package Structure

Each capability must be a self-contained package.

Recommended structure:

packages/capabilities/research/
├── package.json
├── src/
│ ├── index.ts
│ ├── manifest.ts
│ ├── schemas.ts
│ ├── workflow.ts
│ ├── execute.ts
│ ├── validators.ts
│ ├── memory-policy.ts
│ ├── approval-policy.ts
│ └── ui.ts
│
├── skills/
│ └── research/
│ ├── SKILL.md
│ ├── skill.manifest.json
│ ├── references/
│ └── examples/
│
├── tests/
│ ├── workflow.test.ts
│ ├── schema.test.ts
│ ├── permission.test.ts
│ └── fixtures/
│
├── README.md
└── capability.manifest.json

A capability package must be understandable without reading unrelated packages.

⸻

5. Capability Manifest

Every capability must publish a machine-readable manifest.

Example:

{
"id": "capability.research",
"version": "0.1.0",
"name": "Research",
"description": "Finds, evaluates, and reports relevant information using approved research tools.",
"skill": {
"id": "skill.research",
"version": "0.1.0",
"path": "./skills/research"
},
"inputSchemaId": "research.request.v1",
"outputSchemaId": "research.result.v1",
"allowedTools": [
"tool.profile.master",
"tool.memory.search",
"tool.search.searxng",
"tool.web.scrape",
"tool.memory.write"
],
"allowedChildCapabilities": [
"capability.analyze-news"
],
"permissions": [
"profile.read",
"memory.read",
"memory.write",
"web.search",
"web.fetch",
"ui.render"
],
"sideEffects": [
"none",
"write"
],
"approvalPolicyId": "approval.research.default",
"memoryPolicyId": "memory.research.default",
"supportedUiBlocks": [
"summary_card",
"article_list",
"article_card",
"error_list"
],
"trustLevel": "core",
"tags": [
"research",
"news",
"monitoring"
]
}

⸻

6. Capability Requirements

Every capability must provide:

1. Manifest
2. Version
3. Skill folder
4. Input schema
5. Output schema
6. Explicit workflow
7. Explicit tool list
8. Explicit permission list
9. Approval policy
10. Memory policy
11. UI support declaration
12. Validation rules
13. Tests
14. Documentation

A package missing any mandatory component must not be registered by the runtime.

⸻

7. Capability Workflow Rules

Capabilities own workflow logic.

The runtime owns enforcement.

The workflow must define a bounded sequence of steps.

Example:

Research Capability

1. Validate input
2. Load skill
3. Load minimum relevant profile context
4. Build a bounded research plan
5. Search approved sources
6. Rank candidates
7. Scrape selected sources
8. Analyze selected articles
9. Build final result
10. Propose or write allowed memory
11. Build validated UI blocks
12. Finalize trace

Capabilities must not rely on hidden model reasoning to determine unrestricted next steps.

For local and smaller models, workflows should be explicit and narrow.

⸻

8. Capability Types

Capabilities may be classified by operating style.

8.1 Read-Only Capability

Reads data and produces analysis.

Examples:

research
document-analysis
company-analysis
job-analysis
email-summary

Characteristics:

No external side effects
May read profile, memory, files, email, web data
May create low-risk summaries or reports

8.2 Drafting Capability

Creates proposed content but does not execute external action.

Examples:

email-draft
proposal-draft
social-post-draft
application-draft
meeting-agenda-draft

Characteristics:

Creates drafts
May write local draft records
Does not send or publish

8.3 Action Capability

Performs side effects after approval.

Examples:

send-email
archive-email
create-calendar-event
publish-post
export-document

Characteristics:

Requires approval policy
Creates approval request where needed
Must be resumable after approval

8.4 Monitoring Capability

Runs on a schedule or watchlist.

Examples:

morning-research
job-monitoring
company-watchlist
email-priority-monitor
regulation-watch

Characteristics:

May run through worker
Must have strict limits
Must record run history
Must avoid repeated noisy alerts

⸻

9. Capability Composition

A capability may call:

Tools
Sub-capabilities
Shared skills
Memory services
UI builders
Approval engine

Capabilities must not create uncontrolled recursive chains.

9.1 Composition Rules

A parent capability must declare child capabilities in its manifest.

A child capability must receive:

Parent execution ID
Scoped input
Allowed permissions
Workspace/thread scope
Trace context
Approval context

A child capability must not inherit all parent permissions automatically.

Only explicitly delegated permissions may pass down.

9.2 Example

Morning Research Capability
├── Research Planner
├── Search Tool
├── Search Ranker
├── Scraper Tool
├── Analyze-News Capability
├── Report Ranker
└── Report Renderer

The parent capability remains responsible for:

Run limits
Final result validation
Final memory policy
Final UI output
Trace completion

⸻

10. Capability Routing

The router determines which capability should handle a request.

The router should select from a limited registered capability list.

Example input:

“Find urgent emails from recruiters and draft replies.”

Possible route:

capability.email

Example input:

“Research AI coding-agent updates that may affect QA Intel.”

Possible route:

capability.research

The router must return structured output:

{
"capabilityId": "capability.research",
"confidence": 0.91,
"reason": "The request requires web research and opportunity analysis.",
"requiresClarification": false
}

The router must not:

Invent capabilities
Call tools directly
Perform side effects
Bypass user intent

⸻

11. Capability Inputs and Outputs

Capabilities must have strict schemas.

Example input:

type ResearchRequest = {
request: string;
category?: "business" | "technology" | "jobs";
workspaceId?: string;
threadId?: string;
depth?: "quick" | "normal" | "deep";
};

Example output:

type ResearchResult = {
summary: string;
findings: Array<{
title: string;
url?: string;
importance: number;
relevance: number;
analysis: string;
}>;
opportunities: Array<{
title: string;
type: string;
action: string;
}>;
ui: UiBlock[];
};

Every capability output must be:

Validated
Traceable
Serializable
Safe for UI rendering
Clear about warnings and partial failure

⸻

12. Tool Access Rules

Capabilities must only access tools declared in their manifest.

The runtime must check:

Does the capability declare this tool?
Does the capability have the required permission?
Is the requested action within current workflow scope?
Is approval required?
Does tool input pass schema validation?

Example:

Email capability may declare:

- searchEmails
- readEmailThread
- createDraft
- sendEmail
  Research capability must not be able to call:
- sendEmail

Even if the tool exists globally.

⸻

13. Capability Skill Requirements

Each capability must include a skill folder compatible with the Agent Skills approach.

Required minimum:

SKILL.md
skill.manifest.json

SKILL.md should include:

Purpose
When to use
Inputs
Outputs
Strict workflow
Allowed tools
Tool limits
Memory rules
Approval rules
Failure behavior
Examples

The Agent Skills pattern treats skills as portable folders of instructions, scripts, and resources, enabling reuse across compatible agent systems. (Microsoft Learn)

13.1 Progressive Disclosure

Skills should load in stages:

1. Manifest metadata
2. Core SKILL.md
3. Reference files only when needed
4. Example files only when needed

This is important for small local models.

⸻

14. Capability Memory Policy

Each capability must declare:

What memory it can read
What memory it can write
Which writes are automatic
Which writes require approval
What evidence is required
What expiry rules apply

Example:

Research Capability
Read:

- news preferences
- business interests
- professional/career context
- prior related research
  Write:
- research episodes automatically
- high-confidence opportunity records
- no permanent personal facts without approval

Capabilities must not write directly to storage.

They must request memory writes through the memory service.

⸻

15. Capability Approval Policy

Each capability must declare how it handles side effects.

Example:

Email Capability
Read/search:
No approval required.
Draft:
No approval required.
Send:
Always requires approval unless a reusable rule permits it.
Archive:
Requires approval unless sender-based rule exists.
Delete:
Always requires approval.

The capability may request approval, but the runtime owns approval enforcement.

⸻

16. Capability UI Contract

A capability must declare allowed UI blocks.

Example:

Research:
summary_card
article_list
article_card
error_list
Email:
email_list
email_thread
draft_editor
approval_dialog
Document Analysis:
document_summary
comparison_table
timeline
error_list

A capability must not return UI blocks outside its declared list.

The runtime validates each block before returning it to the frontend.

⸻

17. Capability Trust Levels

Capabilities must declare trust level.

core
trusted_local
trusted_git
reviewed_community
untrusted

17.1 Core

Built into the main platform repository.

Highest trust level
Reviewed with platform changes
May use platform-standard permissions

17.2 Trusted Local

Installed from a local path controlled by the user.

Allowed in v1
Requires manifest review
Requires explicit permission approval

17.3 Trusted Git

Installed from a Git repository explicitly approved by the user.

Allowed in v1
Requires source URL, commit/tag, manifest review
No unrestricted executable code by default

17.4 Reviewed Community

Future capability type.

Requires review process
May have signed releases later

17.5 Untrusted

Not executable in normal runtime.

Can be inspected
Cannot access tools or data
Cannot register automatically

OWASP’s agentic-skills guidance highlights the risks of malicious or unsafe skills, including tool misuse and unsafe orchestration. Capability trust, explicit permissions, and install review are therefore mandatory platform concepts. (owasp.org)

⸻

18. Capability Installation

Version one supports:

Local folder installation
Trusted Git repository installation

18.1 Local Folder Installation

Example:

pap capability install ./my-capability

The platform must inspect:

Manifest
Skill files
Schemas
Requested permissions
Tool dependencies
UI block dependencies
Version
Trust level

18.2 Trusted Git Installation

Example:

pap capability install https://github.com/example/capability-weather.git

The platform must record:

Repository URL
Commit SHA or tag
Install timestamp
Manifest hash
Skill hash
Requested permissions
Trust decision

18.3 Installation Review Screen

Before enabling a capability, show:

Capability name
Version
Repository or local source
Requested tools
Requested permissions
Network access
Storage access
Memory access
Side effects
Approval policy
Supported UI blocks
Skill files

The user must explicitly enable it.

⸻

19. Capability Registry

The capability registry is the runtime service that manages installed capabilities.

Responsibilities:

Register capability manifests
Validate manifests
Track enabled/disabled state
Resolve capability by ID
List capability metadata
Check compatibility
Track installed source/version
Apply trust rules

The registry must support:

core capabilities
locally installed capabilities
trusted Git capabilities
disabled capabilities
failed capability registration

Example registry record:

type RegisteredCapability = {
manifest: CapabilityManifest;
source: {
type: "core" | "local" | "git";
location: string;
revision?: string;
};
enabled: boolean;
installedAt: string;
verifiedAt?: string;
};

⸻

20. Capability Validation

A capability must be validated at:

Installation time
Registration time
Execution time
Upgrade time

20.1 Installation Validation

Validate:

Manifest schema
Skill folder exists
SKILL.md exists
Declared tools exist
Declared UI blocks exist
Input/output schemas load
Permissions are valid
No undeclared side-effect tools

20.2 Execution Validation

Validate:

Input schema
Allowed tool calls
Permission checks
Approval checks
Memory write requests
Output schema
UI block schemas
Trace finalization

20.3 Upgrade Validation

When capability version changes:

Compare manifests
Compare permissions
Compare tools
Compare side effects
Compare memory policy
Compare UI blocks
Require new approval if permissions expand

⸻

21. Capability Error Handling

Capabilities must handle partial failure.

Example:

Research Capability:
12 articles selected
9 scraped successfully
3 failed extraction
Final report still generated
Errors listed in UI
Trace records failures

Capability statuses:

completed
completed_with_warnings
awaiting_approval
failed
cancelled

A capability should fail fully only when the result cannot be meaningfully completed.

⸻

22. Capability Testing Requirements

Every capability must include tests for:

Manifest validation
Input validation
Output validation
Tool allowlist enforcement
Permission denial
Approval pause behavior
Memory write policy
UI block validation
Partial failure behavior
Trace output

Capabilities with side effects must also test:

Approval rejection
Approval expiration
Rule-based approval
Duplicate action prevention
Retry behavior

⸻

23. Initial Capability Set

The initial platform should only include:

capability.research

Future capability roadmap:

capability.email
capability.document-analysis
capability.company-research
capability.job-research
capability.watchlist-monitoring

Do not build all capabilities before proving the research capability pattern.

⸻

24. Definition of Done

A capability is complete when:

It has a versioned manifest.
It has a portable skill folder.
It has validated input/output schemas.
It declares tools and permissions.
It has an explicit workflow.
It obeys approval policy.
It uses memory through memory services.
It returns validated UI blocks.
It produces execution traces.
It handles partial failures.
It includes tests and documentation.
It can be installed and enabled without changing runtime internals.

⸻

25. Deferred Decisions

Do not decide yet:

Public capability marketplace
Capability signing infrastructure
Payment/licensing for capabilities
Third-party executable sandboxing
Cross-instance capability sharing
Automatic dependency installation
Community reputation system
Capability monetization
