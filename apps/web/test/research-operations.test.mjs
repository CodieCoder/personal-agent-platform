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
  SqliteResearchReportRepository,
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
  getResearchReportOperation,
  listResearchReportsOperation,
  runResearchOperation,
} from "../src/features/research/operations.ts";

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
