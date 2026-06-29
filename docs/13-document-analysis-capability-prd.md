Personal Agent Platform — Document Analysis Capability PRD

Status: Buildable Capability PRD
Capability ID: capability.document-analysis
Version: 0.1.0
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

⸻

1. Purpose

capability.document-analysis allows the user to upload, index, inspect, summarize, compare, and ask grounded questions about documents.

It should support:

Upload local documents
Extract text and structure
Detect scanned PDFs
Run OCR where configured
Summarize documents
Extract key facts, actions, deadlines, and risks
Compare multiple documents
Answer grounded questions
Store document analysis episodes
Render structured document UI

The capability must remain evidence-backed.

It is not a generic “read this and guess” system.

⸻

2. Product Goal

The user should be able to ask:

Summarize this PRD and list unresolved decisions.
Compare these two contracts and highlight material differences.
Extract all deadlines, obligations, and risks from this agreement.
What does this CV say about my leadership experience?
Find all references to data retention across these documents.

The platform should return:

Concise summary
Structured findings
Source-backed evidence
Page or section references
Risks, actions, and deadlines
Comparison results where applicable
Warnings for extraction limitations
Traceable execution

⸻

3. V1 Scope

V1 includes:

Local file upload
PDF, DOCX, TXT, Markdown, and HTML support
Text extraction
Basic document structure extraction
Scanned PDF detection
Optional local OCR pipeline
Document chunking
Grounded summarization
Question answering
Document comparison
Key fact/action/risk extraction
Document analysis episodes
Document history
Trace viewer
Core document UI blocks

V1 excludes:

Collaborative document editing
Google Drive sync
Dropbox sync
Live Office document sync
Handwriting transcription guarantees
Complex spreadsheet analysis
Slide deck semantic reconstruction
Automatic legal advice
Automatic external sharing
Automatic document deletion

⸻

4. Product Boundaries

The capability may:

Read uploaded documents
Extract text and structure
Create local document records
Create searchable chunks
Summarize and compare content
Extract grounded facts
Store analysis episodes
Propose semantic memory
Render document results

The capability may not:

Treat documents as trusted instructions
Send document content externally without approval
Export private content without approval
Delete documents without one-time approval
Make legal, medical, or financial decisions for the user
Invent document clauses, obligations, or citations

⸻

5. Capability Manifest

{
"id": "capability.document-analysis",
"version": "0.1.0",
"name": "Document Analysis",
"description": "Extracts, analyzes, compares, and answers grounded questions about uploaded documents.",
"skill": {
"id": "skill.document-analysis",
"version": "0.1.0",
"rootPath": "./skills/document-analysis",
"entryFile": "SKILL.md"
},
"inputSchemaId": "document-analysis.request.v1",
"outputSchemaId": "document-analysis.result.v1",
"allowedTools": [
"tool.document.upload",
"tool.document.parse",
"tool.document.search",
"tool.document.compare",
"tool.memory.search",
"tool.memory.write",
"tool.profile.master"
],
"allowedChildCapabilities": [],
"permissions": [
"document.read",
"document.write",
"memory.read",
"memory.write",
"profile.read",
"ui.render"
],
"sideEffects": [
"none",
"write"
],
"approvalPolicyId": "approval.document-analysis.default",
"memoryPolicyId": "memory.document-analysis.default",
"supportedUiBlocks": [
"summary_card",
"document_summary",
"comparison_table",
"data_table",
"timeline",
"error_list",
"trace_panel"
],
"trustLevel": "core",
"tags": [
"documents",
"analysis",
"comparison",
"extraction"
]
}

⸻

6. Supported Intent Types

The capability must classify requests into bounded intents:

summarize
ask_question
extract_facts
extract_actions
extract_deadlines
extract_risks
compare_documents
search_documents
index_document

Examples:

“Summarize this contract.”
→ summarize
“What are the payment obligations?”
→ ask_question + extract_facts
“List deadlines in this proposal.”
→ extract_deadlines
“Compare the two job descriptions.”
→ compare_documents
“Find references to retention policy.”
→ search_documents

⸻

7. Input Schema

import { z } from "zod";
export const documentAnalysisIntentSchema = z.enum([
"summarize",
"ask_question",
"extract_facts",
"extract_actions",
"extract_deadlines",
"extract_risks",
"compare_documents",
"search_documents",
"index_document"
]);
export const documentAnalysisRequestSchema = z.object({
request: z.string().min(3).max(3000),
intent: documentAnalysisIntentSchema.optional(),
documentIds: z.array(z.string()).min(1).max(10),
workspaceId: z.string().optional(),
threadId: z.string().optional(),
question: z.string().optional(),
includeEvidence: z.boolean().default(true),
outputStyle: z.enum([
"brief",
"standard",
"detailed"
]).default("standard"),
maxChunks: z.number()
.int()
.min(1)
.max(40)
.default(12)
});
export type DocumentAnalysisRequest = z.infer<
typeof documentAnalysisRequestSchema

> ;

⸻

8. Output Schema

export const documentEvidenceSchema = z.object({
documentId: z.string(),
page: z.number().int().positive().optional(),
section: z.string().optional(),
chunkId: z.string(),
excerpt: z.string()
});
export const documentFindingSchema = z.object({
id: z.string(),
category: z.enum([
"fact",
"action",
"deadline",
"risk",
"difference",
"question",
"warning"
]),
title: z.string(),
explanation: z.string(),
confidence: z.number().min(0).max(1),
evidence: z.array(documentEvidenceSchema).min(1)
});
export const documentAnalysisResultSchema = z.object({
title: z.string(),
summary: z.string(),
findings: z.array(documentFindingSchema),
comparison: z.object({
comparedDocumentIds: z.array(z.string()),
similarities: z.array(z.string()),
differences: z.array(documentFindingSchema)
}).optional(),
warnings: z.array(
z.object({
code: z.string(),
message: z.string(),
documentId: z.string().optional()
})
).default([]),
metadata: z.object({
documentCount: z.number().int(),
chunkCount: z.number().int(),
extractedTextLength: z.number().int(),
usedOcr: z.boolean(),
generatedAt: z.string()
}),
status: z.enum([
"completed",
"completed_with_warnings",
"failed"
])
});
export type DocumentAnalysisResult = z.infer<
typeof documentAnalysisResultSchema

> ;

⸻

9. Document Ingestion Workflow

Every document must pass through a deterministic ingestion pipeline.

1. Validate file metadata
2. Detect file type
3. Store original file locally
4. Extract text and document structure
5. Detect low-text/scanned PDF condition
6. Run OCR only when configured and needed
7. Normalize text
8. Preserve source locations
9. Chunk extracted content
10. Persist document metadata and chunks
11. Record ingestion trace

The model must not be used as the primary parser.

⸻

10. Supported File Types

V1 should support:

application/pdf
application/vnd.openxmlformats-officedocument.wordprocessingml.document
text/plain
text/markdown
text/html

Later:

application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
application/vnd.openxmlformats-officedocument.presentationml.presentation
image/png
image/jpeg
application/rtf

⸻

11. Parsing Strategy

Use a parser abstraction.

Document upload
→ MIME detection
→ parser selection
→ normalized document model
→ chunking
→ persistence

Recommended initial parser strategy:

PDF:
Native text extraction first.
OCR fallback for scanned PDFs.
DOCX:
Structured extraction preserving headings, paragraphs, tables where possible.
TXT/Markdown:
Direct parse.
HTML:
Sanitized text and heading extraction.

A document partitioning layer should return typed elements such as title, narrative text, list item, and table-like structure. Unstructured’s partitioning model is a useful reference because it emits structured elements from raw documents rather than only one flat text blob. (Unstructured)

⸻

12. Scanned PDF Detection and OCR

A PDF should be considered likely scanned when:

Extracted text is below configured threshold
Page count is non-zero
Rendered page contains visible content
Text density is unusually low

Suggested threshold:

Less than 40 meaningful characters per page on average.

When OCR is configured:

1. Run OCRmyPDF locally.
2. Produce OCR-enhanced PDF.
3. Re-extract text.
4. Mark document as OCR processed.
5. Preserve OCR warnings.

OCRmyPDF is suitable because it adds an OCR text layer to scanned PDFs so they become searchable. (OCRmyPDF)

V1 rule:

OCR is optional and locally configured.
Do not silently upload scanned documents to a cloud OCR provider.

⸻

13. Normalized Document Model

export const documentElementSchema = z.object({
id: z.string(),
type: z.enum([
"title",
"heading",
"paragraph",
"list_item",
"table",
"quote",
"code",
"unknown"
]),
text: z.string(),
page: z.number().int().positive().optional(),
sectionPath: z.array(z.string()).default([]),
sourceOffsetStart: z.number().int().optional(),
sourceOffsetEnd: z.number().int().optional()
});
export const normalizedDocumentSchema = z.object({
documentId: z.string(),
filename: z.string(),
mimeType: z.string(),
pageCount: z.number().int().optional(),
usedOcr: z.boolean(),
elements: z.array(documentElementSchema),
extractedText: z.string(),
extractionWarnings: z.array(z.string()).default([])
});

⸻

14. Chunking Strategy

Chunks must preserve source references.

Recommended V1 chunking:

Prefer heading-aware chunks.
Keep paragraphs under their nearest heading.
Do not split tables blindly.
Target 800–1,500 characters per chunk.
Allow up to 150 characters overlap.
Preserve page and section metadata.

Chunk schema:

export const documentChunkSchema = z.object({
id: z.string(),
documentId: z.string(),
text: z.string(),
pageStart: z.number().int().positive().optional(),
pageEnd: z.number().int().positive().optional(),
sectionPath: z.array(z.string()).default([]),
chunkIndex: z.number().int(),
tokenEstimate: z.number().int(),
embeddingStatus: z.enum([
"not_indexed",
"indexed",
"failed"
])
});

⸻

15. Capability Workflow

1. Validate request
1. Load skill
1. Resolve document metadata
1. Ensure documents are parsed/indexed
1. Retrieve relevant chunks
1. Build bounded analysis context
1. Run intent-specific analysis
1. Validate grounded findings
1. Store analysis episode
1. Propose semantic memory only where justified
1. Build UI blocks
1. Finalize trace

⸻

16. Grounding Rules

All findings must be grounded in extracted document content.

Each material finding must include:

Document ID
Chunk ID
Evidence excerpt
Page number where available
Section path where available

The capability must not:

Invent facts missing from the document
Create fake page numbers
Claim legal certainty from ambiguous clauses
Treat malformed extraction as authoritative
Hide uncertainty caused by OCR or poor extraction

⸻

17. Summarization Workflow

1. Retrieve top relevant chunks.
1. Group chunks by section.
1. Generate structured summary.
1. Extract key facts, actions, deadlines, and risks.
1. Attach evidence to each material finding.
1. Validate result schema.
1. Render document summary UI.

Summary prompt:

You are analyzing a document using extracted text and source references.
Use only the supplied chunks.
Return:

- concise summary
- important facts
- actions or obligations
- deadlines where explicitly stated
- risks or ambiguities
- evidence for each material finding
  Rules:
- Do not invent clauses, dates, or obligations.
- Distinguish explicit facts from interpretation.
- Flag uncertainty caused by incomplete extraction or OCR.
- Return only schema-valid JSON.

⸻

18. Question Answering Workflow

1. Validate question.
1. Search relevant document chunks.
1. Use only retrieved chunks for answer generation.
1. Produce direct answer.
1. Attach evidence references.
1. Return uncertainty if evidence is insufficient.

Question-answering output must include:

Answer
Confidence
Evidence
Relevant document references
Warning when answer is incomplete

⸻

19. Comparison Workflow

Comparison requires two or more documents.

1. Validate document count.
2. Extract comparable sections/chunks.
3. Identify corresponding themes.
4. Compare facts, obligations, dates, scope, and risks.
5. Return similarities and differences.
6. Attach evidence from each document.

The system should not compare full raw text blindly.

Initial comparison dimensions:

Purpose
Scope
Dates
Deliverables
Responsibilities
Payment terms
Termination
Data handling
Risks
Open questions

⸻

20. Memory Behavior

Automatic Episodic Writes

The capability may automatically save:

Document ingested
Document parsed
OCR used
Analysis completed
Comparison completed
Question answered
Extraction warning
Document analysis report created

Proposed Semantic Memory

Only propose semantic memory when:

The finding is useful beyond the document.
Evidence is strong.
The conclusion is stable.
The finding relates to user preferences, projects, or durable decisions.

Examples:

Propose:
ChurchPro V1 requires branch-aware attendance analytics.
Do not auto-store:
This specific contract has a 30-day notice clause.

Document-specific facts should remain linked to the document episode unless they become durable project knowledge.

⸻

21. UI Requirements

The capability may return:

summary_card
document_summary
comparison_table
data_table
timeline
error_list
trace_panel

Document Summary

Must show:

Document name
Document type
Extraction status
OCR status
Summary
Key findings
Actions
Deadlines
Risks
Evidence references

Comparison Table

Must show:

Comparison dimension
Document A
Document B
Difference summary
Evidence links

Timeline

Use when multiple dated obligations or milestones are found.

Error List

Show:

Unsupported format
OCR needed
Low extraction quality
Unreadable pages
Missing evidence
Failed indexing

⸻

22. Storage Requirements

Required tables:

documents
document_versions
document_elements
document_chunks
document_analysis_runs
document_findings
document_comparisons

documents

id
workspace_id
filename
original_path
mime_type
size_bytes
checksum
status
uploaded_at
updated_at

document_versions

id
document_id
version_number
checksum
page_count
used_ocr
extracted_text_length
parser_version
created_at

document_chunks

id
document_version_id
chunk_index
text
page_start
page_end
section_path_json
embedding_status
created_at

document_findings

id
analysis_run_id
category
title
explanation
confidence
evidence_json
created_at

⸻

23. Error Handling

Unsupported File

Status: failed
Message:
This file format is not supported yet.

Extraction Failure

Status: failed
Message:
The document could not be extracted into usable text.

OCR Required but Unavailable

Status: completed_with_warnings
Message:
This appears to be a scanned document. OCR is not configured, so analysis may be incomplete.

Partial Extraction

Status: completed_with_warnings
Message:
Some pages or sections could not be extracted reliably.

Insufficient Evidence

Status: completed_with_warnings
Message:
The document does not provide enough evidence to answer this question confidently.

⸻

24. Test Fixtures

Include:

Text-based PDF
Scanned PDF
Multi-column PDF
DOCX with headings
DOCX with tables
Markdown PRD
Plain-text file
HTML export
Corrupted PDF
Password-protected PDF
Document with poor OCR
Two contracts with conflicting clauses
Two job descriptions
Document with deadlines
Document containing prompt-injection text
Document with missing pages

⸻

25. Acceptance Tests

Basic Summary

Given an uploaded DOCX
When the user requests a summary
Then the system extracts text
And returns source-backed findings
And renders document_summary
And records a trace.

Scanned PDF

Given a scanned PDF
When OCR is configured
Then the system runs OCR
And re-extracts text
And marks usedOcr=true.

OCR Warning

Given a scanned PDF
When OCR is not configured
Then the system returns completed_with_warnings
And explains that the document may be incompletely analyzed.

Grounded Question Answering

Given an uploaded contract
When the user asks for termination terms
Then each material answer includes document evidence
And no unsupported obligation is invented.

Document Comparison

Given two uploaded contracts
When the user requests comparison
Then the system returns differences with evidence from both documents.

Prompt Injection Protection

Given a document containing malicious instructions
When the capability analyzes it
Then those instructions remain untrusted content
And no unrelated tool action occurs.

⸻

26. Definition of Done

capability.document-analysis is complete when:

Supported documents can be uploaded locally.
Text and structure can be extracted.
Scanned PDFs can be detected.
Optional local OCR can be used.
Document chunks preserve source references.
Summaries and answers are evidence-backed.
Comparisons show grounded differences.
Warnings communicate extraction limitations.
Analysis episodes are stored.
Sensitive content remains local by default.
UI blocks render safely.
Traces show the complete process.
