import {
  type ExecutionId,
  type WebEvidenceBundle,
  type WebEvidenceId,
  type WebExtractionEvidence,
  type WebFetchEvidence,
  type WebSearchEvidence,
  type WorkspaceId,
  webEvidenceBundleSchema,
  webExtractionEvidenceSchema,
  webFetchEvidenceSchema,
  webSearchEvidenceSchema,
} from "@pap/contracts";
import { createId, nowIso } from "@pap/shared";
import type {
  CreateWebExtractionEvidenceInput,
  CreateWebFetchEvidenceInput,
  CreateWebSearchEvidenceInput,
  GetWebEvidenceByExecutionInput,
  WebEvidenceRepository,
} from "@pap/storage";
import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as sqliteSchema from "../schema/index.js";
import {
  executionTraces,
  type WebExtractionEvidenceRow,
  type WebFetchEvidenceRow,
  type WebSearchEvidenceRow,
  webExtractionEvidence,
  webFetchEvidence,
  webSearchEvidence,
} from "../schema/index.js";

const retentionDays = 30;

export class SqliteWebEvidenceRepository implements WebEvidenceRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof sqliteSchema>) {}

  async createSearch(input: CreateWebSearchEvidenceInput): Promise<WebSearchEvidence> {
    await this.assertExecutionWorkspace(input.executionId, input.workspaceId);

    const createdAt = input.createdAt ?? nowIso();
    const evidence = webSearchEvidenceSchema.parse({
      id: input.id ?? createId("web_search_evidence"),
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      providerId: input.providerId,
      query: input.query,
      request: input.request,
      status: input.status,
      resultCount: input.resultCount,
      results: input.results,
      warnings: input.warnings ?? [],
      failureCategory: input.failureCategory ?? null,
      failureMessage: input.failureMessage ?? null,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      createdAt,
      expiresAt: input.expiresAt ?? addDaysIso(createdAt, retentionDays),
    });

    await this.db.insert(webSearchEvidence).values({
      id: evidence.id,
      executionId: evidence.executionId,
      workspaceId: evidence.workspaceId,
      providerId: evidence.providerId,
      query: evidence.query,
      requestJson: JSON.stringify(evidence.request),
      status: evidence.status,
      resultCount: evidence.resultCount,
      resultsJson: JSON.stringify(evidence.results),
      warningsJson: JSON.stringify(evidence.warnings),
      failureCategory: evidence.failureCategory,
      failureMessage: evidence.failureMessage,
      startedAt: evidence.startedAt,
      completedAt: evidence.completedAt,
      durationMs: evidence.durationMs,
      createdAt: evidence.createdAt,
      expiresAt: evidence.expiresAt,
    });

    return evidence;
  }

  async createFetch(input: CreateWebFetchEvidenceInput): Promise<WebFetchEvidence> {
    await this.assertExecutionWorkspace(input.executionId, input.workspaceId);

    if (input.searchEvidenceId !== undefined && input.searchEvidenceId !== null) {
      await this.assertSearchEvidenceLink({
        id: input.searchEvidenceId,
        executionId: input.executionId,
        workspaceId: input.workspaceId,
      });
    }

    const createdAt = input.createdAt ?? nowIso();
    const evidence = webFetchEvidenceSchema.parse({
      id: input.id ?? createId("web_fetch_evidence"),
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      searchEvidenceId: input.searchEvidenceId ?? null,
      selectedUrlSource: input.selectedUrlSource,
      selectedResultIndex: input.selectedResultIndex ?? null,
      requestedUrl: input.requestedUrl,
      finalUrl: input.finalUrl ?? null,
      status: input.status,
      statusCode: input.statusCode ?? null,
      contentType: input.contentType ?? null,
      contentLength: input.contentLength ?? null,
      contentBytes: input.contentBytes ?? null,
      bodySha256: input.bodySha256 ?? null,
      redirects: input.redirects ?? [],
      warnings: input.warnings ?? [],
      failureCategory: input.failureCategory ?? null,
      failureMessage: input.failureMessage ?? null,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      createdAt,
      expiresAt: input.expiresAt ?? addDaysIso(createdAt, retentionDays),
    });

    await this.db.insert(webFetchEvidence).values({
      id: evidence.id,
      executionId: evidence.executionId,
      workspaceId: evidence.workspaceId,
      searchEvidenceId: evidence.searchEvidenceId,
      selectedUrlSource: evidence.selectedUrlSource,
      selectedResultIndex: evidence.selectedResultIndex,
      requestedUrl: evidence.requestedUrl,
      finalUrl: evidence.finalUrl,
      status: evidence.status,
      statusCode: evidence.statusCode,
      contentType: evidence.contentType,
      contentLength: evidence.contentLength,
      contentBytes: evidence.contentBytes,
      bodySha256: evidence.bodySha256,
      redirectsJson: JSON.stringify(evidence.redirects),
      warningsJson: JSON.stringify(evidence.warnings),
      failureCategory: evidence.failureCategory,
      failureMessage: evidence.failureMessage,
      startedAt: evidence.startedAt,
      completedAt: evidence.completedAt,
      durationMs: evidence.durationMs,
      createdAt: evidence.createdAt,
      expiresAt: evidence.expiresAt,
    });

    return evidence;
  }

  async createExtraction(input: CreateWebExtractionEvidenceInput): Promise<WebExtractionEvidence> {
    await this.assertExecutionWorkspace(input.executionId, input.workspaceId);

    if (input.fetchEvidenceId !== undefined && input.fetchEvidenceId !== null) {
      await this.assertFetchEvidenceLink({
        id: input.fetchEvidenceId,
        executionId: input.executionId,
        workspaceId: input.workspaceId,
      });
    }

    const createdAt = input.createdAt ?? nowIso();
    const evidence = webExtractionEvidenceSchema.parse({
      id: input.id ?? createId("web_extraction_evidence"),
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      fetchEvidenceId: input.fetchEvidenceId ?? null,
      finalUrl: input.finalUrl,
      status: input.status,
      extractionMethod: input.extractionMethod ?? null,
      sourceProfileId: input.sourceProfileId ?? null,
      title: input.title ?? null,
      byline: input.byline ?? null,
      siteName: input.siteName ?? null,
      publishedAt: input.publishedAt ?? null,
      canonicalUrl: input.canonicalUrl ?? null,
      excerpt: input.excerpt ?? null,
      wordCount: input.wordCount ?? null,
      contentTextSnapshot: input.contentTextSnapshot ?? null,
      contentTextSha256: input.contentTextSha256 ?? null,
      contentChars: input.contentChars ?? null,
      originalContentChars: input.originalContentChars ?? null,
      warnings: input.warnings ?? [],
      failureCategory: input.failureCategory ?? null,
      failureMessage: input.failureMessage ?? null,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      createdAt,
      expiresAt: input.expiresAt ?? addDaysIso(createdAt, retentionDays),
    });

    await this.db.insert(webExtractionEvidence).values({
      id: evidence.id,
      executionId: evidence.executionId,
      workspaceId: evidence.workspaceId,
      fetchEvidenceId: evidence.fetchEvidenceId,
      finalUrl: evidence.finalUrl,
      status: evidence.status,
      extractionMethod: evidence.extractionMethod,
      sourceProfileId: evidence.sourceProfileId,
      title: evidence.title,
      byline: evidence.byline,
      siteName: evidence.siteName,
      publishedAt: evidence.publishedAt,
      canonicalUrl: evidence.canonicalUrl,
      excerpt: evidence.excerpt,
      wordCount: evidence.wordCount,
      contentTextSnapshot: evidence.contentTextSnapshot,
      contentTextSha256: evidence.contentTextSha256,
      contentChars: evidence.contentChars,
      originalContentChars: evidence.originalContentChars,
      warningsJson: JSON.stringify(evidence.warnings),
      failureCategory: evidence.failureCategory,
      failureMessage: evidence.failureMessage,
      startedAt: evidence.startedAt,
      completedAt: evidence.completedAt,
      durationMs: evidence.durationMs,
      createdAt: evidence.createdAt,
      expiresAt: evidence.expiresAt,
    });

    return evidence;
  }

  async getByExecution(input: GetWebEvidenceByExecutionInput): Promise<WebEvidenceBundle> {
    const searchRows = await this.db
      .select()
      .from(webSearchEvidence)
      .where(searchWorkspaceExecutionFilter(input))
      .orderBy(asc(webSearchEvidence.createdAt));
    const fetchRows = await this.db
      .select()
      .from(webFetchEvidence)
      .where(fetchWorkspaceExecutionFilter(input))
      .orderBy(asc(webFetchEvidence.createdAt));
    const extractionRows = await this.db
      .select()
      .from(webExtractionEvidence)
      .where(extractionWorkspaceExecutionFilter(input))
      .orderBy(asc(webExtractionEvidence.createdAt));

    return webEvidenceBundleSchema.parse({
      searches: searchRows.map(toWebSearchEvidence),
      fetches: fetchRows.map(toWebFetchEvidence),
      extractions: extractionRows.map(toWebExtractionEvidence),
    });
  }

  private async assertExecutionWorkspace(
    executionId: ExecutionId,
    workspaceId: WorkspaceId | null,
  ): Promise<void> {
    const [trace] = await this.db
      .select({
        id: executionTraces.id,
        workspaceId: executionTraces.workspaceId,
      })
      .from(executionTraces)
      .where(eq(executionTraces.id, executionId))
      .limit(1);

    if (!trace) {
      throw new Error(`Execution trace not found for web evidence: ${executionId}`);
    }

    const traceWorkspaceId = trace.workspaceId ?? null;

    if (traceWorkspaceId !== workspaceId) {
      throw new Error(`Web evidence workspace mismatch for execution: ${executionId}`);
    }
  }

  private async assertSearchEvidenceLink(input: EvidenceLinkInput): Promise<void> {
    const [row] = await this.db
      .select({
        id: webSearchEvidence.id,
        executionId: webSearchEvidence.executionId,
        workspaceId: webSearchEvidence.workspaceId,
      })
      .from(webSearchEvidence)
      .where(eq(webSearchEvidence.id, input.id))
      .limit(1);

    assertEvidenceLink("search", row, input);
  }

  private async assertFetchEvidenceLink(input: EvidenceLinkInput): Promise<void> {
    const [row] = await this.db
      .select({
        id: webFetchEvidence.id,
        executionId: webFetchEvidence.executionId,
        workspaceId: webFetchEvidence.workspaceId,
      })
      .from(webFetchEvidence)
      .where(eq(webFetchEvidence.id, input.id))
      .limit(1);

    assertEvidenceLink("fetch", row, input);
  }
}

type EvidenceLinkInput = {
  id: WebEvidenceId;
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
};

type EvidenceLinkRow = {
  id: WebEvidenceId;
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
};

function assertEvidenceLink(
  kind: "search" | "fetch",
  row: EvidenceLinkRow | undefined,
  input: EvidenceLinkInput,
): void {
  if (!row) {
    throw new Error(`Referenced ${kind} evidence was not found: ${input.id}`);
  }

  if (row.executionId !== input.executionId || (row.workspaceId ?? null) !== input.workspaceId) {
    throw new Error(`Referenced ${kind} evidence does not match execution workspace.`);
  }
}

function searchWorkspaceExecutionFilter(input: GetWebEvidenceByExecutionInput): SQL {
  const workspaceFilter =
    input.workspaceId === null
      ? isNull(webSearchEvidence.workspaceId)
      : eq(webSearchEvidence.workspaceId, input.workspaceId);

  return and(eq(webSearchEvidence.executionId, input.executionId), workspaceFilter) as SQL;
}

function fetchWorkspaceExecutionFilter(input: GetWebEvidenceByExecutionInput): SQL {
  const workspaceFilter =
    input.workspaceId === null
      ? isNull(webFetchEvidence.workspaceId)
      : eq(webFetchEvidence.workspaceId, input.workspaceId);

  return and(eq(webFetchEvidence.executionId, input.executionId), workspaceFilter) as SQL;
}

function extractionWorkspaceExecutionFilter(input: GetWebEvidenceByExecutionInput): SQL {
  const workspaceFilter =
    input.workspaceId === null
      ? isNull(webExtractionEvidence.workspaceId)
      : eq(webExtractionEvidence.workspaceId, input.workspaceId);

  return and(eq(webExtractionEvidence.executionId, input.executionId), workspaceFilter) as SQL;
}

function toWebSearchEvidence(row: WebSearchEvidenceRow): WebSearchEvidence {
  return webSearchEvidenceSchema.parse({
    id: row.id,
    executionId: row.executionId,
    workspaceId: row.workspaceId,
    providerId: row.providerId,
    query: row.query,
    request: parseJson(row.requestJson),
    status: row.status,
    resultCount: row.resultCount,
    results: parseJson(row.resultsJson),
    warnings: parseJson(row.warningsJson),
    failureCategory: row.failureCategory,
    failureMessage: row.failureMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  });
}

function toWebFetchEvidence(row: WebFetchEvidenceRow): WebFetchEvidence {
  return webFetchEvidenceSchema.parse({
    id: row.id,
    executionId: row.executionId,
    workspaceId: row.workspaceId,
    searchEvidenceId: row.searchEvidenceId,
    selectedUrlSource: row.selectedUrlSource,
    selectedResultIndex: row.selectedResultIndex,
    requestedUrl: row.requestedUrl,
    finalUrl: row.finalUrl,
    status: row.status,
    statusCode: row.statusCode,
    contentType: row.contentType,
    contentLength: row.contentLength,
    contentBytes: row.contentBytes,
    bodySha256: row.bodySha256,
    redirects: parseJson(row.redirectsJson),
    warnings: parseJson(row.warningsJson),
    failureCategory: row.failureCategory,
    failureMessage: row.failureMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  });
}

function toWebExtractionEvidence(row: WebExtractionEvidenceRow): WebExtractionEvidence {
  return webExtractionEvidenceSchema.parse({
    id: row.id,
    executionId: row.executionId,
    workspaceId: row.workspaceId,
    fetchEvidenceId: row.fetchEvidenceId,
    finalUrl: row.finalUrl,
    status: row.status,
    extractionMethod: row.extractionMethod,
    sourceProfileId: row.sourceProfileId,
    title: row.title,
    byline: row.byline,
    siteName: row.siteName,
    publishedAt: row.publishedAt,
    canonicalUrl: row.canonicalUrl,
    excerpt: row.excerpt,
    wordCount: row.wordCount,
    contentTextSnapshot: row.contentTextSnapshot,
    contentTextSha256: row.contentTextSha256,
    contentChars: row.contentChars,
    originalContentChars: row.originalContentChars,
    warnings: parseJson(row.warningsJson),
    failureCategory: row.failureCategory,
    failureMessage: row.failureMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  });
}

function addDaysIso(value: string, days: number): string {
  return new Date(Date.parse(value) + days * 24 * 60 * 60 * 1000).toISOString();
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
