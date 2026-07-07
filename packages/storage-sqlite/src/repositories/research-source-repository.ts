import {
  type ResearchCitation,
  type ResearchSelectedSource,
  type ResearchSourceAnalysis,
  type ResearchSourceId,
  type WorkspaceId,
  researchCitationSchema,
  researchSelectedSourceSchema,
  researchSourceAnalysisSchema,
} from "@pap/contracts";
import { createId, nowIso } from "@pap/shared";
import type {
  CreateResearchSourceInput,
  GetResearchSourceByIdInput,
  ListResearchSourcesByExecutionInput,
  ListResearchSourcesByReportInput,
  ResearchSourceRepository,
  UpdateResearchSourceAnalysisInput,
  UpdateResearchSourceStatusInput,
} from "@pap/storage";
import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  researchReports,
  researchSources,
  type ResearchReportRow,
  webExtractionEvidence,
} from "../schema/index.js";
import type * as sqliteSchema from "../schema/index.js";
import { parseJson, toResearchSelectedSource } from "./research-mappers.js";

export class SqliteResearchSourceRepository implements ResearchSourceRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof sqliteSchema>) {}

  async create(input: CreateResearchSourceInput): Promise<ResearchSelectedSource> {
    const report = await this.assertReportLink(input);

    if (input.evidenceId !== undefined && input.evidenceId !== null) {
      await this.assertExtractionEvidenceLink({
        evidenceId: input.evidenceId,
        executionId: input.executionId,
        workspaceId: input.workspaceId,
      });
    }

    const timestamp = input.createdAt ?? nowIso();
    const source = researchSelectedSourceSchema.parse({
      id: input.id ?? createId("research_source"),
      reportId: input.reportId,
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      evidenceId: input.evidenceId ?? null,
      url: input.url,
      finalUrl: input.finalUrl ?? null,
      title: input.title ?? null,
      publishedAt: input.publishedAt ?? null,
      selectionRank: input.selectionRank ?? null,
      relevanceScore: input.relevanceScore ?? null,
      analysis: input.analysis ?? null,
      citationIds: input.citationIds ?? [],
      status: input.status ?? "selected",
      createdAt: timestamp,
      updatedAt: input.updatedAt ?? timestamp,
    });

    assertAnalysisMatchesSource(source.analysis, source);
    assertCitationIdsMatchReport(source.citationIds, report, source);

    await this.db.insert(researchSources).values({
      id: source.id,
      reportId: source.reportId,
      executionId: source.executionId,
      workspaceId: source.workspaceId,
      evidenceId: source.evidenceId,
      url: source.url,
      finalUrl: source.finalUrl,
      title: source.title,
      publishedAt: source.publishedAt,
      selectionRank: source.selectionRank,
      relevanceScore: source.relevanceScore,
      analysisJson: source.analysis === null ? null : JSON.stringify(source.analysis),
      citationIdsJson: JSON.stringify(source.citationIds),
      status: source.status,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    });

    const created = await this.getById({ id: source.id, workspaceId: source.workspaceId });
    return requireSource(created, source.id);
  }

  async getById(input: GetResearchSourceByIdInput): Promise<ResearchSelectedSource | null> {
    const [row] = await this.db
      .select()
      .from(researchSources)
      .where(and(eq(researchSources.id, input.id), sourceWorkspaceFilter(input.workspaceId)))
      .limit(1);

    return row ? toResearchSelectedSource(row) : null;
  }

  async listByReport(input: ListResearchSourcesByReportInput): Promise<ResearchSelectedSource[]> {
    const rows = await this.db
      .select()
      .from(researchSources)
      .where(
        and(eq(researchSources.reportId, input.reportId), sourceWorkspaceFilter(input.workspaceId)),
      )
      .orderBy(
        asc(researchSources.selectionRank),
        asc(researchSources.createdAt),
        asc(researchSources.id),
      );

    return rows.map(toResearchSelectedSource);
  }

  async listByExecution(
    input: ListResearchSourcesByExecutionInput,
  ): Promise<ResearchSelectedSource[]> {
    const rows = await this.db
      .select()
      .from(researchSources)
      .where(
        and(
          eq(researchSources.executionId, input.executionId),
          sourceWorkspaceFilter(input.workspaceId),
        ),
      )
      .orderBy(
        asc(researchSources.selectionRank),
        asc(researchSources.createdAt),
        asc(researchSources.id),
      );

    return rows.map(toResearchSelectedSource);
  }

  async updateStatus(input: UpdateResearchSourceStatusInput): Promise<ResearchSelectedSource> {
    const existing = await this.getById(input);

    if (!existing) {
      throw new Error(`Research source not found: ${input.id}`);
    }

    await this.db
      .update(researchSources)
      .set({
        status: input.status,
        updatedAt: input.updatedAt ?? nowIso(),
      })
      .where(and(eq(researchSources.id, input.id), sourceWorkspaceFilter(input.workspaceId)));

    const updated = await this.getById(input);
    return requireSource(updated, input.id);
  }

  async updateAnalysis(input: UpdateResearchSourceAnalysisInput): Promise<ResearchSelectedSource> {
    const [row] = await this.db
      .select()
      .from(researchSources)
      .where(and(eq(researchSources.id, input.id), sourceWorkspaceFilter(input.workspaceId)))
      .limit(1);

    if (!row) {
      throw new Error(`Research source not found: ${input.id}`);
    }

    const source = toResearchSelectedSource(row);
    const analysis = researchSourceAnalysisSchema.parse(input.analysis);
    assertAnalysisMatchesSource(analysis, source);

    const citationIds = input.citationIds ?? source.citationIds;
    const report = await this.requireReport(source.reportId);
    assertCitationIdsMatchReport(citationIds, report, source);

    await this.db
      .update(researchSources)
      .set({
        analysisJson: JSON.stringify(analysis),
        citationIdsJson: JSON.stringify(citationIds),
        status: input.status ?? "analyzed",
        relevanceScore: analysis.relevanceScore,
        updatedAt: input.updatedAt ?? nowIso(),
      })
      .where(and(eq(researchSources.id, input.id), sourceWorkspaceFilter(input.workspaceId)));

    const updated = await this.getById(input);
    return requireSource(updated, input.id);
  }

  private async assertReportLink(input: CreateResearchSourceInput): Promise<ResearchReportRow> {
    const report = await this.requireReport(input.reportId);

    if (
      report.executionId !== input.executionId ||
      (report.workspaceId ?? null) !== input.workspaceId
    ) {
      throw new Error(`Research source report linkage mismatch: ${input.reportId}`);
    }

    return report;
  }

  private async requireReport(reportId: string): Promise<ResearchReportRow> {
    const [report] = await this.db
      .select()
      .from(researchReports)
      .where(eq(researchReports.id, reportId))
      .limit(1);

    if (!report) {
      throw new Error(`Research report not found for source: ${reportId}`);
    }

    return report;
  }

  private async assertExtractionEvidenceLink(input: {
    evidenceId: string;
    executionId: string;
    workspaceId: WorkspaceId | null;
  }): Promise<void> {
    const [evidence] = await this.db
      .select({
        id: webExtractionEvidence.id,
        executionId: webExtractionEvidence.executionId,
        workspaceId: webExtractionEvidence.workspaceId,
      })
      .from(webExtractionEvidence)
      .where(eq(webExtractionEvidence.id, input.evidenceId))
      .limit(1);

    if (!evidence) {
      throw new Error(`Research source extraction evidence not found: ${input.evidenceId}`);
    }

    if (
      evidence.executionId !== input.executionId ||
      (evidence.workspaceId ?? null) !== input.workspaceId
    ) {
      throw new Error(`Research source extraction evidence linkage mismatch: ${input.evidenceId}`);
    }
  }
}

function sourceWorkspaceFilter(workspaceId: WorkspaceId | null): SQL {
  return workspaceId === null
    ? isNull(researchSources.workspaceId)
    : eq(researchSources.workspaceId, workspaceId);
}

function assertAnalysisMatchesSource(
  analysis: ResearchSourceAnalysis | null,
  source: Pick<ResearchSelectedSource, "id" | "evidenceId">,
): void {
  if (analysis === null) {
    return;
  }

  if (analysis.sourceId !== source.id) {
    throw new Error(`Research source analysis source mismatch: ${source.id}`);
  }

  if (source.evidenceId === null || analysis.evidenceId !== source.evidenceId) {
    throw new Error(`Research source analysis evidence mismatch: ${source.id}`);
  }
}

function assertCitationIdsMatchReport(
  citationIds: string[],
  report: ResearchReportRow,
  source: Pick<ResearchSelectedSource, "id" | "evidenceId">,
): void {
  if (citationIds.length === 0) {
    return;
  }

  if (source.evidenceId === null) {
    throw new Error(`Research source citations require extraction evidence: ${source.id}`);
  }

  const citations = researchCitationSchema.array().parse(parseJson(report.citationsJson));
  const citationsById = new Map<ResearchCitation["citationId"], ResearchCitation>(
    citations.map((citation) => [citation.citationId, citation]),
  );

  for (const citationId of citationIds) {
    const citation = citationsById.get(citationId);

    if (!citation) {
      throw new Error(`Research source citation not found in report: ${citationId}`);
    }

    if (citation.sourceId !== source.id || citation.evidenceId !== source.evidenceId) {
      throw new Error(`Research source citation linkage mismatch: ${citationId}`);
    }
  }
}

function requireSource(
  source: ResearchSelectedSource | null,
  sourceId: ResearchSourceId,
): ResearchSelectedSource {
  if (!source) {
    throw new Error(`Research source was not found after write: ${sourceId}`);
  }

  return source;
}
