import assert from "node:assert/strict";
import { echoCapability } from "@pap/capability-echo";
import { z } from "@pap/contracts";
import { createRuntime } from "@pap/runtime";
import { createExecutionId, createTraceStepId, nowIso } from "@pap/shared";
import { createTemporarySqliteDatabase } from "@pap/testing";
import { test } from "vitest";
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
} from "../dist/index.js";

test("runMigrations can apply execution trace migrations twice", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-migrate-");

  runMigrations({ databaseUrl: temporaryDatabase.databaseUrl });
  runMigrations({ databaseUrl: temporaryDatabase.databaseUrl });

  const { repository, close } = createRepository(temporaryDatabase.databaseUrl);

  try {
    const executionId = createExecutionId();
    const trace = await repository.create({
      id: executionId,
      capabilityId: "capability.test",
      startedAt: nowIso(),
    });

    assert.equal(trace.id, executionId);
    assert.equal(trace.status, "running");
  } finally {
    close();
  }
});

test("SqliteWorkspaceRepository creates, gets, lists, updates, and archives workspaces", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-workspace-");
  const { workspaceRepository, close } = createMigratedRepositories(temporaryDatabase.databaseUrl);

  try {
    const alpha = await workspaceRepository.create({
      id: "workspace_alpha",
      name: "  Alpha  ",
      description: "Primary workspace.",
      createdAt: "2026-06-30T09:00:00.000Z",
    });
    const beta = await workspaceRepository.create({
      id: "workspace_beta",
      name: "Beta",
      createdAt: "2026-06-30T10:00:00.000Z",
    });
    const updated = await workspaceRepository.update({
      id: alpha.id,
      name: "Alpha Updated",
      description: "Updated description.",
      updatedAt: "2026-06-30T11:00:00.000Z",
    });
    const archived = await workspaceRepository.archive({
      id: beta.id,
      archivedAt: "2026-06-30T12:00:00.000Z",
    });
    const active = await workspaceRepository.list();
    const all = await workspaceRepository.list({ includeArchived: true });

    assert.equal(alpha.name, "Alpha");
    assert.equal(beta.description, "");
    assert.equal(updated.description, "Updated description.");
    assert.equal(archived.status, "archived");
    assert.equal(archived.archivedAt, "2026-06-30T12:00:00.000Z");
    assert.deepEqual(
      active.map((workspace) => workspace.id),
      ["workspace_alpha"],
    );
    assert.deepEqual(all.map((workspace) => workspace.id).sort(), [
      "workspace_alpha",
      "workspace_beta",
    ]);
    assert.equal((await workspaceRepository.getById("workspace_alpha"))?.name, "Alpha Updated");
  } finally {
    close();
  }
});

test("SqliteSourceProfileRepository creates, matches, updates, lists, and archives profiles", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-source-profile-");
  const { sourceProfileRepository, close } = createMigratedRepositories(
    temporaryDatabase.databaseUrl,
  );

  try {
    const news = await sourceProfileRepository.create({
      id: "source_profile_news",
      domain: "News.Example.COM.",
      name: "  News Example  ",
      articleContainerSelector: "main.article",
      contentSelector: ".body",
      titleSelector: "h1",
      createdAt: "2026-07-03T09:00:00.000Z",
    });
    const blog = await sourceProfileRepository.create({
      id: "source_profile_blog",
      domain: "blog.example.com",
      name: "Blog Example",
      contentSelector: "article",
      createdAt: "2026-07-03T10:00:00.000Z",
    });
    const updated = await sourceProfileRepository.update({
      id: news.id,
      name: "News Example Updated",
      notes: "Manual selector profile.",
      updatedAt: "2026-07-03T11:00:00.000Z",
    });
    const matched = await sourceProfileRepository.getActiveByDomain("NEWS.EXAMPLE.COM.");
    const archived = await sourceProfileRepository.archive({
      id: blog.id,
      archivedAt: "2026-07-03T12:00:00.000Z",
    });
    const active = await sourceProfileRepository.list();
    const all = await sourceProfileRepository.list({ includeArchived: true });

    assert.equal(news.domain, "news.example.com");
    assert.equal(news.name, "News Example");
    assert.equal(updated.notes, "Manual selector profile.");
    assert.equal(matched?.id, news.id);
    assert.equal(archived.status, "archived");
    assert.equal(archived.archivedAt, "2026-07-03T12:00:00.000Z");
    assert.deepEqual(
      active.map((profile) => profile.id),
      [news.id],
    );
    assert.deepEqual(all.map((profile) => profile.id).sort(), [blog.id, news.id]);

    await assert.rejects(
      sourceProfileRepository.create({
        id: "source_profile_duplicate",
        domain: "news.example.com",
        name: "Duplicate",
        contentSelector: "article",
      }),
      /UNIQUE constraint failed/u,
    );
  } finally {
    close();
  }
});

test("SqliteWebEvidenceRepository persists bounded execution evidence with workspace isolation", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-web-evidence-");
  const { traceRepository, webEvidenceRepository, connection, close } = createMigratedRepositories(
    temporaryDatabase.databaseUrl,
  );

  try {
    await traceRepository.create({
      id: "exec_web_alpha",
      capabilityId: "capability.search-extract-test",
      workspaceId: "workspace_alpha",
      startedAt: "2026-07-03T09:00:00.000Z",
    });
    await traceRepository.create({
      id: "exec_web_beta",
      capabilityId: "capability.search-extract-test",
      workspaceId: "workspace_beta",
      startedAt: "2026-07-03T09:00:00.000Z",
    });

    const search = await webEvidenceRepository.createSearch({
      id: "web_search_alpha",
      executionId: "exec_web_alpha",
      workspaceId: "workspace_alpha",
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
      results: [searchResultFixture()],
      warnings: [],
      startedAt: "2026-07-03T09:00:00.000Z",
      completedAt: "2026-07-03T09:00:00.100Z",
      durationMs: 100,
      createdAt: "2026-07-03T09:00:00.120Z",
    });
    const fetch = await webEvidenceRepository.createFetch({
      id: "web_fetch_alpha",
      executionId: "exec_web_alpha",
      workspaceId: "workspace_alpha",
      searchEvidenceId: search.id,
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
      startedAt: "2026-07-03T09:00:00.200Z",
      completedAt: "2026-07-03T09:00:00.350Z",
      durationMs: 150,
      createdAt: "2026-07-03T09:00:00.360Z",
    });
    const extraction = await webEvidenceRepository.createExtraction({
      id: "web_extraction_alpha",
      executionId: "exec_web_alpha",
      workspaceId: "workspace_alpha",
      fetchEvidenceId: fetch.id,
      finalUrl: "https://example.com/article",
      status: "completed",
      extractionMethod: "readability",
      sourceProfileId: null,
      title: "Local agents",
      siteName: "Example",
      canonicalUrl: "https://example.com/article",
      excerpt: "Readable content.",
      wordCount: 3,
      contentTextSnapshot: "Readable content snapshot.",
      contentTextSha256: "b".repeat(64),
      contentChars: 26,
      originalContentChars: 2_048,
      warnings: [],
      startedAt: "2026-07-03T09:00:00.400Z",
      completedAt: "2026-07-03T09:00:00.450Z",
      durationMs: 50,
      createdAt: "2026-07-03T09:00:00.460Z",
    });
    const failedFetch = await webEvidenceRepository.createFetch({
      id: "web_fetch_alpha_failed",
      executionId: "exec_web_alpha",
      workspaceId: "workspace_alpha",
      searchEvidenceId: search.id,
      selectedUrlSource: "search_result",
      selectedResultIndex: 0,
      requestedUrl: "https://example.com/article",
      finalUrl: null,
      status: "failed",
      statusCode: null,
      contentType: null,
      contentLength: null,
      contentBytes: null,
      bodySha256: null,
      redirects: [],
      warnings: [],
      failureCategory: "fetch_url_blocked",
      failureMessage: "Fetch URL is blocked by URL safety policy.",
      startedAt: "2026-07-03T09:01:00.000Z",
      completedAt: "2026-07-03T09:01:00.010Z",
      durationMs: 10,
      createdAt: "2026-07-03T09:01:00.020Z",
    });

    const alpha = await webEvidenceRepository.getByExecution({
      executionId: "exec_web_alpha",
      workspaceId: "workspace_alpha",
    });
    const betaScoped = await webEvidenceRepository.getByExecution({
      executionId: "exec_web_alpha",
      workspaceId: "workspace_beta",
    });
    const fetchColumns = connection.sqlite
      .prepare("PRAGMA table_info(web_fetch_evidence)")
      .all()
      .map((row) => row.name);
    const extractionColumns = connection.sqlite
      .prepare("PRAGMA table_info(web_extraction_evidence)")
      .all()
      .map((row) => row.name);
    const serialized = JSON.stringify(alpha);

    assert.equal(search.expiresAt, "2026-08-02T09:00:00.120Z");
    assert.equal(fetch.bodySha256, "a".repeat(64));
    assert.equal(extraction.contentTextSnapshot, "Readable content snapshot.");
    assert.equal(failedFetch.failureCategory, "fetch_url_blocked");
    assert.deepEqual(
      alpha.fetches.map((evidence) => evidence.id),
      ["web_fetch_alpha", "web_fetch_alpha_failed"],
    );
    assert.deepEqual(betaScoped, { searches: [], fetches: [], extractions: [] });
    assert.equal(serialized.includes("<html"), false);
    assert.equal(serialized.toLowerCase().includes("authorization"), false);
    assert.equal(serialized.toLowerCase().includes("cookie"), false);
    assert.equal(fetchColumns.includes("html"), false);
    assert.equal(fetchColumns.includes("headers_json"), false);
    assert.equal(extractionColumns.includes("content_html"), false);

    await assert.rejects(
      webEvidenceRepository.createSearch({
        executionId: "exec_web_alpha",
        workspaceId: "workspace_beta",
        providerId: "provider.searxng",
        query: "wrong workspace",
        request: {
          query: "wrong workspace",
          page: null,
          pageSize: 10,
          language: null,
          safesearch: null,
          categories: null,
          timeRange: null,
          providerId: "provider.searxng",
        },
        status: "completed",
        resultCount: 0,
        results: [],
        startedAt: "2026-07-03T09:02:00.000Z",
        completedAt: "2026-07-03T09:02:00.010Z",
        durationMs: 10,
      }),
      /workspace mismatch/u,
    );
  } finally {
    close();
  }
});

test("SqliteResearch repositories persist reports, sources, analyses, citations, and filters", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-research-");
  const {
    traceRepository,
    webEvidenceRepository,
    researchReportRepository,
    researchSourceRepository,
    connection,
    close,
  } = createMigratedRepositories(temporaryDatabase.databaseUrl);

  try {
    await traceRepository.create({
      id: "exec_research_alpha",
      capabilityId: "capability.research",
      workspaceId: "workspace_alpha",
      startedAt: "2026-07-04T09:00:00.000Z",
    });
    await traceRepository.create({
      id: "exec_research_unscoped",
      capabilityId: "capability.research",
      startedAt: "2026-07-04T09:30:00.000Z",
    });

    const extraction = await webEvidenceRepository.createExtraction(
      extractionEvidenceInput({
        id: "web_extraction_research_alpha",
        executionId: "exec_research_alpha",
        workspaceId: "workspace_alpha",
        finalUrl: "https://example.com/research",
      }),
    );
    const report = await researchReportRepository.create({
      id: "research_report_alpha",
      executionId: "exec_research_alpha",
      workspaceId: "workspace_alpha",
      question: "What changed in local-first agent research?",
      summary: researchSummaryFixture("Initial report shell."),
      createdAt: "2026-07-04T09:01:00.000Z",
    });
    const source = await researchSourceRepository.create({
      id: "research_source_alpha",
      reportId: report.id,
      executionId: report.executionId,
      workspaceId: report.workspaceId,
      evidenceId: extraction.id,
      url: "https://example.com/research",
      finalUrl: "https://example.com/research",
      title: "Local-first agent research",
      selectionRank: 1,
      status: "extracted",
      createdAt: "2026-07-04T09:02:00.000Z",
    });
    const completed = await researchReportRepository.replaceContent({
      id: report.id,
      workspaceId: "workspace_alpha",
      ...researchReportContentFixture(source),
      status: "completed",
      updatedAt: "2026-07-04T09:04:00.100Z",
    });
    const analyzed = await researchSourceRepository.updateAnalysis({
      id: source.id,
      workspaceId: "workspace_alpha",
      analysis: researchAnalysisFixture(source),
      citationIds: ["research_citation_alpha"],
      updatedAt: "2026-07-04T09:05:00.000Z",
    });
    await researchReportRepository.create({
      id: "research_report_unscoped",
      executionId: "exec_research_unscoped",
      workspaceId: null,
      question: "Unscoped research?",
      summary: researchSummaryFixture("Unscoped report shell."),
      createdAt: "2026-07-04T09:31:00.000Z",
    });

    const fetched = await researchReportRepository.getById({
      id: report.id,
      workspaceId: "workspace_alpha",
    });
    const alphaReports = await researchReportRepository.list({ workspaceId: "workspace_alpha" });
    const executionReports = await researchReportRepository.list({
      workspaceId: "workspace_alpha",
      executionId: "exec_research_alpha",
    });
    const unscopedReports = await researchReportRepository.list({ workspaceId: null });
    const wrongWorkspaceReports = await researchReportRepository.list({
      workspaceId: "workspace_beta",
      executionId: "exec_research_alpha",
    });
    const sourcesByReport = await researchSourceRepository.listByReport({
      reportId: report.id,
      workspaceId: "workspace_alpha",
    });
    const sourcesByExecution = await researchSourceRepository.listByExecution({
      executionId: "exec_research_alpha",
      workspaceId: "workspace_alpha",
    });
    const reportColumns = connection.sqlite
      .prepare("PRAGMA table_info(research_reports)")
      .all()
      .map((row) => row.name);
    const sourceColumns = connection.sqlite
      .prepare("PRAGMA table_info(research_sources)")
      .all()
      .map((row) => row.name);
    assert.throws(
      () =>
        connection.sqlite
          .prepare("DELETE FROM web_extraction_evidence WHERE id = ?")
          .run(extraction.id),
      /FOREIGN KEY constraint failed/u,
    );
    const fetchedAfterEvidencePurgeAttempt = await researchReportRepository.getById({
      id: report.id,
      workspaceId: "workspace_alpha",
    });
    const serialized = JSON.stringify(fetched);

    assert.equal(completed.status, "completed");
    assert.equal(typeof completed.completedAt, "string");
    assert.equal(analyzed.status, "analyzed");
    assert.equal(analyzed.analysis.evidenceId, extraction.id);
    assert.equal(fetched.citations[0].evidenceId, extraction.id);
    assert.equal(fetchedAfterEvidencePurgeAttempt.sources[0].evidenceId, extraction.id);
    assert.deepEqual(
      fetched.sources.map((item) => item.citationIds),
      [["research_citation_alpha"]],
    );
    assert.deepEqual(
      alphaReports.reports.map((item) => item.id),
      [report.id],
    );
    assert.deepEqual(
      executionReports.reports.map((item) => item.id),
      [report.id],
    );
    assert.deepEqual(
      unscopedReports.reports.map((item) => item.id),
      ["research_report_unscoped"],
    );
    assert.deepEqual(wrongWorkspaceReports.reports, []);
    assert.deepEqual(
      sourcesByReport.map((item) => item.id),
      [source.id],
    );
    assert.deepEqual(
      sourcesByExecution.map((item) => item.id),
      [source.id],
    );
    assert.equal(serialized.includes("<html"), false);
    assert.equal(serialized.toLowerCase().includes("authorization"), false);
    assert.equal(serialized.toLowerCase().includes("systemprompt"), false);
    assert.equal(serialized.toLowerCase().includes("reasoning"), false);
    assert.equal(reportColumns.includes("raw_html"), false);
    assert.equal(reportColumns.includes("prompt"), false);
    assert.equal(sourceColumns.includes("html"), false);
    assert.equal(sourceColumns.includes("raw_model_output"), false);

    assert.doesNotThrow(() =>
      connection.sqlite
        .prepare("DELETE FROM execution_traces WHERE id = ?")
        .run("exec_research_alpha"),
    );
    assert.equal(
      connection.sqlite
        .prepare("SELECT COUNT(*) AS total FROM research_sources WHERE execution_id = ?")
        .get("exec_research_alpha").total,
      0,
    );
    assert.equal(
      connection.sqlite
        .prepare("SELECT COUNT(*) AS total FROM web_extraction_evidence WHERE execution_id = ?")
        .get("exec_research_alpha").total,
      0,
    );
  } finally {
    close();
  }
});

test("SqliteResearch repositories reject invalid linkage and roll back content updates", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-research-invalid-");
  const {
    traceRepository,
    webEvidenceRepository,
    researchReportRepository,
    researchSourceRepository,
    close,
  } = createMigratedRepositories(temporaryDatabase.databaseUrl);

  try {
    await traceRepository.create({
      id: "exec_research_invalid_alpha",
      capabilityId: "capability.research",
      workspaceId: "workspace_alpha",
      startedAt: "2026-07-04T10:00:00.000Z",
    });
    await traceRepository.create({
      id: "exec_research_invalid_beta",
      capabilityId: "capability.research",
      workspaceId: "workspace_beta",
      startedAt: "2026-07-04T10:00:00.000Z",
    });

    const alphaExtraction = await webEvidenceRepository.createExtraction(
      extractionEvidenceInput({
        id: "web_extraction_research_invalid_alpha",
        executionId: "exec_research_invalid_alpha",
        workspaceId: "workspace_alpha",
        finalUrl: "https://example.com/alpha",
      }),
    );
    const betaExtraction = await webEvidenceRepository.createExtraction(
      extractionEvidenceInput({
        id: "web_extraction_research_invalid_beta",
        executionId: "exec_research_invalid_beta",
        workspaceId: "workspace_beta",
        finalUrl: "https://example.com/beta",
      }),
    );
    const report = await researchReportRepository.create({
      id: "research_report_invalid_alpha",
      executionId: "exec_research_invalid_alpha",
      workspaceId: "workspace_alpha",
      question: "Validate research linkages?",
      summary: researchSummaryFixture("Initial report shell."),
      createdAt: "2026-07-04T10:01:00.000Z",
    });
    const source = await researchSourceRepository.create({
      id: "research_source_invalid_alpha",
      reportId: report.id,
      executionId: report.executionId,
      workspaceId: report.workspaceId,
      evidenceId: alphaExtraction.id,
      url: "https://example.com/alpha",
      finalUrl: "https://example.com/alpha",
      title: "Alpha research",
      selectionRank: 1,
      createdAt: "2026-07-04T10:02:00.000Z",
    });
    const diagnosticSource = await researchSourceRepository.create({
      id: "research_source_diagnostic",
      reportId: report.id,
      executionId: report.executionId,
      workspaceId: report.workspaceId,
      evidenceId: null,
      url: "https://example.com/diagnostic",
      finalUrl: null,
      title: "Diagnostic source",
      status: "fetch_failed",
      createdAt: "2026-07-04T10:03:00.000Z",
    });

    await assert.rejects(
      researchReportRepository.create({
        id: "research_report_wrong_workspace",
        executionId: "exec_research_invalid_alpha",
        workspaceId: "workspace_beta",
        question: "Wrong workspace?",
        summary: researchSummaryFixture("Wrong workspace."),
      }),
      /workspace mismatch/u,
    );
    await assert.rejects(
      researchSourceRepository.create({
        reportId: "research_report_missing",
        executionId: report.executionId,
        workspaceId: report.workspaceId,
        url: "https://example.com/missing",
      }),
      /Research report not found/u,
    );
    await assert.rejects(
      researchSourceRepository.create({
        reportId: report.id,
        executionId: "exec_research_invalid_beta",
        workspaceId: "workspace_beta",
        evidenceId: betaExtraction.id,
        url: "https://example.com/beta",
      }),
      /linkage mismatch/u,
    );
    await assert.rejects(
      researchSourceRepository.create({
        reportId: report.id,
        executionId: report.executionId,
        workspaceId: report.workspaceId,
        evidenceId: betaExtraction.id,
        url: "https://example.com/beta",
      }),
      /evidence linkage mismatch/u,
    );
    await assert.rejects(
      researchSourceRepository.create({
        reportId: report.id,
        executionId: report.executionId,
        workspaceId: report.workspaceId,
        evidenceId: "web_extraction_missing",
        url: "https://example.com/missing-evidence",
      }),
      /evidence not found/u,
    );
    await assert.rejects(
      researchSourceRepository.updateAnalysis({
        id: source.id,
        workspaceId: report.workspaceId,
        analysis: {
          ...researchAnalysisFixture(source),
          evidenceId: betaExtraction.id,
        },
      }),
      /evidence mismatch/u,
    );
    await assert.rejects(
      researchReportRepository.replaceContent({
        id: report.id,
        workspaceId: report.workspaceId,
        ...researchReportContentFixture(source, {
          summaryText: "This invalid update should roll back.",
          citation: { sourceId: "research_source_missing" },
        }),
        status: "completed",
        completedAt: "2026-07-04T10:04:00.000Z",
      }),
      /known source ID/u,
    );
    await assert.rejects(
      researchReportRepository.replaceContent({
        id: report.id,
        workspaceId: report.workspaceId,
        ...researchReportContentFixture(diagnosticSource, {
          summaryText: "Diagnostic source should not support citations.",
          citation: {
            sourceTitle: "Diagnostic source",
            sourceUrl: "https://example.com/diagnostic",
            evidenceId: alphaExtraction.id,
          },
        }),
        status: "completed",
        completedAt: "2026-07-04T10:05:00.000Z",
      }),
      /require sources with extraction evidence/u,
    );

    const unchanged = await researchReportRepository.getById({
      id: report.id,
      workspaceId: report.workspaceId,
    });

    assert.equal(unchanged.summary.text, "Initial report shell.");
    assert.deepEqual(unchanged.findings, []);
    assert.deepEqual(unchanged.citations, []);
  } finally {
    close();
  }
});

test("SqliteSemanticMemoryRepository creates, gets, lists, and updates semantic memory", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-semantic-");
  const { workspaceRepository, semanticMemoryRepository, close } = createMigratedRepositories(
    temporaryDatabase.databaseUrl,
  );

  try {
    const workspace = await workspaceRepository.create({
      id: "workspace_semantic",
      name: "Semantic",
    });
    const memory = await semanticMemoryRepository.create({
      id: "memory_semantic_1",
      scope: "workspace",
      workspaceId: workspace.id,
      subject: "project.paos",
      predicate: "uses",
      value: { database: "sqlite", durable: true },
      confidence: 0.95,
      sensitivity: "low",
      sourceType: "manual",
      evidenceRefs: [{ type: "note", id: "note_1" }],
      createdAt: "2026-06-30T09:00:00.000Z",
    });
    const updated = await semanticMemoryRepository.update({
      id: memory.id,
      value: { database: "sqlite", orm: "drizzle" },
      confidence: 1,
      updatedAt: "2026-06-30T10:00:00.000Z",
    });
    const byWorkspace = await semanticMemoryRepository.list({ workspaceId: workspace.id });
    const bySubject = await semanticMemoryRepository.list({
      subject: "project.paos",
      predicate: "uses",
    });

    assert.deepEqual(memory.value, { database: "sqlite", durable: true });
    assert.deepEqual(updated.value, { database: "sqlite", orm: "drizzle" });
    assert.equal(updated.confidence, 1);
    assert.deepEqual(
      byWorkspace.map((record) => record.id),
      [memory.id],
    );
    assert.deepEqual(
      bySubject.map((record) => record.id),
      [memory.id],
    );
    assert.equal((await semanticMemoryRepository.getById(memory.id))?.createdBy, "user");
  } finally {
    close();
  }
});

test("SqliteSemanticMemoryRepository validates confidence and scope rules", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-semantic-rules-");
  const { semanticMemoryRepository, close } = createMigratedRepositories(
    temporaryDatabase.databaseUrl,
  );

  try {
    await assert.rejects(
      semanticMemoryRepository.create({
        scope: "personal",
        subject: "project.paos",
        predicate: "confidence",
        value: true,
        confidence: 1.1,
      }),
      /Too big/u,
    );
    await assert.rejects(
      semanticMemoryRepository.create({
        scope: "workspace",
        subject: "project.paos",
        predicate: "uses",
        value: "sqlite",
      }),
      /Workspace-scoped memory requires a workspace ID/u,
    );
  } finally {
    close();
  }
});

test("SqliteSemanticMemoryRepository excludes expired and deleted memory by default", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-semantic-exclusion-");
  const { semanticMemoryRepository, close } = createMigratedRepositories(
    temporaryDatabase.databaseUrl,
  );

  try {
    const expired = await semanticMemoryRepository.create({
      id: "memory_expired",
      scope: "personal",
      subject: "project.paos",
      predicate: "old_fact",
      value: "expired",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
    const deleted = await semanticMemoryRepository.create({
      id: "memory_deleted",
      scope: "personal",
      subject: "project.paos",
      predicate: "deleted_fact",
      value: "deleted",
    });
    const active = await semanticMemoryRepository.create({
      id: "memory_active",
      scope: "personal",
      subject: "project.paos",
      predicate: "active_fact",
      value: "active",
    });

    await semanticMemoryRepository.softDelete({ id: deleted.id });

    const defaultList = await semanticMemoryRepository.list();
    const deletedList = await semanticMemoryRepository.list({ status: "deleted" });
    const expiredIncluded = await semanticMemoryRepository.list({ includeExpired: true });

    assert.deepEqual(
      defaultList.map((record) => record.id),
      [active.id],
    );
    assert.deepEqual(
      deletedList.map((record) => record.id),
      [deleted.id],
    );
    assert.deepEqual(expiredIncluded.map((record) => record.id).sort(), [active.id, expired.id]);
  } finally {
    close();
  }
});

test("SqliteSemanticMemoryRepository supersedes semantic memory transactionally", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-semantic-supersede-");
  const { semanticMemoryRepository, close } = createMigratedRepositories(
    temporaryDatabase.databaseUrl,
  );

  try {
    const original = await semanticMemoryRepository.create({
      id: "memory_original",
      scope: "personal",
      subject: "project.paos",
      predicate: "database",
      value: "sqlite",
      createdAt: "2026-06-30T09:00:00.000Z",
    });
    const result = await semanticMemoryRepository.supersede({
      id: original.id,
      supersededAt: "2026-06-30T10:00:00.000Z",
      replacement: {
        id: "memory_replacement",
        scope: "personal",
        subject: "project.paos",
        predicate: "database",
        value: "sqlite with drizzle",
      },
    });
    const defaultList = await semanticMemoryRepository.list();

    assert.equal(result.previous.status, "superseded");
    assert.equal(result.previous.supersededByMemoryId, result.replacement.id);
    assert.equal(result.replacement.status, "active");
    assert.equal(result.replacement.supersedesMemoryId, original.id);
    assert.deepEqual(
      defaultList.map((record) => record.id),
      [result.replacement.id],
    );
  } finally {
    close();
  }
});

test("SqliteSemanticMemoryRepository approves and rejects proposed semantic memory", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-semantic-proposals-");
  const { semanticMemoryRepository, close } = createMigratedRepositories(
    temporaryDatabase.databaseUrl,
  );

  try {
    const original = await semanticMemoryRepository.create({
      id: "memory_proposal_original",
      scope: "personal",
      subject: "project.paos",
      predicate: "database",
      value: "sqlite",
      createdAt: "2026-06-30T09:00:00.000Z",
    });
    const proposal = await semanticMemoryRepository.create({
      id: "memory_proposal_replacement",
      scope: "personal",
      subject: "project.paos",
      predicate: "database",
      value: "sqlite with drizzle",
      status: "proposed",
      supersedesMemoryId: original.id,
      createdAt: "2026-06-30T10:00:00.000Z",
    });
    const rejected = await semanticMemoryRepository.create({
      id: "memory_proposal_rejected",
      scope: "personal",
      subject: "project.paos",
      predicate: "temporary",
      value: true,
      status: "proposed",
      createdAt: "2026-06-30T11:00:00.000Z",
    });

    const approved = await semanticMemoryRepository.approveProposal({
      id: proposal.id,
      approvedAt: "2026-06-30T12:00:00.000Z",
    });
    const rejectedResult = await semanticMemoryRepository.rejectProposal({
      id: rejected.id,
      rejectedAt: "2026-06-30T13:00:00.000Z",
    });
    const fetchedOriginal = await semanticMemoryRepository.getById(original.id);
    const defaultList = await semanticMemoryRepository.list();

    assert.equal(approved.status, "active");
    assert.equal(fetchedOriginal?.status, "superseded");
    assert.equal(fetchedOriginal?.supersededByMemoryId, proposal.id);
    assert.equal(rejectedResult.status, "rejected");
    assert.deepEqual(
      defaultList.map((record) => record.id),
      [proposal.id],
    );
  } finally {
    close();
  }
});

test("SqliteEpisodicMemoryRepository creates, gets, lists, updates, and links executions", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-episodic-");
  const { traceRepository, workspaceRepository, episodicMemoryRepository, close } =
    createMigratedRepositories(temporaryDatabase.databaseUrl);

  try {
    const workspace = await workspaceRepository.create({
      id: "workspace_episode",
      name: "Episodes",
    });
    await traceRepository.create({
      id: "exec_episode",
      capabilityId: "capability.echo",
      workspaceId: workspace.id,
      startedAt: "2026-06-30T09:00:00.000Z",
    });
    const older = await episodicMemoryRepository.create({
      id: "memory_episode_old",
      scope: "workspace",
      workspaceId: workspace.id,
      executionId: "exec_episode",
      capabilityId: "capability.echo",
      eventType: "capability.completed",
      summary: "Older episode.",
      relatedEntities: [{ type: "workspace", id: workspace.id }],
      evidenceRefs: ["exec_episode"],
      sourceType: "execution",
      sourceCapabilityId: "capability.echo",
      createdAt: "2026-06-30T09:01:00.000Z",
    });
    const newer = await episodicMemoryRepository.create({
      id: "memory_episode_new",
      scope: "workspace",
      workspaceId: workspace.id,
      executionId: "exec_episode",
      capabilityId: "capability.echo",
      eventType: "capability.completed",
      summary: "Newer episode.",
      sourceType: "execution",
      sourceCapabilityId: "capability.echo",
      createdAt: "2026-06-30T09:02:00.000Z",
    });
    const updated = await episodicMemoryRepository.update({
      id: older.id,
      summary: "Updated older episode.",
      outcome: "completed",
    });
    const executionEpisodes = await episodicMemoryRepository.list({ executionId: "exec_episode" });
    const fetched = await episodicMemoryRepository.getById(newer.id);

    assert.equal(updated.summary, "Updated older episode.");
    assert.equal(updated.outcome, "completed");
    assert.equal(fetched?.executionId, "exec_episode");
    assert.deepEqual(
      executionEpisodes.map((episode) => episode.id),
      [newer.id, older.id],
    );
  } finally {
    close();
  }
});

test("memory repositories isolate workspace and capability filters", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-memory-isolation-");
  const { workspaceRepository, semanticMemoryRepository, episodicMemoryRepository, close } =
    createMigratedRepositories(temporaryDatabase.databaseUrl);

  try {
    const alpha = await workspaceRepository.create({ id: "workspace_iso_alpha", name: "Alpha" });
    const beta = await workspaceRepository.create({ id: "workspace_iso_beta", name: "Beta" });

    await semanticMemoryRepository.create({
      id: "memory_workspace_alpha",
      scope: "workspace",
      workspaceId: alpha.id,
      subject: "workspace.alpha",
      predicate: "name",
      value: "Alpha",
    });
    await semanticMemoryRepository.create({
      id: "memory_workspace_beta",
      scope: "workspace",
      workspaceId: beta.id,
      subject: "workspace.beta",
      predicate: "name",
      value: "Beta",
    });
    await episodicMemoryRepository.create({
      id: "memory_capability_echo",
      scope: "capability",
      capabilityId: "capability.echo",
      eventType: "capability.completed",
      summary: "Echo completed.",
    });
    await episodicMemoryRepository.create({
      id: "memory_capability_other",
      scope: "capability",
      capabilityId: "capability.other",
      eventType: "capability.completed",
      summary: "Other completed.",
    });

    const alphaMemory = await semanticMemoryRepository.list({ workspaceId: alpha.id });
    const echoEpisodes = await episodicMemoryRepository.list({ capabilityId: "capability.echo" });

    assert.deepEqual(
      alphaMemory.map((record) => record.id),
      ["memory_workspace_alpha"],
    );
    assert.deepEqual(
      echoEpisodes.map((episode) => episode.id),
      ["memory_capability_echo"],
    );
  } finally {
    close();
  }
});

test("SqliteExecutionTraceRepository persists traces and ordered steps", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-trace-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const executionId = createExecutionId();
    const startedAt = nowIso();

    await repository.create({
      id: executionId,
      capabilityId: "capability.test",
      workspaceId: "workspace_test",
      threadId: "thread_test",
      startedAt,
    });

    await repository.appendStep({
      id: createTraceStepId(),
      executionId,
      sequence: 1,
      kind: "workflow",
      name: "second",
      status: "completed",
      startedAt,
      completedAt: nowIso(),
    });

    await repository.appendStep({
      id: createTraceStepId(),
      executionId,
      sequence: 0,
      kind: "validation",
      name: "first",
      status: "completed",
      summary: "validated input",
      startedAt,
      completedAt: nowIso(),
      metadata: {
        providerId: "provider.ollama",
        model: "llama3.2:latest",
        durationMs: 1250,
      },
    });

    const completed = await repository.markCompleted({
      executionId,
      completedAt: nowIso(),
      output: {
        summary: "Completed trace output.",
        keyPoints: ["Persisted output"],
        confidence: 1,
      },
    });

    assert.equal(completed.status, "completed");
    assert.equal(completed.workspaceId, "workspace_test");
    assert.deepEqual(completed.output, {
      summary: "Completed trace output.",
      keyPoints: ["Persisted output"],
      confidence: 1,
    });
    assert.equal(completed.steps.map((step) => step.name).join(","), "first,second");

    const fetched = await repository.getById(executionId);

    assert.equal(fetched?.steps[0]?.sequence, 0);
    assert.equal(fetched?.steps[1]?.sequence, 1);
    assert.deepEqual(fetched?.output, {
      summary: "Completed trace output.",
      keyPoints: ["Persisted output"],
      confidence: 1,
    });
    assert.deepEqual(fetched?.steps[0]?.metadata, {
      providerId: "provider.ollama",
      model: "llama3.2:latest",
      durationMs: 1250,
    });
  } finally {
    close();
  }
});

test("SqliteExecutionTraceRepository rejects steps for missing executions", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-fk-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    await assert.rejects(
      repository.appendStep({
        id: createTraceStepId(),
        executionId: "exec_missing",
        sequence: 0,
        kind: "workflow",
        name: "orphan step",
        status: "started",
        startedAt: nowIso(),
      }),
      /FOREIGN KEY constraint failed/u,
    );
  } finally {
    close();
  }
});

test("SqliteExecutionTraceRepository persists failed and cancelled traces", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-terminal-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const failedExecutionId = createExecutionId();
    const cancelledExecutionId = createExecutionId();

    await repository.create({
      id: failedExecutionId,
      capabilityId: "capability.test",
      startedAt: nowIso(),
    });
    await repository.create({
      id: cancelledExecutionId,
      capabilityId: "capability.test",
      startedAt: nowIso(),
    });

    const failed = await repository.markFailed({
      executionId: failedExecutionId,
      completedAt: nowIso(),
      error: {
        code: "TEST_FAILURE",
        message: "The test failed safely.",
        category: "storage",
        retryable: false,
      },
    });
    const cancelled = await repository.markCancelled({
      executionId: cancelledExecutionId,
      completedAt: nowIso(),
      reason: "User cancelled the test.",
    });

    assert.equal(failed.status, "failed");
    assert.equal(failed.errorCode, "TEST_FAILURE");
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.errorCode, "EXECUTION_CANCELLED");
    assert.equal(cancelled.errorMessage, "User cancelled the test.");
  } finally {
    close();
  }
});

test("SqliteExecutionTraceRepository lists recent traces by start time with filters", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-recent-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    await repository.create({
      id: "exec_old",
      capabilityId: "capability.alpha",
      startedAt: "2026-06-29T09:00:00.000Z",
    });
    await repository.create({
      id: "exec_middle",
      capabilityId: "capability.beta",
      startedAt: "2026-06-29T10:00:00.000Z",
    });
    await repository.create({
      id: "exec_new",
      capabilityId: "capability.alpha",
      startedAt: "2026-06-29T11:00:00.000Z",
    });

    await repository.markCompleted({
      executionId: "exec_new",
      completedAt: "2026-06-29T11:01:00.000Z",
    });

    const recent = await repository.listRecent({ limit: 2 });
    const alphaCompleted = await repository.listRecent({
      capabilityId: "capability.alpha",
      status: "completed",
    });

    assert.deepEqual(
      recent.map((trace) => trace.id),
      ["exec_new", "exec_middle"],
    );
    assert.deepEqual(
      alphaCompleted.map((trace) => trace.id),
      ["exec_new"],
    );
  } finally {
    close();
  }
});

test("SqliteExecutionTraceRepository pages filtered trace summaries", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-history-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    await repository.create({
      id: "exec_alpha_old",
      capabilityId: "capability.echo",
      workspaceId: "workspace_alpha",
      startedAt: "2026-06-29T09:00:00.000Z",
    });
    await repository.create({
      id: "exec_alpha_recent_a",
      capabilityId: "capability.echo",
      workspaceId: "workspace_alpha",
      startedAt: "2026-06-29T12:00:00.000Z",
    });
    await repository.create({
      id: "exec_alpha_recent_b",
      capabilityId: "capability.echo",
      workspaceId: "workspace_alpha",
      startedAt: "2026-06-29T12:00:00.000Z",
    });
    await repository.create({
      id: "exec_alpha_failed",
      capabilityId: "capability.echo",
      workspaceId: "workspace_alpha",
      startedAt: "2026-06-29T11:00:00.000Z",
    });
    await repository.create({
      id: "exec_beta_recent",
      capabilityId: "capability.echo",
      workspaceId: "workspace_beta",
      startedAt: "2026-06-29T13:00:00.000Z",
    });
    await repository.create({
      id: "exec_alpha_other_capability",
      capabilityId: "capability.other",
      workspaceId: "workspace_alpha",
      startedAt: "2026-06-29T12:30:00.000Z",
    });
    await repository.appendStep({
      id: "step_alpha_recent_b_1",
      executionId: "exec_alpha_recent_b",
      sequence: 0,
      kind: "workflow",
      name: "first step",
      status: "completed",
      startedAt: "2026-06-29T12:00:00.100Z",
      completedAt: "2026-06-29T12:00:00.200Z",
    });
    await repository.appendStep({
      id: "step_alpha_recent_b_2",
      executionId: "exec_alpha_recent_b",
      sequence: 1,
      kind: "workflow",
      name: "second step",
      status: "completed",
      startedAt: "2026-06-29T12:00:00.300Z",
      completedAt: "2026-06-29T12:00:00.400Z",
    });

    await repository.markCompleted({
      executionId: "exec_alpha_old",
      completedAt: "2026-06-29T09:01:00.000Z",
    });
    await repository.markCompleted({
      executionId: "exec_alpha_recent_a",
      completedAt: "2026-06-29T12:01:00.000Z",
    });
    await repository.markCompleted({
      executionId: "exec_alpha_recent_b",
      completedAt: "2026-06-29T12:01:00.000Z",
    });
    await repository.markFailed({
      executionId: "exec_alpha_failed",
      completedAt: "2026-06-29T11:01:00.000Z",
      error: {
        code: "TEST_FAILURE",
        message: "The filtered trace failed.",
        category: "storage",
        retryable: false,
      },
    });
    await repository.markCompleted({
      executionId: "exec_beta_recent",
      completedAt: "2026-06-29T13:01:00.000Z",
    });
    await repository.markCompleted({
      executionId: "exec_alpha_other_capability",
      completedAt: "2026-06-29T12:31:00.000Z",
    });

    const dateFiltered = await repository.listPage({
      workspaceId: "workspace_alpha",
      capabilityId: "capability.echo",
      status: "completed",
      startedFrom: "2026-06-29T10:00:00.000Z",
      startedTo: "2026-06-29T12:59:59.999Z",
      page: 1,
      pageSize: 2,
    });
    const paged = await repository.listPage({
      workspaceId: "workspace_alpha",
      capabilityId: "capability.echo",
      status: "completed",
      page: 2,
      pageSize: 1,
    });

    assert.deepEqual(
      dateFiltered.executions.map((execution) => execution.id),
      ["exec_alpha_recent_b", "exec_alpha_recent_a"],
    );
    assert.equal(dateFiltered.total, 2);
    assert.equal(dateFiltered.hasNextPage, false);
    assert.equal(dateFiltered.executions[0].stepCount, 2);
    assert.equal(dateFiltered.executions[0].workspaceId, "workspace_alpha");
    assert.deepEqual(
      paged.executions.map((execution) => execution.id),
      ["exec_alpha_recent_a"],
    );
    assert.equal(paged.total, 3);
    assert.equal(paged.hasPreviousPage, true);
    assert.equal(paged.hasNextPage, true);
  } finally {
    close();
  }
});

test("createRuntime executes echo and persists a SQLite trace", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-runtime-echo-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const runtime = createRuntime({
      traceRepository: repository,
      capabilities: [echoCapability],
    });

    const result = await runtime.execute({
      capabilityId: "capability.echo",
      input: { message: "  hello \n\t runtime  " },
      source: "cli",
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(result.data.message, "hello runtime");

    const trace = await repository.getById(result.executionId);

    assert.equal(trace?.id, result.traceId);
    assert.equal(trace?.capabilityId, "capability.echo");
    assert.equal(trace?.status, "completed");
    assert.deepEqual(trace?.output, result.data);
    assert.deepEqual(
      trace?.steps.map((step) => step.name),
      ["validate input", "echo.normalize", "validate output", "finalize execution"],
    );
    assert.deepEqual(
      trace?.steps.map((step) => step.sequence),
      [0, 1, 2, 3],
    );
  } finally {
    close();
  }
});

test("createRuntime persists failed validation traces for invalid echo input", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-runtime-invalid-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const runtime = createRuntime({
      traceRepository: repository,
      capabilities: [echoCapability],
    });

    const result = await runtime.execute({
      capabilityId: "capability.echo",
      input: { message: "   " },
      source: "cli",
    });

    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "CAPABILITY_INPUT_INVALID");

    const trace = await repository.getById(result.executionId);

    assert.equal(trace?.status, "failed");
    assert.equal(trace?.errorCode, "CAPABILITY_INPUT_INVALID");
    assert.deepEqual(
      trace?.steps.map((step) => `${step.name}:${step.status}`),
      ["validate input:failed"],
    );
  } finally {
    close();
  }
});

test("createRuntime does not create a SQLite trace for unknown capabilities", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-runtime-unknown-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const runtime = createRuntime({
      traceRepository: repository,
      capabilities: [],
    });

    const result = await runtime.execute({
      capabilityId: "capability.echo",
      input: { message: "hello" },
      source: "cli",
    });
    const traces = await repository.listRecent();

    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "CAPABILITY_NOT_FOUND");
    assert.deepEqual(traces, []);
  } finally {
    close();
  }
});

test("createRuntime serializes unhandled capability errors safely in SQLite traces", async () => {
  const temporaryDatabase = await createTemporarySqliteDatabase("pap-sqlite-runtime-error-");
  const { repository, close } = createMigratedRepository(temporaryDatabase.databaseUrl);

  try {
    const runtime = createRuntime({
      traceRepository: repository,
      capabilities: [createThrowingCapability()],
    });

    const result = await runtime.execute({
      capabilityId: "capability.boom",
      input: { message: "hello" },
      source: "cli",
    });
    const trace = await repository.getById(result.executionId);

    assert.equal(result.status, "failed");
    assert.equal(result.error.code, "CAPABILITY_EXECUTION_FAILED");
    assert.equal(result.error.message, "Capability capability.boom failed during execution.");
    assert.equal(trace?.status, "failed");
    assert.equal(trace?.errorCode, "CAPABILITY_EXECUTION_FAILED");
    assert.equal(trace?.errorMessage, "Capability capability.boom failed during execution.");
    assert.equal(JSON.stringify(result).includes("database password leaked"), false);
    assert.equal(JSON.stringify(trace).includes("database password leaked"), false);
  } finally {
    close();
  }
});

function createMigratedRepository(databaseUrl) {
  runMigrations({ databaseUrl });
  return createRepository(databaseUrl);
}

function createRepository(databaseUrl) {
  const connection = createSqliteDatabase({ databaseUrl });
  const repository = new SqliteExecutionTraceRepository(connection.db);

  return {
    repository,
    close: connection.close,
  };
}

function createMigratedRepositories(databaseUrl) {
  runMigrations({ databaseUrl });
  const connection = createSqliteDatabase({ databaseUrl });

  return {
    connection,
    traceRepository: new SqliteExecutionTraceRepository(connection.db),
    workspaceRepository: new SqliteWorkspaceRepository(connection.db),
    semanticMemoryRepository: new SqliteSemanticMemoryRepository(connection.db),
    episodicMemoryRepository: new SqliteEpisodicMemoryRepository(connection.db),
    sourceProfileRepository: new SqliteSourceProfileRepository(connection.db),
    webEvidenceRepository: new SqliteWebEvidenceRepository(connection.db),
    researchReportRepository: new SqliteResearchReportRepository(connection.db),
    researchSourceRepository: new SqliteResearchSourceRepository(connection.db),
    close: connection.close,
  };
}

function searchResultFixture() {
  return {
    title: "Local agents",
    url: "https://example.com/article",
    displayUrl: "example.com",
    snippet: "A normalized result.",
    publishedAt: null,
    engine: "test",
    category: "general",
    score: null,
  };
}

function extractionEvidenceInput(overrides) {
  return {
    executionId: overrides.executionId,
    workspaceId: overrides.workspaceId,
    id: overrides.id,
    fetchEvidenceId: null,
    finalUrl: overrides.finalUrl,
    status: "completed",
    extractionMethod: "readability",
    sourceProfileId: null,
    title: "Local-first agent research",
    siteName: "Example",
    canonicalUrl: overrides.finalUrl,
    excerpt: "Readable source content.",
    wordCount: 3,
    contentTextSnapshot: "Readable source content.",
    contentTextSha256: "c".repeat(64),
    contentChars: 24,
    originalContentChars: 1_024,
    warnings: [],
    startedAt: "2026-07-04T09:00:00.000Z",
    completedAt: "2026-07-04T09:00:00.050Z",
    durationMs: 50,
    createdAt: "2026-07-04T09:00:00.060Z",
  };
}

function researchSummaryFixture(text) {
  return {
    text,
    keyPoints: ["Private, bounded research artifacts remain visible to the user."],
  };
}

function researchReportContentFixture(source, overrides = {}) {
  const citation = {
    citationId: "research_citation_alpha",
    sourceId: source.id,
    sourceTitle: source.title,
    sourceUrl: source.finalUrl ?? source.url,
    evidenceId: source.evidenceId,
    claimText: "Local-first research keeps source-backed evidence visible.",
    sourceExcerpt: "Source-backed evidence remains visible.",
    ...(overrides.citation ?? {}),
  };

  return {
    summary: researchSummaryFixture(
      overrides.summaryText ?? "Research report content with sourced findings.",
    ),
    findings: [
      {
        id: "research_finding_alpha",
        title: "Evidence remains visible",
        claimText: "Local-first research keeps source-backed evidence visible.",
        citationIds: [citation.citationId],
        confidence: 0.86,
        kind: "sourced_fact",
      },
    ],
    citations: [citation],
    limitations: [
      {
        code: "limited_source_count",
        message: "This integration test uses a single cited source.",
      },
    ],
    warnings: [],
  };
}

function researchAnalysisFixture(source) {
  return {
    sourceId: source.id,
    evidenceId: source.evidenceId,
    summary: "The source supports a bounded research finding.",
    claims: [
      {
        claimId: "research_claim_alpha",
        claimText: "Local-first research keeps source-backed evidence visible.",
        sourceExcerpt: "Source-backed evidence remains visible.",
        confidence: 0.9,
      },
    ],
    caveats: [],
    relevanceScore: 0.82,
    confidence: 0.84,
    warnings: [],
    analyzedAt: "2026-07-04T09:05:00.000Z",
  };
}

function createThrowingCapability() {
  return {
    manifest: {
      id: "capability.boom",
      version: "0.1.0",
      name: "Boom",
      description: "Throws during execution for integration testing.",
      skill: {
        id: "skill.boom",
        version: "0.1.0",
        path: "./skills/boom",
      },
      inputSchemaId: "capability.boom.input.v1",
      outputSchemaId: "capability.boom.output.v1",
      allowedTools: [],
      allowedChildCapabilities: [],
      supportedUiBlocks: [],
      permissions: [],
      sideEffects: ["none"],
      approvalPolicyId: "approval.none",
      memoryPolicyId: "memory.none",
      trustLevel: "core",
      tags: ["test"],
    },
    inputSchema: z.object({ message: z.string().min(1) }).strict(),
    outputSchema: z.object({ message: z.string().min(1) }).strict(),
    execute: async () => {
      throw new Error("database password leaked in raw exception");
    },
  };
}
