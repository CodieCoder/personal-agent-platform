import assert from "node:assert/strict";
import { createResearchCapability } from "@pap/capability-research";
import { createMemoryService } from "@pap/memory";
import { createRuntime } from "@pap/runtime";
import { createSourceProfileService } from "@pap/source-profiles";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteEpisodicMemoryRepository,
  SqliteExecutionTraceRepository,
  SqliteResearchReportFeedbackRepository,
  SqliteResearchReportRepository,
  SqliteResearchSourceFeedbackRepository,
  SqliteResearchSourceRepository,
  SqliteSemanticMemoryRepository,
  SqliteSourceProfileRepository,
  SqliteWebEvidenceRepository,
  SqliteWorkspaceRepository,
} from "@pap/storage-sqlite";
import { createTemporarySqliteDatabase } from "@pap/testing";
import { test } from "vitest";
import { createResearchFixtureAIProviderRegistry } from "../src/features/research/fixtures.server.ts";
import {
  createSearchTestFixtureGuardedFetchClient,
  createSearchTestFixtureSearchProviderRegistry,
  createSearchTestFixtureUrlSafetyPolicy,
} from "../src/features/search-test/fixtures.server.ts";
import {
  createSourceFeedbackOperation,
  deleteSourceFeedbackOperation,
  exportResearchReportOperation,
  getReportFeedbackOperation,
  getResearchReportDashboardOperation,
  getResearchReportOperation,
  listResearchReportHistoryOperation,
  listResearchReportsOperation,
  listSourceFeedbackOperation,
  runResearchOperation,
  updateSourceFeedbackOperation,
  upsertReportFeedbackOperation,
} from "../src/features/research/operations.ts";
import {
  approveSemanticMemoryProposalOperation,
  rejectSemanticMemoryProposalOperation,
} from "../src/features/memory/operations.ts";

const fixedNow = "2026-07-04T12:00:00.000Z";
const fixedClock = () => new Date(fixedNow);
const workspaceAlphaId = "workspace_research_alpha";
const workspaceBetaId = "workspace_research_beta";

test("research operation completes cited research and persists workspace-scoped report evidence", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-success-");

  try {
    const result = await runResearchOperation(fixture.state, researchRequest());

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.workspaceId, workspaceAlphaId);
    assert.equal(result.ok && result.status, "completed");
    assert.equal(result.ok && result.memoryProposalStatus, "not_requested");

    const reportId = result.ok ? result.reportId : "research_report_missing";
    const executionId = result.ok ? result.executionId : "exec_missing";
    const fetched = await getResearchReportOperation(fixture.state, {
      reportId,
      workspaceId: workspaceAlphaId,
    });
    const listed = await listResearchReportsOperation(fixture.state, {
      workspaceId: workspaceAlphaId,
      page: 1,
      pageSize: 5,
    });
    const sources = await fixture.sourceRepository.listByExecution({
      executionId,
      workspaceId: workspaceAlphaId,
    });
    const evidence = await fixture.webEvidenceRepository.getByExecution({
      executionId,
      workspaceId: workspaceAlphaId,
    });
    const wrongWorkspaceEvidence = await fixture.webEvidenceRepository.getByExecution({
      executionId,
      workspaceId: workspaceBetaId,
    });

    assert.equal(fetched.ok && fetched.found, true);
    assert.equal(fetched.ok && fetched.found && fetched.report.status, "completed");
    assert.equal(fetched.ok && fetched.found && fetched.report.findings.length > 0, true);
    assert.equal(fetched.ok && fetched.found && fetched.report.citations.length > 0, true);
    assert.equal(
      fetched.ok &&
        fetched.found &&
        fetched.report.limitations.some((limitation) => limitation.code === "coverage_note"),
      true,
    );
    assert.equal(fetched.ok && fetched.found && fetched.memory.status, "none");
    assert.equal(listed.ok && listed.page.total, 1);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].status, "analyzed");
    assert.equal(evidence.searches.length > 0, true);
    assert.equal(evidence.fetches.length, 1);
    assert.equal(evidence.extractions.length, 1);
    assert.equal(wrongWorkspaceEvidence.searches.length, 0);
    await assertNoMemoryWrites(fixture);
  } finally {
    fixture.close();
  }
});

test("research operation records partial source failures without losing cited findings", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-partial-");

  try {
    const result = await runResearchOperation(
      fixture.state,
      researchRequest({
        focus: null,
        timeRange: "all",
        maxSources: 3,
        maxSearchResults: 3,
      }),
    );
    const report = await getReportOrThrow(fixture, result);

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.status, "completed_with_warnings");
    assert.equal(report.status, "completed_with_warnings");
    assert.equal(report.findings.length > 0, true);
    assert.equal(
      report.sources.some((source) => source.status === "fetch_failed"),
      true,
    );
    assert.equal(
      report.warnings.some((warning) => warning.code === "partial_source_failure"),
      true,
    );
    assert.equal(
      report.warnings.some((warning) => warning.code === "source_extraction_failed"),
      true,
    );
    await assertNoMemoryWrites(fixture);
  } finally {
    fixture.close();
  }
});

test("research operation persists failed report when search provider is unavailable", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-provider-down-", {
    PAP_SEARCH_TEST_FIXTURE_HEALTH: "unavailable",
  });

  try {
    const result = await runResearchOperation(fixture.state, researchRequest());
    const report = await getReportOrThrow(fixture, result);
    const trace = await fixture.traceRepository.getById(
      result.ok ? result.executionId : "exec_missing",
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.status, "failed");
    assert.equal(report.status, "failed");
    assert.equal(report.findings.length, 0);
    assert.equal(report.sources.length, 0);
    assert.equal(
      report.warnings.some((warning) => warning.code === "search_provider_unavailable"),
      true,
    );
    assert.equal(
      trace.steps.some(
        (step) =>
          step.name === "search web" &&
          step.status === "failed" &&
          step.metadata.healthStatus === "unavailable",
      ),
      true,
    );
    await assertNoMemoryWrites(fixture);
  } finally {
    fixture.close();
  }
});

test("research operation fails safely when analysis cannot produce citation-ready findings", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-citation-failure-", {
    PAP_RESEARCH_TEST_FIXTURE_AI_MODE: "citation_failure",
  });

  try {
    const result = await runResearchOperation(fixture.state, researchRequest());
    const report = await getReportOrThrow(fixture, result);
    const trace = await fixture.traceRepository.getById(
      result.ok ? result.executionId : "exec_missing",
    );
    const citationStep = trace.steps.find((step) => step.name === "validate citations");

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.status, "failed");
    assert.equal(report.status, "failed");
    assert.equal(report.findings.length, 0);
    assert.equal(report.citations.length, 0);
    assert.equal(citationStep?.status, "failed");
    assert.match(report.summary.text, /could not produce source-backed findings/u);
    await assertNoMemoryWrites(fixture);
  } finally {
    fixture.close();
  }
});

test("research operation retries invalid structured source analysis once", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-analysis-retry-", {
    PAP_RESEARCH_TEST_FIXTURE_AI_MODE: "analysis_invalid_once",
  });

  try {
    const result = await runResearchOperation(fixture.state, researchRequest());
    const report = await getReportOrThrow(fixture, result);
    const trace = await fixture.traceRepository.getById(
      result.ok ? result.executionId : "exec_missing",
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.status, "completed");
    assert.equal(report.status, "completed");
    assert.equal(report.findings.length > 0, true);
    assert.equal(
      trace.steps.some(
        (step) => step.name === "retry source analysis" && step.status === "completed",
      ),
      true,
    );
    assert.equal(
      trace.steps.some(
        (step) => step.name === "invoke model" && step.errorCode === "AI_PROVIDER_INVALID_RESPONSE",
      ),
      true,
    );
    await assertNoMemoryWrites(fixture);
  } finally {
    fixture.close();
  }
});

test("research operation uses extracted-text fallback when structured source analysis stays invalid", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-analysis-fallback-", {
    PAP_RESEARCH_TEST_FIXTURE_AI_MODE: "analysis_invalid_always",
  });

  try {
    const result = await runResearchOperation(fixture.state, researchRequest());
    const report = await getReportOrThrow(fixture, result);
    const trace = await fixture.traceRepository.getById(
      result.ok ? result.executionId : "exec_missing",
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.status, "completed_with_warnings");
    assert.equal(report.status, "completed_with_warnings");
    assert.equal(report.findings.length > 0, true);
    assert.equal(report.citations.length > 0, true);
    assert.equal(report.sources[0].status, "analyzed");
    assert.equal(report.sources[0].analysis?.claims.length, 1);
    assert.equal(
      report.warnings.some((warning) => warning.code === "source_analysis_fallback_used"),
      true,
    );
    assert.equal(
      trace.steps.some(
        (step) => step.name === "fallback source analysis" && step.status === "completed",
      ),
      true,
    );
    await assertNoMemoryWrites(fixture);
  } finally {
    fixture.close();
  }
});

test("research operation keeps deterministic source order when structured ranking stays invalid", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-ranking-fallback-", {
    PAP_RESEARCH_TEST_FIXTURE_AI_MODE: "ranking_invalid",
  });

  try {
    const result = await runResearchOperation(
      fixture.state,
      researchRequest({
        maxSources: 2,
        maxSearchResults: 8,
      }),
    );
    const report = await getReportOrThrow(fixture, result);
    const trace = await fixture.traceRepository.getById(
      result.ok ? result.executionId : "exec_missing",
    );
    const selectionStep = trace.steps.find((step) => step.name === "select extraction budget");
    const rankingStep = trace.steps.find(
      (step) => step.name === "rank relevance" && step.status === "completed",
    );

    assert.equal(result.ok, true);
    assert.equal(selectionStep?.metadata.selectedCount, 2);
    assert.equal(report.sources.length, 2);
    assert.equal(rankingStep?.metadata.rankingMode, "deterministic_fallback");
    assert.equal(
      report.warnings.some((warning) => warning.code === "source_ranking_fallback_used"),
      true,
    );
    assert.equal(result.ok && result.status, "completed_with_warnings");
    assert.equal(report.status, "completed_with_warnings");
    assert.equal(report.findings.length > 0, true);
    assert.equal(report.citations.length > 0, true);
    assert.equal(rankingStep?.status, "completed");
    await assertNoMemoryWrites(fixture);
  } finally {
    fixture.close();
  }
});

test("research reports are persisted with exact workspace isolation", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-workspaces-");

  try {
    const result = await runResearchOperation(fixture.state, researchRequest());
    const reportId = result.ok ? result.reportId : "research_report_missing";
    const wrongWorkspaceGet = await getResearchReportOperation(fixture.state, {
      reportId,
      workspaceId: workspaceBetaId,
    });
    const betaList = await listResearchReportsOperation(fixture.state, {
      workspaceId: workspaceBetaId,
      page: 1,
      pageSize: 5,
    });
    const unscopedList = await listResearchReportsOperation(fixture.state, {
      workspaceId: null,
      page: 1,
      pageSize: 5,
    });

    assert.equal(result.ok, true);
    assert.equal(wrongWorkspaceGet.ok && wrongWorkspaceGet.found, false);
    assert.equal(betaList.ok && betaList.page.total, 0);
    assert.equal(unscopedList.ok && unscopedList.page.total, 0);
  } finally {
    fixture.close();
  }
});

test("research memory proposal remains pending review and creates no active memory writes", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-memory-proposal-");

  try {
    const result = await runResearchOperation(
      fixture.state,
      researchRequest({ memoryProposalMode: "propose" }),
    );
    const fetched = await getResearchReportOperation(fixture.state, {
      reportId: result.ok ? result.reportId : "research_report_missing",
      workspaceId: workspaceAlphaId,
    });
    const proposed = await fixture.memoryService.listSemanticMemory({
      sourceExecutionId: result.ok ? result.executionId : "exec_missing",
      status: "proposed",
      limit: 50,
    });
    const active = await fixture.memoryService.listSemanticMemory({
      sourceExecutionId: result.ok ? result.executionId : "exec_missing",
      status: "active",
      limit: 50,
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.status, "completed");
    assert.equal(result.ok && result.memoryProposalStatus, "pending_review");
    assert.equal(fetched.ok && fetched.found && fetched.memory.status, "pending_review");
    assert.equal(fetched.ok && fetched.found && fetched.memory.proposed, 1);
    assert.equal(proposed.length, 1);
    assert.equal(proposed[0].status, "proposed");
    assert.equal(proposed[0].sourceType, "research_report");
    assert.equal(proposed[0].sourceCapabilityId, "capability.research");
    assert.equal(active.length, 0);
  } finally {
    fixture.close();
  }
});

test("research history operations filter, paginate, summarize, and fail safely", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-history-");

  try {
    const proposalResult = await runResearchOperation(
      fixture.state,
      researchRequest({
        question: "Which research finding should become pending workspace memory?",
        memoryProposalMode: "propose",
      }),
    );
    const warningResult = await runResearchOperation(
      fixture.state,
      researchRequest({
        question: "How should PAP filter partial source warning history?",
        focus: null,
        timeRange: "all",
        maxSources: 3,
        maxSearchResults: 3,
      }),
    );
    const pendingMemory = await listResearchReportHistoryOperation(fixture.state, {
      workspaceId: workspaceAlphaId,
      hasPendingMemoryProposal: true,
      page: 1,
      pageSize: 10,
    });
    const warnings = await listResearchReportHistoryOperation(fixture.state, {
      workspaceId: workspaceAlphaId,
      status: "completed_with_warnings",
      question: "partial source",
      hasWarnings: true,
      page: 1,
      pageSize: 10,
    });
    const paged = await listResearchReportHistoryOperation(fixture.state, {
      workspaceId: workspaceAlphaId,
      page: 2,
      pageSize: 1,
    });
    const beta = await listResearchReportHistoryOperation(fixture.state, {
      workspaceId: workspaceBetaId,
      page: 1,
      pageSize: 10,
    });
    const invalid = await listResearchReportHistoryOperation(fixture.state, {
      workspaceId: workspaceAlphaId,
      dateFrom: "2026-07-05",
      dateTo: "2026-07-01",
      page: 1,
      pageSize: 10,
    });
    const dashboard = await getResearchReportDashboardOperation(fixture.state, {
      workspaceId: workspaceAlphaId,
    });

    assert.equal(proposalResult.ok, true);
    assert.equal(warningResult.ok, true);
    assert.equal(pendingMemory.ok, true);
    assert.deepEqual(pendingMemory.ok && pendingMemory.page.reports.map((report) => report.id), [
      proposalResult.reportId,
    ]);
    assert.equal(pendingMemory.ok && pendingMemory.page.reports[0].pendingMemoryProposalCount, 1);
    assert.equal(warnings.ok, true);
    assert.deepEqual(warnings.ok && warnings.page.reports.map((report) => report.id), [
      warningResult.reportId,
    ]);
    assert.equal(warnings.ok && warnings.page.reports[0].warningCount > 0, true);
    assert.equal(paged.ok && paged.page.hasPreviousPage, true);
    assert.equal(paged.ok && paged.page.hasNextPage, false);
    assert.equal(beta.ok && beta.page.total, 0);
    assert.equal(invalid.ok, false);
    assert.equal(!invalid.ok && invalid.error.code, "RESEARCH_HISTORY_QUERY_INVALID");
    assert.equal(dashboard.ok, true);
    assert.equal(dashboard.ok && dashboard.summary.totalReportCount, 2);
    assert.equal(dashboard.ok && dashboard.summary.pendingMemoryProposalReportCount, 1);
    assert.equal(dashboard.ok && dashboard.summary.warningReportCount, 1);
  } finally {
    fixture.close();
  }
});

test("report feedback operations upsert, retrieve, and enforce workspace isolation", async () => {
  const fixture = await createResearchOperationFixture("pap-web-report-feedback-");

  try {
    const researchResult = await runResearchOperation(fixture.state, researchRequest());
    assert.equal(researchResult.ok, true);
    const reportId = researchResult.ok ? researchResult.reportId : "research_report_missing";

    const upserted = await upsertReportFeedbackOperation(fixture.state, {
      reportId,
      workspaceId: workspaceAlphaId,
      rating: "useful",
      useful: true,
      reason: "Well-sourced report.",
      notes: "Will use for follow-up.",
    });

    assert.equal(upserted.ok, true);
    assert.equal(upserted.ok && upserted.data.rating, "useful");
    assert.equal(upserted.ok && upserted.data.useful, true);
    assert.equal(upserted.ok && upserted.data.reason, "Well-sourced report.");

    const retrieved = await getReportFeedbackOperation(fixture.state, {
      reportId,
      workspaceId: workspaceAlphaId,
    });

    assert.equal(retrieved.ok, true);
    assert.equal(retrieved.ok && retrieved.data.rating, "useful");

    const updated = await upsertReportFeedbackOperation(fixture.state, {
      reportId,
      workspaceId: workspaceAlphaId,
      rating: "neutral",
      useful: false,
      reason: null,
      notes: "Re-evaluated.",
    });

    assert.equal(updated.ok, true);
    assert.equal(updated.ok && updated.data.rating, "neutral");
    assert.equal(updated.ok && updated.data.useful, false);
    assert.equal(updated.ok && updated.data.reason, null);

    const wrongWorkspace = await getReportFeedbackOperation(fixture.state, {
      reportId,
      workspaceId: workspaceBetaId,
    });

    assert.equal(wrongWorkspace.ok, true);
    assert.equal(wrongWorkspace.ok && wrongWorkspace.data, null);
  } finally {
    fixture.close();
  }
});

test("research report export operation preserves citations, sources, and limitations safely", async () => {
  const fixture = await createResearchOperationFixture("pap-web-research-export-");

  try {
    const researchResult = await runResearchOperation(fixture.state, researchRequest());
    assert.equal(researchResult.ok, true);
    const reportId = researchResult.ok ? researchResult.reportId : "research_report_missing";

    const markdown = await exportResearchReportOperation(fixture.state, {
      reportId,
      workspaceId: workspaceAlphaId,
      format: "markdown",
    });
    const plainText = await exportResearchReportOperation(fixture.state, {
      reportId,
      workspaceId: workspaceAlphaId,
      format: "plain-text",
    });
    const json = await exportResearchReportOperation(fixture.state, {
      reportId,
      workspaceId: workspaceAlphaId,
      format: "json",
    });
    const wrongWorkspace = await exportResearchReportOperation(fixture.state, {
      reportId,
      workspaceId: workspaceBetaId,
      format: "markdown",
    });
    const invalid = await exportResearchReportOperation(fixture.state, {
      reportId,
      workspaceId: workspaceAlphaId,
      format: "pdf",
    });
    const persistedReport = await fixture.state.reportRepository.getById({
      id: reportId,
      workspaceId: workspaceAlphaId,
    });
    assert.ok(persistedReport);
    const exportDate = (persistedReport.completedAt ?? persistedReport.createdAt).slice(0, 10);

    assert.equal(markdown.ok, true);
    assert.equal(markdown.ok && markdown.mimeType, "text/markdown; charset=utf-8");
    assert.equal(markdown.ok && markdown.filename, `research-${reportId}-${exportDate}.md`);
    assert.match(markdown.ok ? markdown.content : "", /## Sources \(1\)/u);
    assert.match(markdown.ok ? markdown.content : "", /## Citations \(\d+\)/u);
    assert.match(markdown.ok ? markdown.content : "", /## Limitations \(\d+\)/u);
    assert.match(markdown.ok ? markdown.content : "", /coverage_note/u);
    assert.match(markdown.ok ? markdown.content : "", /\[C1\]/u);

    assert.equal(plainText.ok, true);
    assert.equal(plainText.ok && plainText.mimeType, "text/plain; charset=utf-8");
    assert.equal(plainText.ok && plainText.filename, `research-${reportId}-${exportDate}.txt`);
    assert.match(plainText.ok ? plainText.content : "", /Sources \(1\)/u);
    assert.match(plainText.ok ? plainText.content : "", /Limitations \(\d+\)/u);

    assert.equal(json.ok, true);
    assert.equal(json.ok && json.mimeType, "application/json; charset=utf-8");
    assert.equal(json.ok && json.filename, `research-${reportId}-${exportDate}.json`);
    const parsed = JSON.parse(json.ok ? json.content : "{}");
    assert.deepEqual(parsed, persistedReport);
    assert.equal(parsed.id, reportId);
    assert.deepEqual(parsed.summary.keyPoints, persistedReport.summary.keyPoints);
    assert.equal(parsed.findings[0].id, persistedReport.findings[0].id);
    assert.equal(parsed.findings[0].kind, persistedReport.findings[0].kind);
    assert.equal(parsed.citations[0].evidenceId, persistedReport.citations[0].evidenceId);
    assert.deepEqual(parsed.sources[0].analysis, persistedReport.sources[0].analysis);
    assert.equal(parsed.sources[0].selectionRank, persistedReport.sources[0].selectionRank);
    assert.equal(parsed.sources[0].createdAt, persistedReport.sources[0].createdAt);
    assert.equal(parsed.sources.length, 1);
    assert.equal(parsed.limitations.length > 0, true);
    assert.equal("rawProviderOutput" in parsed, false);
    assert.equal("reasoning" in parsed, false);
    assert.equal("stack" in parsed, false);

    assert.equal(wrongWorkspace.ok, false);
    assert.equal(
      wrongWorkspace.ok === false && wrongWorkspace.error.code,
      "RESEARCH_EXPORT_REPORT_NOT_FOUND",
    );
    assert.equal(invalid.ok, false);
    assert.equal(invalid.ok === false && invalid.error.code, "RESEARCH_EXPORT_INPUT_INVALID");
  } finally {
    fixture.close();
  }
});

test("source feedback operations create, list, update, and delete feedback", async () => {
  const fixture = await createResearchOperationFixture("pap-web-source-feedback-");

  try {
    const researchResult = await runResearchOperation(fixture.state, researchRequest());
    assert.equal(researchResult.ok, true);
    const reportId = researchResult.ok ? researchResult.reportId : "research_report_missing";
    const executionId = researchResult.ok ? researchResult.executionId : "exec_missing";

    const sources = await fixture.sourceRepository.listByExecution({
      executionId,
      workspaceId: workspaceAlphaId,
    });
    assert.equal(sources.length > 0, true);
    const sourceId = sources[0].id;

    const created = await createSourceFeedbackOperation(fixture.state, {
      workspaceId: workspaceAlphaId,
      reportId,
      sourceId,
      rating: "useful",
      helpful: true,
      reason: "Accurate claims.",
      notes: "Best source for this topic.",
    });

    assert.equal(created.ok, true);
    assert.equal(created.ok && created.data.sourceId, sourceId);
    assert.equal(created.ok && created.data.rating, "useful");
    assert.equal(created.ok && created.data.helpful, true);

    const listed = await listSourceFeedbackOperation(fixture.state, {
      reportId,
      workspaceId: workspaceAlphaId,
    });

    assert.equal(listed.ok, true);
    assert.equal(listed.ok && listed.data.length, 1);
    assert.equal(listed.ok && listed.data[0].sourceId, sourceId);

    const updated = await updateSourceFeedbackOperation(fixture.state, {
      sourceId,
      workspaceId: workspaceAlphaId,
      rating: "neutral",
      notes: "Revised after closer inspection.",
    });

    assert.equal(updated.ok, true);
    assert.equal(updated.ok && updated.data.rating, "neutral");
    assert.equal(updated.ok && updated.data.notes, "Revised after closer inspection.");
    assert.equal(updated.ok && updated.data.reason, "Accurate claims.");

    const deleted = await deleteSourceFeedbackOperation(fixture.state, {
      sourceId,
      workspaceId: workspaceAlphaId,
    });

    assert.equal(deleted.ok, true);

    const afterDelete = await listSourceFeedbackOperation(fixture.state, {
      reportId,
      workspaceId: workspaceAlphaId,
    });

    assert.equal(afterDelete.ok, true);
    assert.equal(afterDelete.ok && afterDelete.data.length, 0);
  } finally {
    fixture.close();
  }
});

test("memory proposal operations approve and reject pending proposals", async () => {
  const fixture = await createResearchOperationFixture("pap-web-memory-proposal-ops-");

  try {
    const researchResult = await runResearchOperation(
      fixture.state,
      researchRequest({ memoryProposalMode: "propose" }),
    );
    assert.equal(researchResult.ok, true);
    assert.equal(researchResult.ok && researchResult.memoryProposalStatus, "pending_review");
    const executionId = researchResult.ok ? researchResult.executionId : "exec_missing";

    const proposed = await fixture.memoryService.listSemanticMemory({
      sourceExecutionId: executionId,
      status: "proposed",
      limit: 50,
    });
    assert.equal(proposed.length, 1);
    const proposalId = proposed[0].id;

    const approved = await approveSemanticMemoryProposalOperation(
      { memoryService: fixture.memoryService },
      { id: proposalId },
    );

    assert.equal(approved.ok, true);
    assert.equal(approved.ok && approved.memory.status, "active");
    assert.equal(approved.ok && approved.memory.supersedesMemoryId, undefined);

    const active = await fixture.memoryService.listSemanticMemory({
      sourceExecutionId: executionId,
      status: "active",
      limit: 50,
    });
    assert.equal(active.length, 1);
    assert.equal(active[0].id, proposalId);

    const rejectResult = await rejectSemanticMemoryProposalOperation(
      { memoryService: fixture.memoryService },
      { id: proposalId },
    );

    assert.equal(rejectResult.ok, false);
    assert.equal(rejectResult.ok === false && rejectResult.error.code, "MEMORY_INVALID_STATUS");
  } finally {
    fixture.close();
  }
});

async function createResearchOperationFixture(prefix, rawEnvOverrides = {}) {
  const temporaryDatabase = await createTemporarySqliteDatabase(prefix);
  const rawEnv = {
    PAP_ENVIRONMENT: "test",
    PAP_SEARCH_TEST_FIXTURES: "true",
    PAP_RESEARCH_TEST_FIXTURES: "true",
    ...rawEnvOverrides,
  };

  runMigrations({ databaseUrl: temporaryDatabase.databaseUrl });
  const connection = createSqliteDatabase({ databaseUrl: temporaryDatabase.databaseUrl });
  const traceRepository = new SqliteExecutionTraceRepository(connection.db);
  const workspaceRepository = new SqliteWorkspaceRepository(connection.db);
  const semanticMemoryRepository = new SqliteSemanticMemoryRepository(connection.db);
  const episodicMemoryRepository = new SqliteEpisodicMemoryRepository(connection.db);
  const sourceProfileRepository = new SqliteSourceProfileRepository(connection.db);
  const webEvidenceRepository = new SqliteWebEvidenceRepository(connection.db);
  const researchReportRepository = new SqliteResearchReportRepository(connection.db);
  const researchSourceRepository = new SqliteResearchSourceRepository(connection.db);
  const researchReportFeedbackRepository = new SqliteResearchReportFeedbackRepository(
    connection.db,
  );
  const researchSourceFeedbackRepository = new SqliteResearchSourceFeedbackRepository(
    connection.db,
  );
  const memoryService = createMemoryService({
    semanticMemoryRepository,
    episodicMemoryRepository,
    executionTraceRepository: traceRepository,
    clock: fixedClock,
  });
  const searchProviderRegistry = createSearchTestFixtureSearchProviderRegistry({ rawEnv });
  const aiProviderRegistry = createResearchFixtureAIProviderRegistry({ rawEnv });
  const urlSafetyPolicy = createSearchTestFixtureUrlSafetyPolicy();
  const guardedFetchClient = createSearchTestFixtureGuardedFetchClient({
    policy: urlSafetyPolicy,
  });
  const sourceProfileService = createSourceProfileService({
    repository: sourceProfileRepository,
  });
  const runtime = createRuntime({
    traceRepository,
    memoryService,
    capabilities: [
      createResearchCapability({
        reportRepository: researchReportRepository,
        sourceRepository: researchSourceRepository,
        memoryService,
        clock: fixedClock,
      }),
    ],
    aiProviderRegistry,
    searchProviderRegistry,
    defaultSearchProviderId: "provider.searxng",
    urlSafetyPolicy,
    guardedFetchClient,
    sourceProfileService,
    webEvidenceRepository,
  });

  await workspaceRepository.create({
    id: workspaceAlphaId,
    name: "Research Alpha",
    description: "Workspace for research operation tests.",
    createdAt: fixedNow,
    updatedAt: fixedNow,
  });
  await workspaceRepository.create({
    id: workspaceBetaId,
    name: "Research Beta",
    description: "Workspace that must not see alpha reports.",
    createdAt: fixedNow,
    updatedAt: fixedNow,
  });

  return {
    state: {
      runtime,
      reportRepository: researchReportRepository,
      memoryService,
      reportFeedbackRepository: researchReportFeedbackRepository,
      sourceFeedbackRepository: researchSourceFeedbackRepository,
    },
    traceRepository,
    sourceRepository: researchSourceRepository,
    semanticMemoryRepository,
    episodicMemoryRepository,
    webEvidenceRepository,
    memoryService,
    close: connection.close,
  };
}

function researchRequest(overrides = {}) {
  return {
    question: "How should Personal Agent Platform run source-backed research?",
    workspaceId: workspaceAlphaId,
    focus: "local-first agent evidence",
    timeRange: "week",
    maxSources: 1,
    maxSearchResults: 3,
    language: "en",
    categories: ["general"],
    memoryProposalMode: "none",
    ...overrides,
  };
}

async function getReportOrThrow(fixture, result) {
  assert.equal(result.ok, true);
  const fetched = await getResearchReportOperation(fixture.state, {
    reportId: result.reportId,
    workspaceId: workspaceAlphaId,
  });

  assert.equal(fetched.ok, true);
  assert.equal(fetched.ok && fetched.found, true);
  return fetched.report;
}

async function assertNoMemoryWrites(fixture) {
  assert.equal((await fixture.semanticMemoryRepository.list()).length, 0);
  assert.equal((await fixture.episodicMemoryRepository.list()).length, 0);
}
