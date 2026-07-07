import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildResearchSemanticMemoryProposals,
  buildResearchSourceAnalysis,
  buildCandidatePoolTraceMetadata,
  buildQueryPlanTraceMetadata,
  buildSearchRequests,
  buildSourceSelectionTraceMetadata,
  canonicalizeResearchUrl,
  evaluateResearchMemoryProposalEligibility,
  findUnsupportedFindingCitationIds,
  normalizeResearchCandidates,
  planResearchQueries,
  researchArticleAnalysisOutputSchema,
  researchSourceRankingOutputSchema,
  selectResearchSources,
  synthesizeResearchReport,
  validateResearchReportCitations,
  validateResearchSourceRankingOutput,
} from "../dist/index.js";

const baseRequest = {
  question: "  What changed in local-first agent research\u0000this week?  ",
  focus: " developer tools ",
  timeRange: "week",
  maxSources: 3,
  maxSearchResults: 7,
  language: "en",
  categories: ["technology"],
};

test("query planning is deterministic, bounded, and builds bounded search requests", () => {
  const firstPlan = planResearchQueries(baseRequest);
  const secondPlan = planResearchQueries(baseRequest);
  const searchRequests = buildSearchRequests(firstPlan, baseRequest, {
    providerId: "provider.searxng",
    safesearch: 1,
  });

  assert.deepEqual(firstPlan, secondPlan);
  assert.equal(firstPlan.createdAt, "1970-01-01T00:00:00.000Z");
  assert.deepEqual(
    firstPlan.queries.map((query) => query.reason),
    ["primary", "focus_variant", "time_range_variant", "focus_time_range_variant"],
  );
  assert.equal(firstPlan.queries[0].query, "What changed in local-first agent research this week?");
  assert.deepEqual(
    searchRequests.map((searchRequest) => searchRequest.request.pageSize),
    [2, 2, 2, 1],
  );
  assert.equal(searchRequests[0].request.timeRange, null);
  assert.equal(searchRequests[0].request.providerId, "provider.searxng");
});

test("query planning truncates long search queries at word boundaries with trace-safe warnings", () => {
  const plan = planResearchQueries({
    question: `${"agent research ".repeat(60)}bounded evidence`,
    maxSearchResults: 2,
  });

  assert.equal(plan.queries.length, 1);
  assert.equal(plan.queries[0].query.length <= 500, true);
  assert.equal(plan.warnings[0].code, "query_truncated");
});

test("research URL canonicalization removes tracking noise and rejects unsafe URLs", () => {
  assert.equal(
    canonicalizeResearchUrl(
      "HTTPS://WWW.Example.COM:443/articles/update/?b=2&utm_source=newsletter&a=1#section",
    ),
    "https://www.example.com/articles/update?a=1&b=2",
  );
  assert.throws(() => canonicalizeResearchUrl("ftp://example.com/article"));
  assert.throws(() => canonicalizeResearchUrl("https://user:pass@example.com/article"));
});

test("candidate normalization deduplicates canonical URLs and preserves provenance", () => {
  const plan = planResearchQueries(baseRequest);
  const pool = normalizeResearchCandidates({
    queryPlan: plan,
    searches: [
      {
        queryId: plan.queries[0].queryId,
        searchEvidenceId: "web_search_one",
        providerId: "provider.searxng",
        results: [
          {
            title: " Local-first agent research ",
            url: "https://Example.com/articles/research/?utm_campaign=x&b=2&a=1#top",
            displayUrl: "Example.com/articles/research",
            snippet: " A bounded snippet. ",
            publishedAt: "2026-07-04T09:00:00.000Z",
            engine: "duckduckgo",
            category: "technology",
            score: 0.8,
          },
          {
            title: "Duplicate local-first agent research",
            url: "https://example.com/articles/research?a=1&b=2",
            displayUrl: "example.com/articles/research",
            snippet: "Another bounded snippet.",
            publishedAt: "2026-07-04T10:00:00.000Z",
            engine: "brave",
            category: "technology",
            score: 0.7,
          },
          {
            title: "   ",
            url: "https://missing-title.example/post",
          },
          {
            title: "Invalid URL",
            url: "ftp://example.com/not-allowed",
          },
        ],
      },
      {
        queryId: plan.queries[1].queryId,
        searchEvidenceId: "web_search_failed",
        providerId: "provider.searxng",
        status: "failed",
        failureCategory: "search_provider_timeout",
        failureMessage: "Search timed out.",
        results: [],
      },
      {
        queryId: plan.queries[2].queryId,
        searchEvidenceId: "web_search_two",
        providerId: "provider.searxng",
        results: [
          {
            title: "Independent source",
            url: "https://independent.example/research",
            publishedAt: null,
          },
        ],
      },
    ],
  });

  assert.equal(pool.candidates.length, 2);
  assert.equal(pool.candidates[0].canonicalUrl, "https://example.com/articles/research?a=1&b=2");
  assert.equal(pool.candidates[0].duplicateCount, 1);
  assert.deepEqual(
    pool.candidates[0].provenance.map((provenance) => provenance.role),
    ["primary", "duplicate"],
  );
  assert.deepEqual(
    pool.exclusions.map((exclusion) => exclusion.reason),
    ["candidate_title_missing", "candidate_url_invalid", "search_evidence_failed"],
  );
  assert.equal(pool.deduplications[0].reason, "duplicate_canonical_url");
});

test("source selection respects source limits, domain diversity, and failed-source skips", () => {
  const plan = planResearchQueries({
    question: "Research local agent infrastructure",
    timeRange: "month",
    maxSources: 2,
    maxSearchResults: 5,
  });
  const pool = normalizeResearchCandidates({
    queryPlan: plan,
    searches: [
      {
        queryId: plan.queries[0].queryId,
        searchEvidenceId: "web_search_selection",
        providerId: "provider.searxng",
        results: [
          {
            title: "Older same-domain source",
            url: "https://example.com/older",
            publishedAt: "2026-07-01T09:00:00.000Z",
          },
          {
            title: "Different domain source",
            url: "https://different.example/research",
            publishedAt: "2026-07-02T09:00:00.000Z",
          },
          {
            title: "Newest same-domain source",
            url: "https://example.com/newer",
            publishedAt: "2026-07-04T09:00:00.000Z",
          },
          {
            title: "Deferred source",
            url: "https://deferred.example/research",
            publishedAt: null,
          },
        ],
      },
    ],
  });
  const selection = selectResearchSources({
    request: { question: plan.question, timeRange: "month", maxSources: 2 },
    candidatePool: pool,
    failedSourceIds: [pool.candidates[0].sourceId],
  });

  assert.equal(selection.extractionBudget, 2);
  assert.equal(selection.selected.length, 2);
  assert.equal(
    selection.exclusions.some((exclusion) => exclusion.reason === "extraction_failed"),
    true,
  );
  assert.deepEqual(
    selection.selected.map((source) => source.normalizedHostname),
    ["different.example", "example.com"],
  );
  assert.equal(new Set(selection.selected.map((source) => source.canonicalUrl)).size, 2);
});

test("trace metadata exposes bounded reasons without snippets or raw provider payloads", () => {
  const plan = planResearchQueries(baseRequest);
  const pool = normalizeResearchCandidates({
    queryPlan: plan,
    searches: [
      {
        queryId: plan.queries[0].queryId,
        providerId: "provider.searxng",
        results: [{ title: "Example", url: "https://example.com/research" }],
      },
    ],
  });
  const selection = selectResearchSources({
    request: baseRequest,
    candidatePool: pool,
  });
  const planMetadata = buildQueryPlanTraceMetadata(plan);
  const poolMetadata = buildCandidatePoolTraceMetadata(pool);
  const selectionMetadata = buildSourceSelectionTraceMetadata(selection);

  assert.deepEqual(planMetadata.queryReasons, [
    "primary",
    "focus_variant",
    "time_range_variant",
    "focus_time_range_variant",
  ]);
  assert.equal(poolMetadata.candidateCount, 1);
  assert.equal(selectionMetadata.extractionBudget, 1);
  assert.equal("snippet" in poolMetadata, false);
  assert.equal("rawProviderPayload" in poolMetadata, false);
});

test("source ranking validation accepts known sources and rejects hallucinated IDs", () => {
  const output = {
    rankings: [
      {
        sourceId: "research_source_alpha",
        relevanceScore: 0.92,
        relevanceLabel: "high",
        reason: "Directly addresses the research question.",
        recommendedForSynthesis: true,
      },
    ],
  };

  assert.deepEqual(
    validateResearchSourceRankingOutput({
      output,
      sourceIds: ["research_source_alpha"],
    }),
    output,
  );
  assert.throws(() =>
    validateResearchSourceRankingOutput({
      output: {
        rankings: [
          {
            sourceId: "research_source_missing",
            relevanceScore: 0.5,
            relevanceLabel: "medium",
            reason: "Looks relevant but was not selected.",
            recommendedForSynthesis: true,
          },
        ],
      },
      sourceIds: ["research_source_alpha"],
    }),
  );
  assert.throws(() =>
    researchSourceRankingOutputSchema.parse({
      rankings: [
        {
          sourceId: "research_source_alpha",
          relevanceScore: 0.8,
          relevanceLabel: "high",
          reason: "First ranking.",
          recommendedForSynthesis: true,
        },
        {
          sourceId: "research_source_alpha",
          relevanceScore: 0.6,
          relevanceLabel: "medium",
          reason: "Duplicate ranking.",
          recommendedForSynthesis: false,
        },
      ],
    }),
  );
});

test("article analysis validation builds stable source claims and rejects source mismatches", () => {
  const output = {
    sourceId: "research_source_alpha",
    summary: "The source explains deterministic local-first research workflows.",
    claims: [
      {
        claimText: "Local-first research should keep provider calls server-side.",
        sourceExcerpt: "Provider calls remain behind server-side capability boundaries.",
        confidence: 0.91,
      },
    ],
    caveats: ["The source uses fixture content."],
    relevanceScore: 0.88,
    confidence: 0.9,
  };
  const parsed = researchArticleAnalysisOutputSchema.parse(output);
  const analysis = buildResearchSourceAnalysis({
    sourceId: "research_source_alpha",
    evidenceId: "web_extract_alpha",
    output,
    analyzedAt: fixedAt,
  });

  assert.equal(parsed.sourceId, "research_source_alpha");
  assert.equal(analysis.claims.length, 1);
  assert.equal(analysis.claims[0].claimId.startsWith("research_claim"), true);
  assert.equal(analysis.evidenceId, "web_extract_alpha");
  assert.throws(() =>
    buildResearchSourceAnalysis({
      sourceId: "research_source_alpha",
      evidenceId: "web_extract_alpha",
      output: { ...output, sourceId: "research_source_beta" },
      analyzedAt: fixedAt,
    }),
  );
});

test("citation validation rejects unknown sources, evidence mismatches, and unsupported claims", () => {
  const report = createSynthesizedReport();

  assert.equal(validateResearchReportCitations(report).id, report.id);

  const unknownSource = cloneJson(report);
  unknownSource.citations[0].sourceId = "research_source_missing";
  assert.throws(() => validateResearchReportCitations(unknownSource));

  const evidenceMismatch = cloneJson(report);
  evidenceMismatch.citations[0].evidenceId = "web_extract_other";
  assert.throws(() => validateResearchReportCitations(evidenceMismatch));

  const unsupportedClaim = cloneJson(report);
  unsupportedClaim.citations[0].claimText = "This claim is not present in the analyzed source.";
  assert.throws(
    () => validateResearchReportCitations(unsupportedClaim),
    (error) => error.code === "research_citation_claim_unsupported",
  );
});

test("unsupported finding citation detection reports missing and unsupported citation links", () => {
  const report = createSynthesizedReport();
  const missingCitationFinding = {
    ...report.findings[0],
    citationIds: ["research_citation_missing"],
  };
  const unsupportedCitation = {
    ...report.citations[0],
    claimText: "The analyzed source never made this claim.",
  };

  assert.deepEqual(
    findUnsupportedFindingCitationIds({
      findings: [missingCitationFinding],
      citations: report.citations,
      sources: report.sources,
    }),
    ["research_citation_missing"],
  );
  assert.deepEqual(
    findUnsupportedFindingCitationIds({
      findings: [report.findings[0]],
      citations: [unsupportedCitation],
      sources: report.sources,
    }),
    [unsupportedCitation.citationId],
  );
});

test("report synthesis keeps cited findings while surfacing partial source failures", () => {
  const report = synthesizeResearchReport({
    reportId: "research_report_partial",
    executionId: "exec_research_partial",
    workspaceId: "workspace_alpha",
    question: "How should research handle source failures?",
    sources: [
      createAnalyzedSource({
        reportId: "research_report_partial",
        executionId: "exec_research_partial",
      }),
      createSelectedSource({
        id: "research_source_failed",
        reportId: "research_report_partial",
        executionId: "exec_research_partial",
        evidenceId: null,
        finalUrl: null,
        title: "Blocked fixture source",
        selectionRank: 2,
        status: "fetch_failed",
      }),
    ],
    completedAt: fixedAt,
  });

  assert.equal(report.status, "completed_with_warnings");
  assert.equal(report.findings.length > 0, true);
  assert.equal(report.citations.length > 0, true);
  assert.equal(
    report.warnings.some((warning) => warning.code === "partial_source_failure"),
    true,
  );
  assert.equal(
    report.limitations.some((limitation) => limitation.code === "coverage_note"),
    true,
  );
});

test("memory proposal eligibility only creates pending proposal inputs for cited reports", () => {
  const report = createSynthesizedReport();
  const request = {
    question: report.question,
    workspaceId: report.workspaceId,
    focus: "local-first research",
    timeRange: "week",
    maxSources: 2,
    maxSearchResults: 4,
    language: "en",
    categories: ["technology"],
    memoryProposalMode: "propose",
  };
  const proposals = buildResearchSemanticMemoryProposals({ request, report });

  assert.deepEqual(evaluateResearchMemoryProposalEligibility({ request, report }), {
    eligible: true,
    reason: "eligible",
  });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].scope, "workspace");
  assert.equal(proposals[0].workspaceId, "workspace_alpha");
  assert.equal(proposals[0].sourceType, "research_report");
  assert.equal(proposals[0].sourceExecutionId, report.executionId);
  assert.equal(proposals[0].sourceCapabilityId, "capability.research");
  assert.equal("status" in proposals[0], false);
  assert.deepEqual(
    buildResearchSemanticMemoryProposals({
      request: { ...request, memoryProposalMode: "none" },
      report,
    }),
    [],
  );
  assert.deepEqual(
    evaluateResearchMemoryProposalEligibility({
      request,
      report: { ...report, status: "failed", findings: [], citations: [] },
    }),
    { eligible: false, reason: "report_not_successful" },
  );
  assert.deepEqual(
    evaluateResearchMemoryProposalEligibility({
      request,
      report: { ...report, findings: [] },
    }),
    { eligible: false, reason: "no_cited_findings" },
  );
  assert.deepEqual(
    evaluateResearchMemoryProposalEligibility({
      request,
      report,
      activeSemanticMemory: [{ status: "active" }],
    }),
    { eligible: false, reason: "active_memory_exists" },
  );
});

const fixedAt = "2026-07-04T12:00:00.000Z";

function createSelectedSource(overrides = {}) {
  return {
    id: "research_source_alpha",
    reportId: "research_report_alpha",
    executionId: "exec_research_alpha",
    workspaceId: "workspace_alpha",
    evidenceId: "web_extract_alpha",
    url: "https://example.com/research-alpha",
    finalUrl: "https://example.com/research-alpha",
    title: "Research Alpha",
    publishedAt: null,
    selectionRank: 1,
    relevanceScore: 0.9,
    analysis: null,
    citationIds: [],
    status: "selected",
    createdAt: fixedAt,
    updatedAt: fixedAt,
    ...overrides,
  };
}

function createAnalyzedSource(overrides = {}) {
  const source = createSelectedSource(overrides);
  const evidenceId = source.evidenceId ?? "web_extract_alpha";
  const analysis = buildResearchSourceAnalysis({
    sourceId: source.id,
    evidenceId,
    output: {
      sourceId: source.id,
      summary: "The source supports deterministic, server-side research execution.",
      claims: [
        {
          claimText: "Research reports should cite analyzed source claims.",
          sourceExcerpt: "Reports cite analyzed source claims.",
          confidence: 0.92,
        },
        {
          claimText: "Partial source failures should remain visible in the report.",
          sourceExcerpt: "Partial source failures are visible warnings.",
          confidence: 0.88,
        },
      ],
      caveats: ["Fixture source coverage is intentionally narrow."],
      relevanceScore: 0.9,
      confidence: 0.91,
    },
    analyzedAt: fixedAt,
  });

  return {
    ...source,
    evidenceId,
    relevanceScore: 0.9,
    analysis,
    status: "analyzed",
    ...overrides,
  };
}

function createSynthesizedReport() {
  return synthesizeResearchReport({
    reportId: "research_report_alpha",
    executionId: "exec_research_alpha",
    workspaceId: "workspace_alpha",
    question: "What makes local-first research reliable?",
    sources: [createAnalyzedSource()],
    completedAt: fixedAt,
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
