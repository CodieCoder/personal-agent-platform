Personal Agent Platform — Memory Model

Status: Foundational Platform Specification
Depends on:

- 01-product-foundation.md
- 02-product-principles.md
- 03-platform-architecture.md
- 04-runtime-and-contracts.md
- 05-capability-system.md
- 06-tool-system.md

Purpose: Define how the platform stores, retrieves, validates, scopes, evolves, and exposes memory so it becomes more useful over time without becoming opaque, inaccurate, or unsafe.

⸻

1. Purpose

Memory is what allows Personal Agent Platform to behave like a persistent personal agent instead of a stateless chatbot.

The platform must remember:

Who the user is
What projects and priorities matter
What happened in past tasks
What opportunities were found
What workflows are approved
How capabilities should operate
What information should expire or be forgotten

Memory must improve usefulness without silently accumulating incorrect assumptions.

The platform uses a three-layer memory model:

Semantic memory
Episodic memory
Procedural memory

This separation is consistent with current agent-memory approaches that distinguish durable facts, interaction/task history, and learned procedures. LangGraph distinguishes thread-scoped state from persistent cross-session memory, while Mem0 documents factual, episodic, and semantic memory layers. (docs.langchain.com)

⸻

2. Memory Principles

Memory must follow these rules:

Explicit
Inspectable
Scoped
Attributed
Confidence-aware
Reversible
Evidence-backed
Policy-controlled
Purposefully retrieved

The platform must not:

Dump all personal memory into prompts
Store every conversation message permanently
Treat model guesses as facts
Allow free-text model output to modify workflows
Hide memory provenance
Make memory deletion difficult

⸻

3. Memory Types

3.1 Semantic Memory

Semantic memory stores durable facts about the user, projects, preferences, entities, and stable relationships.

Examples:

User is based in Nigeria.
User prefers remote/global work.
User is building QA Intel.
User prefers local/private AI where practical.
Project ChurchPro targets multi-branch churches.
User uses TypeScript, React, NestJS, Python, and FastAPI.

Semantic memory should be structured and queryable.

Recommended format:

type SemanticMemoryRecord = {
id: string;
scope: "personal" | "workspace" | "capability" | "thread";
subject: string;
predicate: string;
value: unknown;
confidence: number;
sourceType:
| "user_statement"
| "capability_output"
| "document"
| "email"
| "manual_entry"
| "import";
sourceRef?: string;
evidenceRefs: string[];
sensitivity: "low" | "moderate" | "sensitive";
status: "active" | "superseded" | "expired" | "deleted";
createdAt: string;
updatedAt: string;
expiresAt?: string;
};

Semantic memory is the preferred source for stable facts.

It should not be replaced by vector search when structured lookup is sufficient.

⸻

3.2 Episodic Memory

Episodic memory stores events, task runs, decisions, outcomes, and interactions.

Examples:

Morning research found a fintech compliance opportunity.
A recruiter email was drafted but not sent.
The user rejected a job because location requirements excluded Nigeria.
A scraper failed on a specific site three times.
A report was generated and saved successfully.

Recommended format:

type EpisodicMemoryRecord = {
id: string;
scope: "personal" | "workspace" | "capability" | "thread";
capabilityId?: string;
executionId?: string;
threadId?: string;
workspaceId?: string;
eventType: string;
summary: string;
outcome?: string;
relatedEntities: string[];
evidenceRefs: string[];
confidence: number;
sensitivity: "low" | "moderate" | "sensitive";
createdAt: string;
expiresAt?: string;
};

Episodic memory should help answer:

What happened before?
What was already researched?
What decisions were made?
What actions are pending?
What failed repeatedly?
What changed since the last run?

⸻

3.3 Procedural Memory

Procedural memory defines how the system should act.

It includes:

Skills
Workflow definitions
Tool-use rules
Approval policies
Validation rules
Capability manifests
Examples
Runbooks

Examples:

For email sending, draft first unless an approved rule exists.
For job analysis, check remote eligibility before fit scoring.
For research, search → rank → scrape → analyze → report.
For failed scrapes, log and stop after bounded retries.

Procedural memory should not be treated as loose user memory.

It should be versioned and reviewed like code.

Recommended storage:

skills/
capability manifests
workflow definitions
approval policy files
tool docs
versioned configuration

The Agent Skills format is a good compatibility target because skills are portable folders centered on SKILL.md, with optional scripts, examples, and references. (agentskills.io)

⸻

4. Memory Scopes

Version one supports these scopes:

personal
workspace
capability
thread

4.1 Personal Scope

Facts and episodes relevant across the user’s entire personal environment.

Examples:

Preferred technologies
Career goals
Communication preferences
Default privacy preferences
Long-term business interests

4.2 Workspace Scope

Facts and episodes tied to a project or domain.

Examples:

QA Intel project requirements
ChurchPro feature decisions
Research watchlists
Business Agents architecture choices

4.3 Capability Scope

Memory used only by a specific capability.

Examples:

Research source profiles
Email sender rules
Document extraction preferences
Capability-specific approval rules

4.4 Thread Scope

Temporary or conversation-specific context.

Examples:

Current chat context
Pending draft context
Current document review
Unfinished comparison task

Thread memory should have shorter retention by default unless promoted.

⸻

5. Memory Storage Strategy

The platform should use different storage forms for different memory needs.

Structured database
Vector retrieval store
Versioned files

5.1 Structured Database

Use structured storage for:

Semantic facts
Approvals
Capability config
Workspaces
Source profiles
Task history
Execution traces
Memory metadata
Expiry rules
Status flags

Structured data should be stored in SQLite initially, with a Postgres-compatible path later.

5.2 Vector Retrieval

Use vector retrieval for:

Research reports
Article summaries
Document chunks
Email summaries
Historical notes
Long-form conversation summaries
Past opportunity analysis

Vector retrieval should support semantic search, not replace structured truth.

5.3 Versioned Files

Use files for:

Skills
Procedural memory
Capability workflows
Policy rules
Examples
Templates
Reference documentation

This keeps procedural behavior inspectable and code-reviewed.

⸻

6. Memory Read Model

The system should retrieve memory intentionally through tools.

Examples:

getMasterProfile(...)
getWorkspaceContext(...)
getCapabilityPreferences(...)
searchVectorDb(...)
getSemanticFacts(...)
getRelatedEpisodes(...)

The model should not receive the full user profile or all historical memory by default.

A capability should retrieve only the context needed for its task.

Example:

Job capability:
Retrieve professional career profile and prior job preferences.
Research capability:
Retrieve business interests, news preferences, and related past research.
Email capability:
Retrieve communication preferences and sender-specific rules.
Document capability:
Retrieve workspace/project context and previous related documents.

LangGraph’s long-term memory model similarly separates persistent memory from thread-scoped state and organizes durable data under namespaces and keys. (docs.langchain.com)

⸻

7. Memory Write Model

All memory writes must pass through the memory service.

Capabilities must never write directly to storage.

Memory write flow:

Capability proposes memory write
→ Memory policy evaluates request
→ Runtime decides automatic/proposed/rejected
→ Record is stored with metadata
→ Trace event is written
→ Memory Explorer exposes the record

⸻

8. Automatic vs Approval-Based Memory Writes

Memory writes use a hybrid policy.

8.1 Automatic Writes

May be stored automatically when all are true:

Low sensitivity
Clear source
High confidence
Useful for future work
Easy to reverse
Not a consequential claim about the user

Examples:

A research run completed.
A source failed scraping.
A report was generated.
A capability was used.
A local file was indexed.
A recurring task ran.

8.2 Proposed Writes

Require user review when any are true:

Sensitive
Ambiguous
Long-lived
High-impact
Inferred rather than explicit
Potentially incorrect
Changes user preferences or personal identity

Examples:

The user may be interested in healthcare startups.
The user prefers a certain company.
The user is changing career direction.
The user wants to permanently ignore a category.

8.3 Rejected Writes

Must not be stored when:

No source exists
Confidence is too low
The statement is model speculation
The data is clearly temporary
The information is irrelevant
The write violates privacy policy

⸻

9. Memory Confidence

All semantic and episodic memory should include confidence.

Recommended ranges:

0.90 - 1.00:
Explicit user statement, verified structured source, or deterministic system event.
0.70 - 0.89:
Strongly supported inference with evidence.
0.40 - 0.69:
Tentative interpretation. Usually propose, do not persist automatically.
Below 0.40:
Do not persist unless explicitly requested.

Confidence should not be treated as truth.

It is a signal for retrieval, review, and automatic-write policy.

⸻

10. Memory Provenance

Every memory record must explain where it came from.

Required provenance:

Source type
Source reference
Capability
Execution ID
Evidence links or document references
Creation timestamp
Authoring mechanism
Confidence

Examples:

Source:
User statement in thread abc123.
Source:
Research capability run xyz789.
Source:
Document “CV 2026.pdf”, page 2.
Source:
Email thread from recruiter, message ID 456.

The user must be able to inspect provenance in the Memory Explorer.

⸻

11. Memory Expiry and Supersession

Memory must support expiry and replacement.

Examples:

Current job search status:
May expire after 90 days.
Temporary project priority:
May expire after 30 days.
Daily market insight:
May expire after 14 days.
Core technical stack:
May remain active until superseded.
Old source profile:
May be marked stale after repeated scraper failures.

Records should support:

active
superseded
expired
deleted

Do not overwrite historical memories without preserving the original record.

Instead:

Old record → superseded
New record → active
Relationship → linked

⸻

12. Memory Consolidation

The platform should eventually consolidate repeated episodes into higher-value semantic insights.

Example:

Episode 1:
User rejected remote role because it required US work authorization.
Episode 2:
User rejected another role for same reason.
Consolidated semantic preference:
Avoid recommending roles that require US work authorization.

However, consolidation must be conservative.

Initial rule:

Do not automatically create permanent semantic memory from repeated episodes without:

- clear repeated evidence,
- confidence threshold,
- explicit consolidation logic,
- user review for consequential preferences.

⸻

13. Memory Retrieval Ranking

Memory retrieval should consider:

Scope match
Capability relevance
Workspace relevance
Thread relevance
Semantic similarity
Recency
Confidence
Sensitivity
Expiry status
User pinning

Suggested ranking order:

1. Explicit current workspace facts
2. Capability-specific rules
3. High-confidence personal semantic facts
4. Relevant recent episodes
5. Vector-retrieved historical content
6. Low-confidence or inferred memories

Expired, deleted, or superseded records should not be returned unless explicitly requested.

⸻

14. Memory Explorer

The web app must include a visible Memory Explorer.

It should support:

Browse semantic memory
Browse episodic memory
Browse procedural memory references
Filter by scope
Filter by capability
Filter by workspace
Filter by confidence
Filter by sensitivity
Filter by expiry
View provenance
Edit memory
Delete memory
Pin important memory
Approve/reject proposed memory

The Memory Explorer is required because memory must be inspectable and reversible.

⸻

15. Sensitive Memory

Sensitive information requires stronger controls.

Examples:

Email content
Private documents
Financial information
Credentials
Personal identifiers
Private communication summaries
Sensitive career information

Sensitive memory must:

Remain local/self-hosted by default
Require explicit external-use configuration
Use stricter retrieval rules
Avoid exposure in normal traces
Support deletion
Record access in trace where practical

The platform should avoid putting sensitive raw content into vector storage unless explicitly enabled.

Prefer:

Metadata
Summaries
Encrypted local chunks
Scoped retrieval

⸻

16. Memory and Capabilities

Each capability must declare a memory policy.

Example:

Research Capability
Read:

- business interests
- news preferences
- related past research
- watchlists
- source profiles
  Write:
- research episodes automatically
- failed source records automatically
- opportunities with evidence
- semantic preferences only by proposal

Example:

Email Capability
Read:

- communication preferences
- sender rules
- prior related thread summaries
  Write:
- email episode summary
- draft creation episode
- approval state
- sender preference proposals

⸻

17. Memory and Tools

Tools should interact with memory only through memory APIs.

Examples:

getMasterProfile(...)
searchVectorDb(...)
getSemanticFacts(...)
saveEpisode(...)
saveInsight(...)
proposeSemanticMemory(...)

Tools must not:

Write arbitrary memory directly
Modify procedural memory
Bypass confidence rules
Bypass approval policy
Store sensitive content without classification

⸻

18. Memory and LLMs

LLMs may:

Request scoped memory
Summarize episodes
Propose memory writes
Classify memory relevance
Suggest consolidation candidates

LLMs may not:

Treat retrieved memory as unquestionable truth
Write permanent semantic facts directly
Modify procedural memory directly
Delete memory directly
Bypass source/provenance requirements

All LLM-produced memory proposals must be validated.

⸻

19. Initial V1 Scope

Version one should implement:

Semantic memory records
Episodic memory records
Workspace and capability scopes
Thread-scoped context
Basic vector retrieval abstraction
Memory Explorer
Memory provenance
Confidence
Manual edit/delete
Automatic low-risk episode writes
Proposed semantic memory writes

Do not implement yet:

Automatic procedural memory rewriting
Complex memory graph reasoning
Cross-user shared memory
Autonomous memory consolidation
Emotion/personality memory
Background memory optimization
Cloud synchronization

⸻

20. Memory Acceptance Criteria

The memory system is complete for v1 when:

1. Semantic, episodic, and procedural memory are separate.
2. Personal, workspace, capability, and thread scopes exist.
3. Every memory record stores provenance and confidence.
4. Sensitive records can be classified.
5. Capabilities retrieve memory through tools.
6. Low-risk episodic events can be stored automatically.
7. Important semantic writes can be proposed for approval.
8. Memory can be edited, deleted, expired, or superseded.
9. Memory Explorer can display and filter records.
10. Execution traces record memory reads and writes.
11. Vector retrieval is optional and does not replace structured memory.
12. Procedural memory remains versioned through skills and capability definitions.

⸻

21. Deferred Decisions

Do not decide yet:

Memory graph database
Automatic semantic consolidation
Cross-device encrypted sync
Cloud vector database default
Memory-sharing between users
Automatic preference extraction from all conversations
Fine-tuned memory models
Long-term personality modeling
