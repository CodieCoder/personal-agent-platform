# PAP-066 to PAP-067 Safe Fetch Foundation

Date: 2026-07-03
Status: Accepted for implementation
Tickets: PAP-066, PAP-067

## Scope

Add the Milestone 4.2 safe web-fetch foundation only:

- Provider-neutral fetch contracts in `@pap/contracts`.
- URL safety policy and typed fetch errors.
- A new `@pap/tools-web` package with policy validation and a guarded HTTP fetch client.
- Native `fetch`/AbortController timeout and cancellation handling.
- Manual redirect handling with policy revalidation for every redirect target.
- Content-type, content-length, streaming size, timeout, and redirect-count safeguards.
- Unit coverage for contracts, URL policy, redirects, content limits, content type rejection, timeout,
  network errors, and safe typed error mapping.

Do not add extraction, capabilities, UI, persistence, runtime trace integration, model calls, memory
writes, browser automation, Crawlee, Firecrawl, or scheduling.

## Decisions

- Create `packages/contracts/src/web.ts` for safe fetch schemas and export it from
  `@pap/contracts`.
- Create `@pap/tools-web` as the deterministic web-fetch package. It owns URL policy and fetch
  transport behavior but does not depend on runtime, storage, capabilities, web app, SearXNG, or
  extraction packages.
- Keep URL validation in two layers:
  - Zod request/result contracts validate bounded shape, HTTP/HTTPS schemes, and URL credentials.
  - `@pap/tools-web` policy validates network destinations and redirects, including loopback,
    link-local, and RFC1918/private-network targets.
- Treat DNS resolution as injectable so policy checks are independently testable without public
  network access.
- Use `redirect: "manual"` and re-run the URL policy before following each redirect.
- Use a bounded stream reader when response bodies do not provide a reliable `content-length`; reject
  oversized bodies as soon as the configured limit is exceeded.
- Support HTML and plain text only in this slice. Reject PDFs, images, archives, video, and unknown
  binary content through `fetch_content_type_unsupported`.
- Normalize all fetch failures into the explicit fetch error categories from the backlog without
  exposing raw stack traces or transport internals.

## Contract Shapes

Add Zod contracts with inferred TypeScript types:

- `fetchUrlSchema`
- `fetchRequestSchema`
- `fetchRedirectSchema`
- `fetchWarningSchema`
- `fetchMetadataSchema`
- `fetchResultSchema`
- `fetchErrorSchema`

The request includes:

```text
url
timeoutMs nullable
maxBytes nullable
allowRedirects nullable
maxRedirects nullable
acceptedContentTypes nullable
workspaceId nullable
sourceProfileId nullable
```

The result includes:

```text
requestedUrl
finalUrl
statusCode
contentType nullable
contentLength nullable
html nullable
text nullable
redirects
startedAt
completedAt
durationMs
warnings
```

Fetch error kinds:

```text
fetch_url_invalid
fetch_url_blocked
fetch_timeout
fetch_redirect_limit
fetch_redirect_blocked
fetch_http_error
fetch_content_type_unsupported
fetch_response_too_large
fetch_network_error
fetch_invalid_response
```

## Files

- Add `packages/contracts/src/web.ts`.
- Update `packages/contracts/src/index.ts`.
- Update `packages/contracts/test/contracts.test.mjs`.
- Add `packages/tools-web/package.json`.
- Add `packages/tools-web/tsconfig.json`.
- Add `packages/tools-web/src/index.ts`.
- Add `packages/tools-web/src/errors.ts`.
- Add `packages/tools-web/src/fetch-policy.ts`.
- Add `packages/tools-web/src/fetch-client.ts`.
- Add `packages/tools-web/test/fetch-policy.test.mjs`.
- Add `packages/tools-web/test/fetch-client.test.mjs`.
- Update `tsconfig.json` references.
- Update `vitest.workspace.ts` unit-test includes.
- Update package metadata/lockfile only as required by the new workspace package.

## Dependencies

- Existing `@pap/contracts` Zod contract package.
- Existing Phase 4 search URL-contract patterns.
- Node.js LTS native `fetch`, `Response`, `Headers`, `ReadableStream`, and `AbortController`.
- `node:dns/promises` for default hostname resolution in policy checks.
- Vitest unit test baseline.

## Verification Commands

- `pnpm --filter @pap/contracts test`
- `pnpm --filter @pap/tools-web test`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm lint`
- `pnpm format:check`
- `git diff --check`

## Test Strategy

- Contract tests cover request defaults, URL normalization, credential rejection, unsupported
  schemes, redirect/result/warning/error shapes, and response timing validation.
- URL policy tests use injected DNS resolution only and cover unsupported schemes, credentials,
  loopback, link-local, RFC1918/private IPv4, private IPv6, public addresses, and redirect-specific
  blocked errors.
- Fetch client tests use injected fetch transport only; no live public network calls.
- Fetch client tests cover success for HTML/plain text, manual redirects, redirect limits, redirect
  policy revalidation, HTTP errors, unsupported content types, content-length rejection, streaming
  size rejection, timeout via AbortController, network errors, and invalid response objects.

## Out Of Scope

- Article extraction, Readability, source profiles, selector extraction, source-profile storage, web
  evidence persistence, runtime trace integration, search/extract capability, web UI, Playwright,
  QA-Intel, memory reads/writes, model calls, browser automation, Crawlee, Firecrawl, scheduling, or
  Docker service additions.
- Browser cookies, local auth state forwarding, credentialed requests, custom headers, POST/PUT
  methods, retries, robots policy, rate limiting, and multi-page crawling.

## Risks And Assumptions

- The prompt path `docs/20-phase-4-search-and-web-extraction-backlog.md` is represented in this
  repository as `docs/backlogs/20-phase-4-search-and-web-extraction-backlog.md`.
- DNS rebinding protection is limited to resolving and validating the target hostname immediately
  before each fetch attempt in this slice. Future hardened transports may need socket-level address
  pinning if threat requirements increase.
- `content-length` may be absent or inaccurate, so the streaming guard is authoritative.
- `redirect: "manual"` response behavior can vary by runtime, so missing redirect locations are
  treated as `fetch_invalid_response`.
