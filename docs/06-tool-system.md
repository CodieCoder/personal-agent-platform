Personal Agent Platform — Tool System

Status: Foundational Platform Specification
Depends on:

- 01-product-foundation.md
- 02-product-principles.md
- 03-platform-architecture.md
- 04-runtime-and-contracts.md
- 05-capability-system.md

Purpose: Define how deterministic tools are designed, registered, authorized, composed, executed, tested, and observed.

⸻

1. Purpose

Tools are the deterministic execution layer of Personal Agent Platform.

Capabilities use tools to perform specific actions such as:

Read profile data
Search memory
Search the web
Scrape a page
Read email
Draft an email
Send an email
Parse a document
Get market data
Get currency exchange data
Save an insight
Request approval

Tools must be narrow, typed, auditable, and permission-scoped.

The LLM may decide when a tool is useful within a bounded workflow, but tools must define what actually happens.

⸻

2. Core Tool Principle

The platform follows this rule:

LLM decides within bounded workflow.
Tool executes deterministic action.
Runtime validates permission, approval, input, output, and trace.

A tool must never rely on the model to enforce its own safety.

OWASP recommends least privilege for agent tools, schema validation, input sanitization, human approval for high-risk actions, and monitoring of agent behavior. (cheatsheetseries.owasp.org)

⸻

3. Tool Definition

A tool is a small deterministic unit of work.

A tool should answer:

What does this tool do?
What input does it accept?
What output does it return?
What permission is required?
Does it have side effects?
Does it require approval?
Can it run offline?
What data scope can it access?
How does it fail?

Tools should not be broad “do anything” wrappers.

Bad:

runBrowserTask()
manageEmail()
fetchAnything()

Good:

searchSearxng()
scrapeUrl()
getMasterProfile()
searchVectorDb()
readEmailThread()
createEmailDraft()
sendEmail()
getCurrencyRate()
getCompanyMarketData()

⸻

4. Tool Design Rules

Every tool must be:

Narrow
Typed
Deterministic
Permission-scoped
Traceable
Testable
Documented
Versioned

Every tool must define:

Manifest
Input schema
Output schema
Required permission
Side-effect class
Approval requirement
Offline capability
Timeout/retry behavior
Error contract
Tests

A tool must not:

Access unrelated data
Invoke undeclared tools silently
Perform hidden side effects
Return unvalidated arbitrary data
Write directly to memory without memory policy
Bypass approval rules
Use network access without declaring it

⸻

5. Tool Categories

Tools should be grouped by functional domain.

5.1 Profile and Context Tools

Examples:

getMasterProfile(...)
getWorkspaceContext(...)
getProjectContext(...)
getCapabilityPreferences(...)

Purpose:

Retrieve only the user or workspace context relevant to the current task.

These tools prevent dumping the full user profile into every prompt.

⸻

5.2 Memory Tools

Examples:

searchVectorDb(...)
getRelatedEpisodes(...)
getSemanticFacts(...)
saveInsight(...)
saveOpportunity(...)
saveEpisode(...)

Purpose:

Retrieve and store scoped semantic or episodic memory through policy checks.

Procedural memory must not be written directly by generic LLM output.

⸻

5.3 Search and Research Tools

Examples:

searchSearxng(...)
searchNews(...)
searchCompany(...)
searchJobs(...)

Purpose:

Retrieve candidate sources or structured search results.

Search tools should return normalized results, not raw provider payloads.

⸻

5.4 Web Retrieval and Extraction Tools

Examples:

fetchUrl(...)
scrapeUrl(...)
extractArticle(...)
getPageMetadata(...)

Purpose:

Fetch public web content and extract structured information.

These tools must not bypass:

Paywalls
Authentication walls
CAPTCHAs
Explicit access blocks
Robots restrictions where enforced

⸻

5.5 Email Tools

Examples:

searchEmails(...)
readEmail(...)
readEmailThread(...)
createDraft(...)
sendEmail(...)
archiveEmail(...)
deleteEmail(...)

Purpose:

Read, organize, draft, and act on email.

Side-effect classifications:

searchEmails: none
readEmail: none
createDraft: draft
sendEmail: external_publish
archiveEmail: write
deleteEmail: delete

⸻

5.6 Document Tools

Examples:

parseDocument(...)
extractDocumentText(...)
chunkDocument(...)
compareDocuments(...)
extractStructuredFields(...)

Purpose:

Read and structure uploaded or connected documents.

Document tools should preserve source locations where possible:

page
section
heading
paragraph
offset
table cell

⸻

5.7 Data Enrichment Tools

Examples:

getCurrencyRate(...)
getCompanyMarketData(...)
getCompanyProfile(...)
getJobMarketData(...)
getRegulationData(...)

Purpose:

Provide verified structured facts that enrich analysis.

These tools should be selected only when the capability workflow or analysis context justifies them.

⸻

5.8 Approval and Action Tools

Examples:

requestConfirmation(...)
getApprovalStatus(...)
resumeApprovedAction(...)

Purpose:

Coordinate human approval for actions that have external or destructive impact.

These tools are runtime-level tools and should not be replaceable by untrusted capabilities.

⸻

6. Tool Manifest

Every tool package must export a manifest.

Example:

export const manifest: ToolManifest = {
id: "tool.search.searxng",
version: "0.1.0",
name: "SearXNG Search",
description: "Searches a configured SearXNG endpoint and normalizes results.",
inputSchemaId: "searxng.search.request.v1",
outputSchemaId: "searxng.search.result.v1",
requiredPermission: "web.search",
sideEffect: "none",
requiresApproval: false,
supportsOffline: false,
tags: ["search", "research", "web"]
};

The manifest must remain aligned with the tool implementation.

⸻

7. Tool Input and Output Rules

Every tool input and output must use Zod schemas.

Example:

export const searchSearxngInputSchema = z.object({
query: z.string().min(1),
limit: z.number().int().min(1).max(50).default(10),
category: z.string().optional(),
timeRange: z.enum(["day", "week", "month", "year"]).optional()
});
export const searchSearxngOutputSchema = z.object({
query: z.string(),
results: z.array(
z.object({
title: z.string(),
url: z.string().url(),
snippet: z.string().optional(),
source: z.string().optional(),
publishedAt: z.string().optional()
})
)
});

Tool outputs must be normalized.

Capabilities should not need to know the raw response shape of an external API.

⸻

8. Tool Execution Lifecycle

Every tool call follows the same lifecycle.

1. Capability requests tool call
2. Runtime checks capability allowlist
3. Runtime checks permission
4. Runtime checks approval policy
5. Runtime validates input schema
6. Tool executes
7. Runtime validates output schema
8. Runtime writes trace step
9. Tool result returns to capability

If any step fails, the tool must not execute.

⸻

9. Tool Authorization Rules

A tool call is allowed only when all conditions are true:

Capability declares the tool.
Capability declares the required permission.
The tool is enabled and registered.
Current task scope permits the call.
Input passes schema validation.
Approval exists when required.
Tool side effect is allowed by policy.

Example:

Research capability may use:
searchSearxng
scrapeUrl
getMasterProfile
searchVectorDb
Research capability may not use:
sendEmail
deleteDocument
createCalendarEvent

Even when those tools exist globally.

⸻

10. Side-Effect Classification

Every tool must declare one side-effect category.

none
draft
write
delete
external_publish
financial

10.1 none

Read-only or computational tool.

Examples:

searchSearxng
getMasterProfile
searchVectorDb
getCurrencyRate
parseDocument

10.2 draft

Creates editable local content but does not externally send or publish.

Examples:

createEmailDraft
createReportDraft
createApplicationDraft

10.3 write

Changes local or connected data.

Examples:

saveLowRiskNote
archiveEmail
updateSourceProfile
saveWatchlist

10.4 delete

Removes data.

Examples:

deleteEmail
deleteDocument
deleteMemoryRecord

10.5 external_publish

Sends or publishes external communication.

Examples:

sendEmail
publishPost
sendMessage
shareDocument

10.6 financial

Causes financial impact.

Examples:

payInvoice
purchaseSubscription
placeOrder
transferFunds

⸻

11. Approval Rules

The runtime, not the tool itself, determines whether approval is needed.

Default approval policy:

none:
No approval required.
draft:
No approval required.
write:
Approval depends on capability policy and reusable approval rules.
delete:
Always requires confirmation.
external_publish:
Always requires confirmation unless approved reusable rule exists.
financial:
Always requires confirmation.

Tools must not attempt to infer user approval from natural language alone.

⸻

12. Tool Context

Tools receive a limited execution context.

type ToolExecutionContext = {
executionId: string;
capabilityId: string;
workspaceId?: string;
threadId?: string;
approvedPermissions: string[];
approvalId?: string;
userScope: {
userId: string;
environment: "local" | "self_hosted";
};
trace: TraceWriter;
};

Tools should not receive:

All user memory
All credentials
All API keys
All capability permissions
All workspace data

Only the minimum context required for the requested action.

⸻

13. Tool Composition

Tools may compose lower-level deterministic utilities.

For example:

scrapeUrl
├── fetchHtml
├── normalizeUrl
├── applySourceProfile
├── readabilityExtract
├── validateArticleText
└── return normalized article

However:

A tool should not call an LLM.
A tool should not choose arbitrary next steps.
A tool should not invoke unrelated capabilities.

LLM-based reasoning belongs in a capability workflow or specialized analysis capability.

⸻

14. Tool Documentation

Each tool package must include a README or docs file covering:

Purpose
Required permission
Input schema
Output schema
Side effects
Approval behavior
Offline behavior
Configuration
Failure modes
Example calls
Security considerations
Testing instructions

Example:

packages/tools/searxng/README.md
packages/tools/email/README.md
packages/tools/scraper/README.md

⸻

15. Tool Testing Requirements

Every tool must test:

Input validation
Output validation
Permission requirement
Expected success behavior
Expected failure behavior
Timeout behavior
Malformed external response behavior
Sensitive-data redaction behavior
Trace event behavior

Tools with side effects must additionally test:

Missing approval rejection
Rejected approval behavior
Expired approval behavior
Duplicate request prevention
Retry safety
Idempotency where applicable

⸻

16. Idempotency and Retry Rules

Tools with side effects must define idempotency behavior.

Examples:

sendEmail:
Must avoid sending duplicate email after retry.
archiveEmail:
Should be safe to retry if already archived.
saveInsight:
Should avoid duplicate records when same insight and evidence already exist.
createDraft:
May create a new draft unless draft identity is supplied.

A tool manifest should eventually include:

idempotencyStrategy
retryPolicy
timeoutMs
rateLimitPolicy

For v1, these may live in tool implementation config.

⸻

17. Tool Error Model

Tool failures must be typed and actionable.

Example error categories:

TOOL_NOT_FOUND
TOOL_NOT_ALLOWED
PERMISSION_DENIED
APPROVAL_REQUIRED
APPROVAL_REJECTED
INPUT_INVALID
OUTPUT_INVALID
NETWORK_ERROR
TIMEOUT
RATE_LIMITED
AUTH_FAILED
SOURCE_BLOCKED
PAYWALL
CAPTCHA
NOT_FOUND
PROVIDER_ERROR
UNKNOWN_ERROR

Tool errors should include:

Code
Safe user-facing message
Technical detail for trace
Retryable flag
Suggested next action

Example:

Source extraction failed because the page returned HTTP 403.
The URL has been added to failed sources for manual review.

⸻

18. Tool Observability

Every tool call must create a trace step.

Minimum trace fields:

Tool ID
Tool version
Capability ID
Execution ID
Start time
End time
Status
Input summary
Output summary
Error code if any
Retry count
Approval ID if applicable

Raw data should be redacted or stored separately where sensitive.

⸻

19. Initial Tool Set

The first implementation should build only:

tool.profile.master
tool.memory.search
tool.memory.write
tool.search.searxng
tool.web.scrape
tool.approval.request

This is enough to support the first research capability.

Do not build email, calendar, market data, finance, or documents until the shared tool pattern works.

⸻

20. Future Tool Set

Planned later tools:

tool.email.search
tool.email.read
tool.email.draft
tool.email.send
tool.email.archive
tool.email.delete
tool.document.parse
tool.document.compare
tool.document.extract
tool.currency.rate
tool.company.market-data
tool.company.profile
tool.regulation.lookup
tool.calendar.search
tool.calendar.create
tool.calendar.update

⸻

21. Tool Security Requirements

Tools are the main boundary between reasoning and real-world effects.

Therefore every tool must enforce:

Least privilege
Input validation
Output validation
Data minimization
Explicit permissions
Approval checks
Trace logging
Secret isolation
Error redaction
No hidden side effects

OWASP recommends treating tool access as a high-risk boundary: limit privileges, validate external input, use human approval for high-impact actions, and monitor agent behavior. (cheatsheetseries.owasp.org)

⸻

22. Definition of Done

A tool is complete when:

It has a versioned manifest.
It has typed input/output schemas.
It has a permission requirement.
It has a side-effect classification.
It declares approval behavior.
It creates trace records.
It handles failures safely.
It is tested.
It is documented.
It can be used by a capability without direct dependency on infrastructure internals.

⸻

23. Deferred Decisions

Do not decide yet:

MCP compatibility layer
Remote tool marketplace
Tool signing
Sandboxed executable tools
OAuth credential broker
Distributed tool execution
Third-party secret vault integration
Tool billing/usage quotas
