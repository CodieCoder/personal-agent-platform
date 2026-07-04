---
name: research
description: Run bounded, source-backed manual research through deterministic search/extraction and schema-validated model analysis.
---

# Research Skill

## Workflow

1. Validate the request and workspace scope.
2. Resolve workspace context without loading unrelated private data.
3. Plan bounded deterministic search queries.
4. Search only through the configured server-side search provider.
5. Normalize, deduplicate, and select a bounded source set.
6. Fetch and extract selected public sources through guarded server-side web tools.
7. Rank and analyze only extracted source content with schema-constrained model calls.
8. Build findings only from validated source analysis claims.
9. Validate citations before report completion.
10. Persist the report, sources, diagnostics, warnings, and trace linkage.
11. Propose semantic memory only when explicitly enabled and citation-backed.

## Rules

- Do not use browser-side provider calls.
- Do not treat snippets as evidence for report findings.
- Do not invent URLs, titles, citations, publication dates, or source claims.
- Do not store raw HTML, prompts, raw model output, cookies, headers, or hidden reasoning.
- Continue after individual source failures when at least one source remains usable.
- Proposed memory must stay pending review and must never become active automatically.
