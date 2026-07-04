import assert from "node:assert/strict";
import { createSearchExtractTestCapability } from "@pap/capability-search-extract-test";
import { createMemoryService } from "@pap/memory";
import { createRuntime } from "@pap/runtime";
import { createSourceProfileService } from "@pap/source-profiles";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteEpisodicMemoryRepository,
  SqliteExecutionTraceRepository,
  SqliteSemanticMemoryRepository,
  SqliteSourceProfileRepository,
  SqliteWebEvidenceRepository,
} from "@pap/storage-sqlite";
import { createTemporarySqliteDatabase } from "@pap/testing";
import { test } from "vitest";
import {
  createSearchTestFixtureGuardedFetchClient,
  createSearchTestFixtureSearchProviderRegistry,
  createSearchTestFixtureUrlSafetyPolicy,
  searchTestFixtureArticleUrl,
  searchTestFixtureUnsafeUrl,
} from "../src/features/search-test/fixtures.server.ts";
import {
  extractSearchTestResultOperation,
  getSearchProviderStatusOperation,
  runSearchTestOperation,
} from "../src/features/search-test/operations.ts";

test("search provider status operation maps healthy and unavailable fixture states safely", async () => {
  const healthy = await createSearchTestOperationFixture("pap-web-search-health-");
  const unavailable = await createSearchTestOperationFixture("pap-web-search-unavailable-health-", {
    PAP_SEARCH_TEST_FIXTURE_HEALTH: "unavailable",
  });

  try {
    const healthyStatus = await getSearchProviderStatusOperation(healthy.state);
    const unavailableStatus = await getSearchProviderStatusOperation(unavailable.state);

    assert.equal(healthyStatus.ok, true);
    assert.equal(healthyStatus.ok && healthyStatus.status, "healthy");
    assert.equal(unavailableStatus.ok, true);
    assert.equal(unavailableStatus.ok && unavailableStatus.status, "unavailable");
  } finally {
    healthy.close();
    unavailable.close();
  }
});

test("search-only operation returns normalized results and persists workspace-scoped search evidence", async () => {
  const fixture = await createSearchTestOperationFixture("pap-web-search-only-");

  try {
    const result = await runSearchTestOperation(fixture.state, {
      query: "local AI engineering",
      workspaceId: "workspace_search_alpha",
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.results.length, 3);
    assert.equal(result.ok && result.results[0].title.includes("Local AI engineering"), true);
    assert.equal(result.ok && result.results[0].engine, "fixture");
    assert.equal(result.ok && result.evidence.searchEvidenceId.startsWith("web_search"), true);

    const executionId = result.ok ? result.executionId : "exec_missing";
    const trace = await fixture.traceRepository.getById(executionId);
    const evidence = await fixture.webEvidenceRepository.getByExecution({
      executionId,
      workspaceId: "workspace_search_alpha",
    });
    const wrongWorkspaceEvidence = await fixture.webEvidenceRepository.getByExecution({
      executionId,
      workspaceId: "workspace_search_beta",
    });

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
    assert.equal(evidence.searches.length, 1);
    assert.equal(evidence.searches[0].workspaceId, "workspace_search_alpha");
    assert.equal(evidence.fetches.length, 0);
    assert.equal(evidence.extractions.length, 0);
    assert.equal(wrongWorkspaceEvidence.searches.length, 0);
    await assertNoMemoryWrites(fixture);
  } finally {
    fixture.close();
  }
});

test("search-plus-extraction operation persists ordered search, fetch, and extraction evidence", async () => {
  const fixture = await createSearchTestOperationFixture("pap-web-search-extract-");

  try {
    const result = await extractSearchTestResultOperation(fixture.state, {
      query: "local AI engineering",
      selectedUrl: searchTestFixtureArticleUrl,
      workspaceId: "workspace_search_alpha",
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.selectedResult?.index, 0);
    assert.equal(result.ok && result.document.method, "readability");
    assert.match(result.ok ? result.document.contentTextSnapshot : "", /deterministic search/u);
    assert.equal(
      result.ok &&
        result.warnings.some((warning) => warning.code === "extraction_profile_not_found"),
      true,
    );

    const executionId = result.ok ? result.executionId : "exec_missing";
    const trace = await fixture.traceRepository.getById(executionId);
    const evidence = await fixture.webEvidenceRepository.getByExecution({
      executionId,
      workspaceId: "workspace_search_alpha",
    });
    const wrongWorkspaceEvidence = await fixture.webEvidenceRepository.getByExecution({
      executionId,
      workspaceId: "workspace_search_beta",
    });

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
    assert.equal(evidence.searches.length, 1);
    assert.equal(evidence.fetches.length, 1);
    assert.equal(evidence.extractions.length, 1);
    assert.equal(evidence.fetches[0].searchEvidenceId, evidence.searches[0].id);
    assert.equal(evidence.extractions[0].fetchEvidenceId, evidence.fetches[0].id);
    assert.equal(wrongWorkspaceEvidence.searches.length, 0);
    assert.equal(JSON.stringify(trace).includes("<html"), false);
    await assertNoMemoryWrites(fixture);
  } finally {
    fixture.close();
  }
});

test("unsafe selected URL fails safely with search evidence and no memory writes", async () => {
  const fixture = await createSearchTestOperationFixture("pap-web-search-unsafe-");

  try {
    const result = await extractSearchTestResultOperation(fixture.state, {
      query: "local AI engineering",
      selectedUrl: searchTestFixtureUnsafeUrl,
      workspaceId: "workspace_search_alpha",
    });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error.code, "WEB_FETCH_FAILED");
    assert.equal(result.ok === false && result.executionId !== undefined, true);

    const executionId = result.ok === false ? result.executionId : "exec_missing";
    const trace = await fixture.traceRepository.getById(executionId);
    const policyStep = trace.steps.find((step) => step.name === "validate URL policy");
    const evidence = await fixture.webEvidenceRepository.getByExecution({
      executionId,
      workspaceId: "workspace_search_alpha",
    });

    assert.equal(trace.status, "failed");
    assert.equal(policyStep.status, "failed");
    assert.equal(policyStep.metadata.failureCategory, "fetch_url_blocked");
    assert.equal(evidence.searches.length, 1);
    assert.equal(evidence.fetches.length, 0);
    assert.equal(evidence.extractions.length, 0);
    await assertNoMemoryWrites(fixture);
  } finally {
    fixture.close();
  }
});

test("unavailable provider search returns a failed execution link without search network fixtures", async () => {
  const fixture = await createSearchTestOperationFixture("pap-web-search-provider-down-", {
    PAP_SEARCH_TEST_FIXTURE_HEALTH: "unavailable",
  });

  try {
    const result = await runSearchTestOperation(fixture.state, {
      query: "local AI engineering",
      workspaceId: "workspace_search_alpha",
    });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.error.code, "WEB_SEARCH_FAILED");
    assert.equal(result.ok === false && result.executionId !== undefined, true);

    const trace = await fixture.traceRepository.getById(
      result.ok === false ? result.executionId : "exec_missing",
    );

    assert.equal(trace.status, "failed");
    assert.equal(
      trace.steps.some((step) => step.name === "search web"),
      false,
    );
    assert.equal(
      trace.steps.some(
        (step) =>
          step.name === "search provider health check" &&
          step.metadata.healthStatus === "unavailable",
      ),
      true,
    );
  } finally {
    fixture.close();
  }
});

async function createSearchTestOperationFixture(prefix, rawEnvOverrides = {}) {
  const temporaryDatabase = await createTemporarySqliteDatabase(prefix);
  const rawEnv = {
    PAP_ENVIRONMENT: "test",
    PAP_SEARCH_TEST_FIXTURES: "true",
    ...rawEnvOverrides,
  };

  runMigrations({ databaseUrl: temporaryDatabase.databaseUrl });
  const connection = createSqliteDatabase({ databaseUrl: temporaryDatabase.databaseUrl });
  const traceRepository = new SqliteExecutionTraceRepository(connection.db);
  const semanticMemoryRepository = new SqliteSemanticMemoryRepository(connection.db);
  const episodicMemoryRepository = new SqliteEpisodicMemoryRepository(connection.db);
  const sourceProfileRepository = new SqliteSourceProfileRepository(connection.db);
  const webEvidenceRepository = new SqliteWebEvidenceRepository(connection.db);
  const memoryService = createMemoryService({
    semanticMemoryRepository,
    episodicMemoryRepository,
    executionTraceRepository: traceRepository,
  });
  const searchProviderRegistry = createSearchTestFixtureSearchProviderRegistry({ rawEnv });
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
    capabilities: [createSearchExtractTestCapability()],
    searchProviderRegistry,
    defaultSearchProviderId: "provider.searxng",
    urlSafetyPolicy,
    guardedFetchClient,
    sourceProfileService,
    webEvidenceRepository,
  });

  return {
    state: {
      runtime,
    },
    traceRepository,
    semanticMemoryRepository,
    episodicMemoryRepository,
    webEvidenceRepository,
    close: connection.close,
  };
}

async function assertNoMemoryWrites(fixture) {
  assert.equal((await fixture.semanticMemoryRepository.list()).length, 0);
  assert.equal((await fixture.episodicMemoryRepository.list()).length, 0);
}
