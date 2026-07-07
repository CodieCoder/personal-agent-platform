# Search Extract Test

Run a deterministic search and optional guarded extraction path for Phase 4 validation.

## Boundaries

- Use runtime-provided web methods only.
- Do not call LLMs, memory, UI builders, approval flows, SearXNG adapters, fetch transports,
  Readability, SQLite, browser rendering, crawlers, or schedulers directly.
- Persist only bounded web evidence through the runtime evidence method.
- Treat selected URLs as valid only when they came from normalized search results or the injected
  test allowlist.
