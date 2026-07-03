import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { z } from "zod";
import {
  capabilityDefinitionSchema,
  capabilityExecutionContextSchema,
  capabilityExecutionRequestSchema,
  capabilityExecutionResultSchema,
  capabilityManifestSchema,
  createEpisodicMemoryRequestSchema,
  createSemanticMemoryRequestSchema,
  createSourceProfileRequestSchema,
  createWorkspaceRequestSchema,
  episodicMemoryQuerySchema,
  episodicMemoryRecordSchema,
  executionStatusSchema,
  executionTraceListPageSchema,
  executionTraceListQuerySchema,
  extractedDocumentSchema,
  extractionRequestSchema,
  fetchErrorSchema,
  fetchRedirectSchema,
  fetchRequestSchema,
  fetchResultSchema,
  fetchWarningSchema,
  listSourceProfilesQuerySchema,
  listWorkspacesRequestSchema,
  parsePlatformError,
  platformErrorSchema,
  providerHealthSchema,
  searchProviderErrorSchema,
  searchProviderHealthSchema,
  searchRequestSchema,
  searchResponseSchema,
  searchResultSchema,
  semanticMemoryQuerySchema,
  semanticMemoryRecordSchema,
  sourceProfileSchema,
  structuredGenerationRequestSchema,
  structuredGenerationResultSchema,
  updateSourceProfileRequestSchema,
  updateWorkspaceRequestSchema,
  webEvidenceBundleSchema,
  webExtractionEvidenceSchema,
  webFetchEvidenceSchema,
  webSearchEvidenceSchema,
  workspaceSchema,
} from "../dist/index.js";

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

test("executionStatusSchema accepts the initial execution statuses", () => {
  assert.equal(executionStatusSchema.parse("running"), "running");
  assert.equal(executionStatusSchema.parse("completed"), "completed");
  assert.equal(executionStatusSchema.safeParse("awaiting_approval").success, false);
});

test("execution trace list contracts validate filters and page summaries", () => {
  const query = executionTraceListQuerySchema.parse({
    workspaceId: "workspace_contracts",
    capabilityId: "capability.echo",
    status: "completed",
    startedFrom: "2026-07-01T00:00:00.000Z",
    startedTo: "2026-07-01T23:59:59.999Z",
  });
  const page = executionTraceListPageSchema.parse({
    executions: [
      {
        id: "exec_contracts",
        capabilityId: "capability.echo",
        status: "completed",
        workspaceId: "workspace_contracts",
        startedAt: "2026-07-01T12:00:00.000Z",
        completedAt: "2026-07-01T12:01:00.000Z",
        stepCount: 3,
      },
    ],
    page: query.page,
    pageSize: query.pageSize,
    total: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 20);
  assert.equal(page.executions[0].stepCount, 3);
  assert.equal(
    executionTraceListQuerySchema.safeParse({
      startedFrom: "2026-07-02T00:00:00.000Z",
      startedTo: "2026-07-01T00:00:00.000Z",
    }).success,
    false,
  );
});

test("AI provider contracts validate structured generation requests and results", () => {
  const responseSchema = {
    id: "model.echo.output",
    description: "Echo output shape.",
    schema: z.object({ message: z.string() }),
  };

  const request = structuredGenerationRequestSchema.parse({
    providerId: "provider.local_ollama",
    model: "llama3.2:latest",
    systemPrompt: "Return JSON only.",
    prompt: "Say hello.",
    responseSchema,
    temperature: 0.2,
    maxTokens: 512,
    timeoutMs: 60_000,
    keepAlive: "5m",
    metadata: { capabilityId: "capability.echo" },
  });

  const result = structuredGenerationResultSchema.parse({
    providerId: request.providerId,
    model: request.model,
    output: { unexpected: true },
    rawText: '{"unexpected":true}',
    startedAt: "2026-07-02T09:00:00.000Z",
    completedAt: "2026-07-02T09:00:01.000Z",
    durationMs: 1000,
    promptTokenCount: null,
    completionTokenCount: null,
    totalTokenCount: null,
  });

  assert.equal(request.providerId, "provider.local_ollama");
  assert.deepEqual(result.output, { unexpected: true });
});

test("AI provider result contracts compare offset timestamps chronologically", () => {
  const result = {
    providerId: "provider.local_ollama",
    model: "llama3.2:latest",
    output: { message: "hello" },
    rawText: '{"message":"hello"}',
    durationMs: 1000,
    promptTokenCount: null,
    completionTokenCount: null,
    totalTokenCount: null,
  };

  assert.equal(
    structuredGenerationResultSchema.safeParse({
      ...result,
      startedAt: "2026-07-02T10:00:00.000+02:00",
      completedAt: "2026-07-02T08:30:00.000Z",
    }).success,
    true,
  );
  assert.equal(
    structuredGenerationResultSchema.safeParse({
      ...result,
      startedAt: "2026-07-02T08:30:00.000Z",
      completedAt: "2026-07-02T10:00:00.000+02:00",
    }).success,
    false,
  );
});

test("AI provider contracts reject unsupported provider kinds and bounded request fields", () => {
  const responseSchema = {
    id: "model.echo.output",
    schema: z.object({ message: z.string() }),
  };
  const validRequest = {
    providerId: "provider.local_ollama",
    model: "llama3.2:latest",
    systemPrompt: null,
    prompt: "Say hello.",
    responseSchema,
    temperature: null,
    maxTokens: null,
    timeoutMs: 60_000,
    keepAlive: null,
    metadata: null,
  };

  assert.equal(
    providerHealthSchema.safeParse({
      providerId: "provider.remote_openai",
      kind: "openai",
      status: "healthy",
      checkedAt: "2026-07-02T09:00:00.000Z",
    }).success,
    false,
  );
  assert.equal(
    structuredGenerationRequestSchema.safeParse({ ...validRequest, model: "" }).success,
    false,
  );
  assert.equal(
    structuredGenerationRequestSchema.safeParse({ ...validRequest, prompt: "" }).success,
    false,
  );
  assert.equal(
    structuredGenerationRequestSchema.safeParse({ ...validRequest, timeoutMs: 99 }).success,
    false,
  );
  assert.equal(
    structuredGenerationRequestSchema.safeParse({ ...validRequest, maxTokens: 128_001 }).success,
    false,
  );
  assert.equal(
    structuredGenerationRequestSchema.safeParse({
      ...validRequest,
      responseSchema: { id: "x".repeat(161), schema: z.unknown() },
    }).success,
    false,
  );
});

test("search contracts validate bounded requests and nullable defaults", () => {
  const request = searchRequestSchema.parse({
    query: "  local search  ",
  });

  assert.equal(request.query, "local search");
  assert.equal(request.page, null);
  assert.equal(request.pageSize, 10);
  assert.equal(request.language, null);
  assert.equal(request.safesearch, null);
  assert.equal(request.categories, null);
  assert.equal(request.timeRange, null);
  assert.equal(request.providerId, null);
  assert.equal(searchRequestSchema.safeParse({ query: "" }).success, false);
  assert.equal(searchRequestSchema.safeParse({ query: "x", page: 0 }).success, false);
  assert.equal(searchRequestSchema.safeParse({ query: "x", page: 101 }).success, false);
  assert.equal(searchRequestSchema.safeParse({ query: "x", pageSize: 51 }).success, false);
  assert.equal(
    searchRequestSchema.safeParse({
      query: "x",
      categories: Array.from({ length: 9 }, (_, index) => `category_${index}`),
    }).success,
    false,
  );
  assert.equal(searchRequestSchema.safeParse({ query: "x", language: "e" }).success, false);
  assert.equal(searchRequestSchema.safeParse({ query: "x", safesearch: 3 }).success, false);
  assert.equal(searchRequestSchema.safeParse({ query: "x", timeRange: "week" }).success, false);
});

test("search result contracts normalize HTTP URLs and reject unsafe schemes or credentials", () => {
  const result = searchResultSchema.parse({
    title: "Example",
    url: "https://Example.com/a path?q=1",
    displayUrl: "example.com/a path",
    snippet: null,
    publishedAt: null,
    engine: "duckduckgo",
    category: "general",
    score: null,
  });

  assert.equal(result.url, "https://example.com/a%20path?q=1");
  assert.equal(
    searchResultSchema.safeParse({
      ...result,
      url: "ftp://example.com/file",
    }).success,
    false,
  );
  assert.equal(
    searchResultSchema.safeParse({
      ...result,
      url: "https://user:pass@example.com/",
    }).success,
    false,
  );
});

test("search response, provider health, and provider error contracts validate safe shapes", () => {
  const response = searchResponseSchema.parse({
    providerId: "provider.searxng",
    query: "local search",
    page: 1,
    pageSize: 2,
    results: [
      {
        title: "Example",
        url: "https://example.com/",
        displayUrl: "example.com",
        snippet: "A search result.",
        publishedAt: "2026-07-02T09:00:00.000Z",
        engine: "duckduckgo",
        category: "general",
        score: 1,
      },
    ],
    startedAt: "2026-07-02T09:00:00.000Z",
    completedAt: "2026-07-02T09:00:00.250Z",
    durationMs: 250,
    safety: {
      safesearch: 1,
      language: "en",
      categories: ["general"],
      timeRange: "day",
      resultCount: 1,
      omittedResultCount: 0,
      normalizedUrlCount: 1,
    },
  });
  const health = searchProviderHealthSchema.parse({
    providerId: "provider.searxng",
    kind: "searxng",
    status: "healthy",
    checkedAt: "2026-07-02T09:00:00.000Z",
  });
  const error = searchProviderErrorSchema.parse({
    kind: "search_provider_timeout",
    providerId: "provider.searxng",
    message: "Search timed out.",
    retryable: true,
    details: { retryable: true },
  });

  assert.equal(response.warnings.length, 0);
  assert.equal(health.status, "healthy");
  assert.equal(error.retryable, true);
  assert.equal(
    searchResponseSchema.safeParse({
      ...response,
      startedAt: "2026-07-02T09:00:01.000Z",
      completedAt: "2026-07-02T09:00:00.000Z",
    }).success,
    false,
  );
  assert.equal(
    searchProviderHealthSchema.safeParse({
      providerId: "provider.searxng",
      kind: "remote",
      status: "healthy",
      checkedAt: "2026-07-02T09:00:00.000Z",
    }).success,
    false,
  );
});

test("fetch contracts validate bounded requests and safe URL normalization", () => {
  const request = fetchRequestSchema.parse({
    url: "https://Example.com/a path?q=1",
  });

  assert.equal(request.url, "https://example.com/a%20path?q=1");
  assert.equal(request.timeoutMs, null);
  assert.equal(request.maxBytes, null);
  assert.equal(request.allowRedirects, null);
  assert.equal(request.maxRedirects, null);
  assert.equal(request.acceptedContentTypes, null);
  assert.equal(request.workspaceId, null);
  assert.equal(request.sourceProfileId, null);
  assert.equal(fetchRequestSchema.safeParse({ url: "ftp://example.com/file" }).success, false);
  assert.equal(
    fetchRequestSchema.safeParse({ url: "https://user:pass@example.com/" }).success,
    false,
  );
  assert.equal(
    fetchRequestSchema.safeParse({ url: "https://example.com/", timeoutMs: 99 }).success,
    false,
  );
  assert.equal(
    fetchRequestSchema.safeParse({ url: "https://example.com/", maxBytes: 0 }).success,
    false,
  );
  assert.equal(
    fetchRequestSchema.safeParse({ url: "https://example.com/", maxRedirects: 11 }).success,
    false,
  );
  assert.equal(
    fetchRequestSchema.safeParse({
      url: "https://example.com/",
      acceptedContentTypes: ["application/pdf"],
    }).success,
    false,
  );
});

test("fetch result, redirect, warning, metadata, and error contracts validate safe shapes", () => {
  const redirect = fetchRedirectSchema.parse({
    fromUrl: "https://example.com/start",
    toUrl: "https://example.com/final",
    statusCode: 302,
  });
  const warning = fetchWarningSchema.parse({
    code: "fetch_redirect_followed",
    message: "Redirect followed.",
    count: 1,
  });
  const result = fetchResultSchema.parse({
    requestedUrl: "https://example.com/start",
    finalUrl: "https://example.com/final",
    statusCode: 200,
    contentType: "text/html",
    contentLength: 18,
    html: "<h1>Hello</h1>",
    text: null,
    redirects: [redirect],
    startedAt: "2026-07-03T09:00:00.000Z",
    completedAt: "2026-07-03T09:00:00.250Z",
    durationMs: 250,
    warnings: [warning],
    metadata: {
      timeoutMs: 15_000,
      maxBytes: 1_000_000,
      allowRedirects: true,
      maxRedirects: 5,
      acceptedContentTypes: ["text/html", "text/plain"],
      redirectCount: 1,
      contentBytes: 14,
      responseSizeKnown: true,
    },
  });
  const error = fetchErrorSchema.parse({
    kind: "fetch_timeout",
    message: "Fetch timed out.",
    retryable: true,
    details: { retryable: true },
  });

  assert.equal(result.finalUrl, "https://example.com/final");
  assert.equal(result.warnings[0].code, "fetch_redirect_followed");
  assert.equal(error.retryable, true);
  assert.equal(fetchRedirectSchema.safeParse({ ...redirect, statusCode: 200 }).success, false);
  assert.equal(
    fetchResultSchema.safeParse({
      ...result,
      html: "<h1>Hello</h1>",
      text: "Hello",
    }).success,
    false,
  );
  assert.equal(
    fetchResultSchema.safeParse({
      ...result,
      startedAt: "2026-07-03T09:00:01.000Z",
      completedAt: "2026-07-03T09:00:00.000Z",
    }).success,
    false,
  );
  assert.equal(
    fetchErrorSchema.safeParse({ kind: "fetch_unknown", message: "Nope." }).success,
    false,
  );
});

test("web evidence contracts persist bounded normalized metadata only", () => {
  const searchEvidence = webSearchEvidenceSchema.parse({
    id: "web_search_evidence_contract",
    executionId: "exec_contract_web",
    workspaceId: "workspace_contract_web",
    providerId: "provider.searxng",
    query: "local agents",
    request: {
      query: "local agents",
      page: null,
      pageSize: 10,
      language: null,
      safesearch: null,
      categories: null,
      timeRange: null,
      providerId: "provider.searxng",
    },
    status: "completed",
    resultCount: 1,
    results: [
      {
        title: "Local agents",
        url: "https://example.com/article",
        displayUrl: "example.com",
        snippet: "A normalized result.",
        publishedAt: null,
        engine: "test",
        category: "general",
        score: null,
      },
    ],
    warnings: [],
    failureCategory: null,
    failureMessage: null,
    startedAt: "2026-07-03T09:00:00.000Z",
    completedAt: "2026-07-03T09:00:00.125Z",
    durationMs: 125,
    createdAt: "2026-07-03T09:00:00.130Z",
    expiresAt: "2026-08-02T09:00:00.130Z",
  });
  const fetchEvidence = webFetchEvidenceSchema.parse({
    id: "web_fetch_evidence_contract",
    executionId: searchEvidence.executionId,
    workspaceId: searchEvidence.workspaceId,
    searchEvidenceId: searchEvidence.id,
    selectedUrlSource: "search_result",
    selectedResultIndex: 0,
    requestedUrl: "https://example.com/article",
    finalUrl: "https://example.com/article",
    status: "completed",
    statusCode: 200,
    contentType: "text/html",
    contentLength: 1_024,
    contentBytes: 1_024,
    bodySha256: "a".repeat(64),
    redirects: [],
    warnings: [],
    failureCategory: null,
    failureMessage: null,
    startedAt: "2026-07-03T09:00:00.200Z",
    completedAt: "2026-07-03T09:00:00.300Z",
    durationMs: 100,
    createdAt: "2026-07-03T09:00:00.310Z",
    expiresAt: "2026-08-02T09:00:00.310Z",
  });
  const extractionEvidence = webExtractionEvidenceSchema.parse({
    id: "web_extraction_evidence_contract",
    executionId: searchEvidence.executionId,
    workspaceId: searchEvidence.workspaceId,
    fetchEvidenceId: fetchEvidence.id,
    finalUrl: "https://example.com/article",
    status: "completed",
    extractionMethod: "readability",
    sourceProfileId: null,
    title: "Local agents",
    byline: null,
    siteName: "Example",
    publishedAt: null,
    canonicalUrl: "https://example.com/article",
    excerpt: "Readable content.",
    wordCount: 2,
    contentTextSnapshot: "Readable content.",
    contentTextSha256: "b".repeat(64),
    contentChars: 17,
    originalContentChars: 2_048,
    warnings: [],
    failureCategory: null,
    failureMessage: null,
    startedAt: "2026-07-03T09:00:00.320Z",
    completedAt: "2026-07-03T09:00:00.360Z",
    durationMs: 40,
    createdAt: "2026-07-03T09:00:00.370Z",
    expiresAt: "2026-08-02T09:00:00.370Z",
  });
  const failedFetch = webFetchEvidenceSchema.parse({
    ...fetchEvidence,
    id: "web_fetch_evidence_failed",
    finalUrl: null,
    status: "failed",
    statusCode: null,
    contentType: null,
    contentLength: null,
    contentBytes: null,
    bodySha256: null,
    failureCategory: "fetch_url_blocked",
    failureMessage: "Fetch URL is blocked by URL safety policy.",
  });

  assert.equal(searchEvidence.results.length, 1);
  assert.equal(fetchEvidence.bodySha256.length, 64);
  assert.equal(extractionEvidence.contentTextSnapshot.includes("<html"), false);
  assert.equal(failedFetch.failureCategory, "fetch_url_blocked");
  assert.equal(
    webFetchEvidenceSchema.safeParse({ ...fetchEvidence, rawHtml: "<html>unsafe</html>" }).success,
    false,
  );
  assert.equal(
    webFetchEvidenceSchema.safeParse({ ...fetchEvidence, authorizationHeader: "Bearer token" })
      .success,
    false,
  );
  assert.deepEqual(
    webEvidenceBundleSchema
      .parse({
        searches: [searchEvidence],
        fetches: [fetchEvidence, failedFetch],
        extractions: [extractionEvidence],
      })
      .searches.map((evidence) => evidence.id),
    [searchEvidence.id],
  );
});

test("extraction contracts validate bounded normalized documents and methods", () => {
  const request = extractionRequestSchema.parse({
    finalUrl: "https://example.com/articles/one",
    html: "<article>Hello world from a bounded article body.</article>",
    contentType: "text/html",
  });
  const document = extractedDocumentSchema.parse({
    title: "Example Article",
    byline: null,
    siteName: "Example",
    publishedAt: null,
    language: "en",
    canonicalUrl: "https://example.com/articles/one",
    excerpt: "Hello world",
    contentText: "Hello world from a bounded article body.",
    contentHtml: "<article>Hello world from a bounded article body.</article>",
    wordCount: 7,
    method: "readability",
    warnings: [
      {
        code: "extraction_metadata_missing",
        method: "readability",
        message: "Metadata was incomplete.",
      },
    ],
    metadata: {
      requestedUrl: null,
      finalUrl: "https://example.com/articles/one",
      sourceProfileId: null,
      contentType: "text/html",
      contentChars: 40,
      originalContentChars: 56,
      maxContentChars: 50_000,
      extractedAt: "2026-07-03T09:00:00.000Z",
    },
  });

  assert.equal(request.html.includes("article"), true);
  assert.equal(document.method, "readability");
  assert.equal(extractedDocumentSchema.safeParse({ ...document, method: "llm" }).success, false);
  assert.equal(
    extractedDocumentSchema.safeParse({
      ...document,
      contentText: "Hello world",
      wordCount: 7,
    }).success,
    false,
  );
  assert.equal(
    extractionRequestSchema.safeParse({
      finalUrl: "https://example.com/articles/one",
    }).success,
    false,
  );
});

test("source profile contracts normalize domains and enforce archive rules", () => {
  const createRequest = createSourceProfileRequestSchema.parse({
    domain: "News.Example.COM.",
    name: "Example News",
    articleContainerSelector: "main.article",
    contentSelector: "article .body",
  });
  const profile = sourceProfileSchema.parse({
    id: "source_profile_example",
    domain: createRequest.domain,
    name: createRequest.name,
    status: "active",
    articleContainerSelector: createRequest.articleContainerSelector,
    titleSelector: null,
    bylineSelector: null,
    publishedAtSelector: null,
    contentSelector: createRequest.contentSelector,
    canonicalUrlSelector: null,
    notes: null,
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
    archivedAt: null,
  });

  assert.equal(createRequest.domain, "news.example.com");
  assert.equal(profile.status, "active");
  assert.equal(
    sourceProfileSchema.safeParse({
      ...profile,
      status: "archived",
      archivedAt: null,
    }).success,
    false,
  );
  assert.equal(
    createSourceProfileRequestSchema.safeParse({ domain: "https://example.com" }).success,
    false,
  );
  assert.equal(
    updateSourceProfileRequestSchema.safeParse({ id: "source_profile_example" }).success,
    true,
  );
  assert.deepEqual(listSourceProfilesQuerySchema.parse({}), {
    includeArchived: false,
    limit: 50,
    offset: 0,
  });
});

test("platformErrorSchema validates typed platform errors", () => {
  const error = parsePlatformError({
    code: "CAPABILITY_NOT_FOUND",
    message: "Capability was not registered.",
    category: "capability",
  });

  assert.equal(error.retryable, false);
  assert.equal(
    platformErrorSchema.safeParse({ code: "bad", message: "", category: "unknown" }).success,
    false,
  );
});

test("capabilityManifestSchema validates required runtime metadata", () => {
  const manifest = capabilityManifestSchema.parse({
    id: "capability.echo",
    version: "0.1.0",
    name: "Echo",
    description: "Returns normalized text input.",
    skill: {
      id: "skill.echo",
      version: "0.1.0",
      path: "./skills/echo",
    },
    inputSchemaId: "capability.echo.input.v1",
    outputSchemaId: "capability.echo.output.v1",
    approvalPolicyId: "approval.none",
    memoryPolicyId: "memory.none",
    trustLevel: "core",
  });

  assert.equal(manifest.skill.entryFile, "SKILL.md");
  assert.deepEqual(manifest.allowedTools, []);
  assert.deepEqual(manifest.permissions, []);
  assert.equal(
    capabilityManifestSchema.safeParse({
      ...manifest,
      permissions: ["web.search", "web.fetch", "web.evidence.write"],
    }).success,
    true,
  );
  assert.deepEqual(manifest.sideEffects, ["none"]);
  assert.equal(
    capabilityManifestSchema.safeParse({
      id: "bad id",
      version: "0.1.0",
      name: "Echo",
      description: "Returns normalized text input.",
      skill: {
        id: "skill.echo",
        version: "0.1.0",
        path: "./skills/echo",
      },
      inputSchemaId: "capability.echo.input.v1",
      outputSchemaId: "capability.echo.output.v1",
      approvalPolicyId: "approval.none",
      memoryPolicyId: "memory.none",
      trustLevel: "core",
    }).success,
    false,
  );
  assert.equal(
    capabilityManifestSchema.safeParse({
      id: "capability.echo",
      version: "0.1.0",
      name: "Echo",
    }).success,
    false,
  );
});

test("capabilityExecutionRequestSchema validates capability execution requests", () => {
  const request = capabilityExecutionRequestSchema.parse({
    capabilityId: "capability.echo",
    input: { message: "hello" },
    source: "cli",
  });

  assert.equal(request.capabilityId, "capability.echo");
  assert.equal(request.requestedUi, true);
  assert.deepEqual(request.context, { initiatedBy: "user" });
  assert.equal(
    capabilityExecutionRequestSchema.safeParse({ input: {}, source: "cli" }).success,
    false,
  );
  assert.equal(
    capabilityExecutionRequestSchema.safeParse({
      capabilityId: "capability echo",
      input: {},
      source: "cli",
    }).success,
    false,
  );
});

test("capabilityExecutionResultSchema validates results and rejects deferred statuses", () => {
  const result = capabilityExecutionResultSchema.parse({
    executionId: "exec_123",
    traceId: "exec_123",
    capabilityId: "capability.echo",
    status: "completed",
    data: { message: "hello" },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.ui, []);
  assert.deepEqual(result.approvals, []);
  assert.equal(
    capabilityExecutionResultSchema.safeParse({
      executionId: "exec_123",
      traceId: "exec_123",
      capabilityId: "capability.echo",
      status: "awaiting_approval",
    }).success,
    false,
  );
});

test("capabilityDefinitionSchema validates executable definitions", () => {
  const manifest = capabilityManifestSchema.parse({
    id: "capability.echo",
    version: "0.1.0",
    name: "Echo",
    description: "Returns normalized text input.",
    skill: {
      id: "skill.echo",
      version: "0.1.0",
      path: "./skills/echo",
    },
    inputSchemaId: "capability.echo.input.v1",
    outputSchemaId: "capability.echo.output.v1",
    approvalPolicyId: "approval.none",
    memoryPolicyId: "memory.none",
    trustLevel: "core",
  });

  const definition = capabilityDefinitionSchema.parse({
    manifest,
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.object({ message: z.string() }),
    execute: async (input) => input,
  });

  assert.equal(definition.manifest.id, "capability.echo");
  assert.equal(
    capabilityDefinitionSchema.safeParse({
      manifest,
      inputSchema: {},
      outputSchema: z.unknown(),
      execute: async (input) => input,
    }).success,
    false,
  );
});

test("capabilityExecutionContextSchema validates runtime context shape", () => {
  const manifest = capabilityManifestSchema.parse({
    id: "capability.echo",
    version: "0.1.0",
    name: "Echo",
    description: "Returns normalized text input.",
    skill: {
      id: "skill.echo",
      version: "0.1.0",
      path: "./skills/echo",
    },
    inputSchemaId: "capability.echo.input.v1",
    outputSchemaId: "capability.echo.output.v1",
    approvalPolicyId: "approval.none",
    memoryPolicyId: "memory.none",
    trustLevel: "core",
  });

  const context = capabilityExecutionContextSchema.parse({
    executionId: "exec_123",
    capability: manifest,
    source: "cli",
    trace: {
      addStep: async () => undefined,
    },
    tools: {
      execute: async () => undefined,
    },
    memory: {
      getMasterProfile: async () => undefined,
      search: async () => undefined,
      write: async () => undefined,
    },
    llm: {
      generateStructured: async () => undefined,
      getProviderHealth: async () => ({
        providerId: "provider.local_ollama",
        kind: "ollama",
        status: "healthy",
        checkedAt: "2026-07-02T09:00:00.000Z",
      }),
    },
    web: {
      resolveSearchProvider: async () => "provider.searxng",
      getSearchProviderHealth: async () => ({
        providerId: "provider.searxng",
        kind: "searxng",
        status: "healthy",
        checkedAt: "2026-07-03T09:00:00.000Z",
      }),
      search: async () => ({
        providerId: "provider.searxng",
        query: "local agents",
        page: 1,
        pageSize: 10,
        results: [],
        startedAt: "2026-07-03T09:00:00.000Z",
        completedAt: "2026-07-03T09:00:00.100Z",
        durationMs: 100,
        safety: {
          safesearch: null,
          language: null,
          categories: null,
          timeRange: null,
          resultCount: 0,
          omittedResultCount: 0,
          normalizedUrlCount: 0,
        },
        warnings: [],
      }),
      validateUrlPolicy: async (url) => url,
      fetch: async () => undefined,
      resolveSourceProfile: async () => null,
      extract: async () => undefined,
      persistEvidence: async () => ({ evidenceCount: 0 }),
    },
    ui: {
      build: async (blocks) => blocks,
    },
    approvals: {
      request: async (input) => input,
    },
  });

  assert.equal(context.capability.id, "capability.echo");
});

test("contract JSON fixtures remain valid", async () => {
  const manifest = await loadFixture("manifest.echo.json");
  const result = await loadFixture("execution-result.completed.json");

  assert.equal(capabilityManifestSchema.parse(manifest).id, "capability.echo");
  assert.equal(capabilityExecutionResultSchema.parse(result).status, "completed");
});

test("workspace contracts validate IDs, bounded names, defaults, and list requests", () => {
  const workspace = workspaceSchema.parse({
    id: "workspace_123",
    name: "  Personal OS  ",
    status: "active",
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
  });

  assert.equal(workspace.name, "Personal OS");
  assert.equal(workspace.description, "");
  assert.equal(createWorkspaceRequestSchema.safeParse({ name: "" }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...workspace, id: "x" }).success, false);
  assert.deepEqual(listWorkspacesRequestSchema.parse({}), {
    includeArchived: false,
    limit: 50,
    offset: 0,
  });
  assert.equal(updateWorkspaceRequestSchema.safeParse({ id: "workspace_123" }).success, false);
});

test("semantic memory contracts validate JSON values, confidence, and scope rules", () => {
  const memory = semanticMemoryRecordSchema.parse({
    id: "memory_123",
    scope: "workspace",
    workspaceId: "workspace_123",
    subject: "project.paos",
    predicate: "uses",
    value: { database: "sqlite", confidence: 1, tags: ["local-first"] },
    sourceType: "manual",
    status: "active",
    confidence: 0.8,
    sensitivity: "low",
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
  });

  assert.equal(memory.createdBy, "user");
  assert.deepEqual(memory.evidenceRefs, []);
  assert.equal(
    createSemanticMemoryRequestSchema.safeParse({
      scope: "workspace",
      subject: "project.paos",
      predicate: "uses",
      value: "sqlite",
      confidence: 1.1,
    }).success,
    false,
  );
  assert.equal(
    createSemanticMemoryRequestSchema.safeParse({
      scope: "workspace",
      subject: "project.paos",
      predicate: "uses",
      value: "sqlite",
    }).success,
    false,
  );
  assert.equal(
    createSemanticMemoryRequestSchema.safeParse({
      scope: "personal",
      subject: "bad",
      predicate: "bad",
      value: () => undefined,
    }).success,
    false,
  );
});

test("memory query contracts apply bounded defaults and reject inverted ranges", () => {
  const semanticQuery = semanticMemoryQuerySchema.parse({});
  const episodicQuery = episodicMemoryQuerySchema.parse({ limit: 100, offset: 2 });

  assert.equal(semanticQuery.status, "active");
  assert.equal(semanticQuery.includeExpired, false);
  assert.equal(semanticQuery.limit, 50);
  assert.equal(episodicQuery.limit, 100);
  assert.equal(episodicQuery.offset, 2);
  assert.equal(semanticMemoryQuerySchema.safeParse({ limit: 101 }).success, false);
  assert.equal(
    semanticMemoryQuerySchema.safeParse({ confidenceMin: 0.9, confidenceMax: 0.1 }).success,
    false,
  );
});

test("episodic memory contracts validate execution links and JSON-compatible arrays", () => {
  const episode = episodicMemoryRecordSchema.parse({
    id: "memory_episode_123",
    scope: "capability",
    capabilityId: "capability.echo",
    executionId: "exec_123",
    eventType: "capability.completed",
    summary: "Echo completed successfully.",
    relatedEntities: [{ type: "workspace", id: "workspace_123" }],
    evidenceRefs: ["exec_123"],
    sourceType: "execution",
    status: "active",
    confidence: 1,
    sensitivity: "low",
    createdAt: "2026-06-30T09:00:00.000Z",
    updatedAt: "2026-06-30T09:00:00.000Z",
  });

  assert.equal(episode.executionId, "exec_123");
  assert.equal(
    createEpisodicMemoryRequestSchema.safeParse({
      scope: "thread",
      eventType: "capability.completed",
      summary: "Echo completed successfully.",
    }).success,
    false,
  );
  assert.equal(
    createEpisodicMemoryRequestSchema.safeParse({
      scope: "personal",
      eventType: "capability.completed",
      summary: "Echo completed successfully.",
      relatedEntities: [undefined],
    }).success,
    false,
  );
});

async function loadFixture(fileName) {
  return JSON.parse(await readFile(join(fixtureDirectory, fileName), "utf8"));
}
