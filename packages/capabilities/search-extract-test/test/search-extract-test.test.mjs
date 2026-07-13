import assert from "node:assert/strict";
import { createRuntime } from "@pap/runtime";
import { test } from "vitest";
import {
  createSearchExtractTestCapability,
  searchExtractTestInputSchema,
  searchExtractTestManifest,
  searchExtractTestOutputSchema,
} from "../dist/index.js";

const fixedNow = "2026-07-03T09:00:00.000Z";
const providerId = "provider.searxng";
const articleUrl = "https://example.com/article";

test("manifest declares deterministic web-only search extraction capability", () => {
  assert.equal(searchExtractTestManifest.id, "capability.search-extract-test");
  assert.deepEqual(searchExtractTestManifest.permissions, [
    "web.search",
    "web.fetch",
    "web.evidence.write",
  ]);
  assert.equal(searchExtractTestManifest.memoryPolicyId, "memory.none");
  assert.equal(searchExtractTestManifest.approvalPolicyId, "approval.none");
  assert.equal(searchExtractTestManifest.permissions.includes("llm.generate"), false);
  assert.deepEqual(searchExtractTestManifest.supportedUiBlocks, []);
  assert.deepEqual(searchExtractTestManifest.allowedChildCapabilities, []);
});

test("schemas validate query, optional selectedUrl, optional workspaceId, and bounded output", () => {
  const input = searchExtractTestInputSchema.parse({
    query: "  local agents  ",
    selectedUrl: articleUrl,
    workspaceId: "workspace_search",
  });
  const output = searchExtractTestOutputSchema.parse({
    query: input.query,
    results: [searchResultFixture()],
    selectedResult: {
      index: 0,
      result: searchResultFixture(),
    },
    document: null,
    evidence: {
      searchEvidenceId: "web_search_1",
    },
    warnings: [],
  });

  assert.equal(input.query, "local agents");
  assert.equal(searchExtractTestInputSchema.safeParse({ query: "   " }).success, false);
  assert.equal(
    searchExtractTestInputSchema.safeParse({ query: "x", selectedUrl: "ftp://x" }).success,
    false,
  );
  assert.equal(output.results.length, 1);
});

test("search-only execution succeeds through RuntimeExecutionService and persists search evidence", async () => {
  const harness = createRuntimeHarness();
  const runtime = harness.createRuntime();

  const result = await runtime.execute({
    capabilityId: "capability.search-extract-test",
    input: { query: "local agents" },
    source: "cli",
    workspaceId: "workspace_search",
  });
  const trace = await harness.traceRepository.getById(result.executionId);

  assert.equal(result.status, "completed");
  assert.equal(result.data.document, null);
  assert.equal(result.data.evidence.searchEvidenceId, "web_search_1");
  assert.equal(harness.evidenceRepository.searches.length, 1);
  assert.equal(harness.evidenceRepository.fetches.length, 0);
  assert.deepEqual(
    trace.steps.map((step) => `${step.name}:${step.status}`),
    [
      "validate input:completed",
      "resolve search provider:completed",
      "search provider health check:completed",
      "search web:completed",
      "select URL:skipped",
      "persist web evidence:completed",
      "validate output:completed",
      "finalize execution:completed",
    ],
  );
  assert.equal(JSON.stringify(trace).includes("<html"), false);
});

test("search plus extraction execution succeeds with ordered trace and safe evidence", async () => {
  const harness = createRuntimeHarness();
  const runtime = harness.createRuntime();

  const result = await runtime.execute({
    capabilityId: "capability.search-extract-test",
    input: { query: "local agents", selectedUrl: articleUrl },
    source: "cli",
    workspaceId: "workspace_search",
  });
  const trace = await harness.traceRepository.getById(result.executionId);
  const fetchEvidence = harness.evidenceRepository.fetches[0];
  const extractionEvidence = harness.evidenceRepository.extractions[0];

  assert.equal(result.status, "completed");
  assert.equal(result.data.selectedResult.index, 0);
  assert.equal(result.data.document.method, "readability");
  assert.equal(result.data.evidence.fetchEvidenceId, "web_fetch_1");
  assert.equal(result.data.evidence.extractionEvidenceId, "web_extraction_1");
  assert.deepEqual(
    trace.steps.map((step) => step.name),
    [
      "validate input",
      "resolve search provider",
      "search provider health check",
      "search web",
      "select URL",
      "validate URL policy",
      "fetch URL",
      "resolve source profile",
      "extract readable content",
      "persist web evidence",
      "validate output",
      "finalize execution",
    ],
  );
  assert.equal(fetchEvidence.bodySha256.length, 64);
  assert.equal("html" in fetchEvidence, false);
  assert.equal("contentHtml" in extractionEvidence, false);
  assert.equal(JSON.stringify(trace).includes("contentHtml"), false);
  assert.equal(JSON.stringify(trace).includes("<html"), false);
});

test("search extraction accepts canonically matched selected result URLs", async () => {
  const harness = createRuntimeHarness();
  const runtime = harness.createRuntime();

  const result = await runtime.execute({
    capabilityId: "capability.search-extract-test",
    input: {
      query: "local agents",
      selectedUrl:
        "https://example.com/article/?utm_source=search&srsltid=tracked-fragment#ignored-section",
    },
    source: "cli",
    workspaceId: "workspace_search",
  });
  const trace = await harness.traceRepository.getById(result.executionId);
  const selectionStep = trace.steps.find((step) => step.name === "select URL");

  assert.equal(result.status, "completed");
  assert.equal(result.data.selectedResult.index, 0);
  assert.equal(result.data.document.finalUrl, articleUrl);
  assert.equal(selectionStep.status, "completed");
  assert.equal(selectionStep.metadata.selectionSource, "search_result");
  assert.equal(harness.evidenceRepository.fetches[0].requestedUrl, articleUrl);
});

test("URL policy failure produces safe failed trace and persists search evidence only", async () => {
  const harness = createRuntimeHarness({
    urlPolicyError: new Error("blocked private network target"),
  });
  const runtime = harness.createRuntime();

  const result = await runtime.execute({
    capabilityId: "capability.search-extract-test",
    input: { query: "local agents", selectedUrl: articleUrl },
    source: "cli",
    workspaceId: "workspace_search",
  });
  const trace = await harness.traceRepository.getById(result.executionId);
  const policyStep = trace.steps.find((step) => step.name === "validate URL policy");

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "WEB_FETCH_FAILED");
  assert.equal(policyStep.status, "failed");
  assert.equal(policyStep.metadata.failureCategory, "fetch_url_invalid");
  assert.equal(harness.evidenceRepository.searches.length, 1);
  assert.equal(harness.evidenceRepository.fetches.length, 0);
  assert.equal(JSON.stringify(trace).includes("blocked private network target"), false);
});

test("unsupported selected URL fails safely after search evidence persistence", async () => {
  const harness = createRuntimeHarness();
  const runtime = harness.createRuntime();

  const result = await runtime.execute({
    capabilityId: "capability.search-extract-test",
    input: { query: "local agents", selectedUrl: "https://not-result.example/article" },
    source: "cli",
    workspaceId: "workspace_search",
  });
  const trace = await harness.traceRepository.getById(result.executionId);
  const selectionStep = trace.steps.find((step) => step.name === "select URL");

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "CAPABILITY_INPUT_INVALID");
  assert.equal(selectionStep.status, "failed");
  assert.equal(selectionStep.metadata.failureCategory, "selected_url_not_supported");
  assert.equal(harness.evidenceRepository.searches.length, 1);
  assert.equal(harness.evidenceRepository.fetches.length, 0);
});

function createRuntimeHarness(overrides = {}) {
  const traceRepository = new InMemoryTraceRepository();
  const evidenceRepository = new RecordingWebEvidenceRepository();
  const searchService = {
    async getProviderHealth() {
      return (
        overrides.health ?? {
          providerId,
          kind: "searxng",
          status: "healthy",
          checkedAt: fixedNow,
        }
      );
    },
    async listProviderHealth() {
      return [await this.getProviderHealth(providerId)];
    },
    async search(request) {
      if (overrides.searchError) {
        throw overrides.searchError;
      }

      return {
        providerId,
        query: request.query,
        page: 1,
        pageSize: request.pageSize,
        results: [searchResultFixture()],
        startedAt: fixedNow,
        completedAt: "2026-07-03T09:00:00.100Z",
        durationMs: 100,
        safety: {
          safesearch: request.safesearch,
          language: request.language,
          categories: request.categories,
          timeRange: request.timeRange,
          resultCount: 1,
          omittedResultCount: 0,
          normalizedUrlCount: 1,
        },
        warnings: [],
      };
    },
  };
  const urlSafetyPolicy = {
    async validateUrl(url) {
      if (overrides.urlPolicyError) {
        throw overrides.urlPolicyError;
      }

      return url;
    },
  };
  const guardedFetchClient = {
    async fetch(request) {
      if (overrides.fetchError) {
        throw overrides.fetchError;
      }

      return fetchResultFixture(request.url);
    },
  };
  const sourceProfileService = {
    async findActiveProfileForUrl() {
      return null;
    },
    async extract(request) {
      if (overrides.extractionError) {
        throw overrides.extractionError;
      }

      return extractedDocumentFixture(request.finalUrl);
    },
  };

  return {
    traceRepository,
    evidenceRepository,
    createRuntime() {
      return createRuntime({
        traceRepository,
        capabilities: [createSearchExtractTestCapability()],
        searchService,
        defaultSearchProviderId: providerId,
        urlSafetyPolicy,
        guardedFetchClient,
        sourceProfileService,
        webEvidenceRepository: evidenceRepository,
        clock: () => new Date(fixedNow),
      });
    },
  };
}

function searchResultFixture() {
  return {
    title: "Local agents",
    url: articleUrl,
    displayUrl: "example.com",
    snippet: "A normalized result.",
    publishedAt: null,
    engine: "test",
    category: "general",
    score: null,
  };
}

function fetchResultFixture(url) {
  return {
    requestedUrl: url,
    finalUrl: url,
    statusCode: 200,
    contentType: "text/html",
    contentLength: 128,
    html: "<html><body><article>Readable content for local agents.</article></body></html>",
    text: null,
    redirects: [],
    startedAt: "2026-07-03T09:00:00.200Z",
    completedAt: "2026-07-03T09:00:00.260Z",
    durationMs: 60,
    warnings: [],
    metadata: {
      timeoutMs: 15_000,
      maxBytes: 1_000_000,
      allowRedirects: true,
      maxRedirects: 5,
      acceptedContentTypes: ["text/html", "text/plain"],
      redirectCount: 0,
      contentBytes: 75,
      responseSizeKnown: true,
    },
  };
}

function extractedDocumentFixture(url) {
  const contentText = "Readable content for local agents with enough words for extraction.";

  return {
    title: "Local agents",
    byline: null,
    siteName: "Example",
    publishedAt: null,
    language: "en",
    canonicalUrl: url,
    excerpt: "Readable content for local agents.",
    contentText,
    contentHtml: "<article>Readable content for local agents.</article>",
    wordCount: contentText.trim().split(/\s+/u).length,
    method: "readability",
    warnings: [],
    metadata: {
      requestedUrl: url,
      finalUrl: url,
      sourceProfileId: null,
      contentType: "text/html",
      contentChars: contentText.length,
      originalContentChars: 75,
      maxContentChars: 50_000,
      extractedAt: "2026-07-03T09:00:00.300Z",
    },
  };
}

class RecordingWebEvidenceRepository {
  searches = [];
  fetches = [];
  extractions = [];

  async createSearch(input) {
    const row = { id: `web_search_${this.searches.length + 1}`, ...input };
    this.searches.push(row);
    return row;
  }

  async createFetch(input) {
    const row = { id: `web_fetch_${this.fetches.length + 1}`, ...input };
    this.fetches.push(row);
    return row;
  }

  async createExtraction(input) {
    const row = { id: `web_extraction_${this.extractions.length + 1}`, ...input };
    this.extractions.push(row);
    return row;
  }

  async getByExecution() {
    return {
      searches: this.searches,
      fetches: this.fetches,
      extractions: this.extractions,
    };
  }
}

class InMemoryTraceRepository {
  traces = [];
  steps = [];

  async create(input) {
    const trace = {
      id: input.id,
      capabilityId: input.capabilityId,
      status: "running",
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      startedAt: input.startedAt,
      createdAt: input.startedAt,
      updatedAt: input.startedAt,
      steps: [],
    };
    this.traces.push(trace);
    return this.cloneTrace(trace);
  }

  async appendStep(input) {
    const step = {
      id: input.id,
      executionId: input.executionId,
      sequence: input.sequence,
      kind: input.kind,
      name: input.name,
      status: input.status,
      ...(input.summary ? { summary: input.summary } : {}),
      startedAt: input.startedAt,
      ...(input.completedAt ? { completedAt: input.completedAt } : {}),
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      createdAt: input.startedAt,
    };
    this.steps.push(step);
    return { ...step };
  }

  async markCompleted(input) {
    const trace = this.requireTrace(input.executionId);
    trace.status = "completed";
    trace.completedAt = input.completedAt;
    trace.updatedAt = input.completedAt;
    if (input.output !== undefined) {
      trace.output = input.output;
    }
    return this.cloneTrace(trace);
  }

  async markFailed(input) {
    const trace = this.requireTrace(input.executionId);
    trace.status = "failed";
    trace.completedAt = input.completedAt;
    trace.errorCode = input.error.code;
    trace.errorMessage = input.error.message;
    trace.updatedAt = input.completedAt;
    delete trace.output;
    return this.cloneTrace(trace);
  }

  async markCancelled(input) {
    const trace = this.requireTrace(input.executionId);
    trace.status = "cancelled";
    trace.completedAt = input.completedAt;
    trace.errorCode = "EXECUTION_CANCELLED";
    trace.errorMessage = input.reason ?? "Execution cancelled.";
    trace.updatedAt = input.completedAt;
    delete trace.output;
    return this.cloneTrace(trace);
  }

  async getById(executionId) {
    const trace = this.traces.find((candidate) => candidate.id === executionId);
    return trace ? this.cloneTrace(trace) : null;
  }

  async listRecent() {
    return this.traces.map((trace) => this.cloneTrace(trace));
  }

  async listPage() {
    return {
      executions: [],
      page: 1,
      pageSize: 20,
      total: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    };
  }

  requireTrace(executionId) {
    const trace = this.traces.find((candidate) => candidate.id === executionId);

    if (!trace) {
      throw new Error(`Trace not found: ${executionId}`);
    }

    return trace;
  }

  cloneTrace(trace) {
    return {
      ...trace,
      steps: this.steps
        .filter((step) => step.executionId === trace.id)
        .sort((left, right) => left.sequence - right.sequence)
        .map((step) => ({ ...step })),
    };
  }
}
