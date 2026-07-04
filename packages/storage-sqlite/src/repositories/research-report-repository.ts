import {
  type ExecutionId,
  type ResearchReport,
  type ResearchReportId,
  type ResearchReportListPage,
  type ResearchSelectedSource,
  type ResearchReportStatus,
  type WorkspaceId,
  researchReportListPageSchema,
  researchReportSchema,
} from "@pap/contracts";
import { createId, nowIso } from "@pap/shared";
import type {
  CreateResearchReportInput,
  GetResearchReportByIdInput,
  ListResearchReportsInput,
  ReplaceResearchReportContentInput,
  ResearchReportRepository,
  UpdateResearchReportStatusInput,
} from "@pap/storage";
import { and, asc, count, desc, eq, isNull, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { executionTraces, researchReports, researchSources } from "../schema/index.js";
import type * as sqliteSchema from "../schema/index.js";
import { toResearchReport, toResearchSelectedSource } from "./research-mappers.js";

const defaultPage = 1;
const defaultPageSize = 20;
const maxPageSize = 50;

export class SqliteResearchReportRepository implements ResearchReportRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof sqliteSchema>) {}

  async create(input: CreateResearchReportInput): Promise<ResearchReport> {
    await this.assertExecutionWorkspace(input.executionId, input.workspaceId);

    const timestamp = input.createdAt ?? nowIso();
    const report = researchReportSchema.parse({
      id: input.id ?? createId("research_report"),
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      question: input.question,
      summary: input.summary,
      findings: input.findings ?? [],
      sources: [],
      citations: input.citations ?? [],
      limitations: input.limitations ?? [],
      warnings: input.warnings ?? [],
      status: input.status ?? "pending",
      createdAt: timestamp,
      completedAt: input.completedAt ?? null,
    });

    await this.db.insert(researchReports).values({
      id: report.id,
      executionId: report.executionId,
      workspaceId: report.workspaceId,
      question: report.question,
      summaryJson: JSON.stringify(report.summary),
      findingsJson: JSON.stringify(report.findings),
      citationsJson: JSON.stringify(report.citations),
      limitationsJson: JSON.stringify(report.limitations),
      warningsJson: JSON.stringify(report.warnings),
      status: report.status,
      createdAt: report.createdAt,
      updatedAt: timestamp,
      completedAt: report.completedAt,
    });

    const created = await this.getById({ id: report.id, workspaceId: report.workspaceId });
    return requireReport(created, report.id);
  }

  async getById(input: GetResearchReportByIdInput): Promise<ResearchReport | null> {
    const [row] = await this.db
      .select()
      .from(researchReports)
      .where(and(eq(researchReports.id, input.id), reportWorkspaceFilter(input.workspaceId)))
      .limit(1);

    if (!row) {
      return null;
    }

    return toResearchReport(row, await this.getSources(row.id));
  }

  async list(input: ListResearchReportsInput): Promise<ResearchReportListPage> {
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    const offset = (page - 1) * pageSize;
    const filters = buildReportFilters(input);

    const rows = await this.db
      .select()
      .from(researchReports)
      .where(and(...filters))
      .orderBy(desc(researchReports.createdAt), desc(researchReports.id))
      .limit(pageSize)
      .offset(offset);

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(researchReports)
      .where(and(...filters));

    const reports: ResearchReport[] = [];

    for (const row of rows) {
      reports.push(toResearchReport(row, await this.getSources(row.id)));
    }

    const total = totalRow?.total ?? 0;

    return researchReportListPageSchema.parse({
      reports,
      page,
      pageSize,
      total,
      hasNextPage: offset + reports.length < total,
      hasPreviousPage: page > 1,
    });
  }

  async updateStatus(input: UpdateResearchReportStatusInput): Promise<ResearchReport> {
    const existing = await this.getById(input);

    if (!existing) {
      throw new Error(`Research report not found: ${input.id}`);
    }

    const completedAt = normalizeCompletedAt(input.status, input.completedAt);

    await this.db
      .update(researchReports)
      .set({
        status: input.status,
        completedAt,
        updatedAt: input.updatedAt ?? nowIso(),
      })
      .where(and(eq(researchReports.id, input.id), reportWorkspaceFilter(input.workspaceId)));

    const updated = await this.getById(input);
    return requireReport(updated, input.id);
  }

  async replaceContent(input: ReplaceResearchReportContentInput): Promise<ResearchReport> {
    return this.db.transaction((tx) => {
      const [row] = tx
        .select()
        .from(researchReports)
        .where(and(eq(researchReports.id, input.id), reportWorkspaceFilter(input.workspaceId)))
        .limit(1)
        .all();

      if (!row) {
        throw new Error(`Research report not found: ${input.id}`);
      }

      const sourceRows = tx
        .select()
        .from(researchSources)
        .where(eq(researchSources.reportId, input.id))
        .all();
      const sources = sourceRows.map(toResearchSelectedSource);
      const status = input.status ?? row.status;
      const completedAt =
        input.completedAt === undefined
          ? normalizeCompletedAt(status, row.completedAt)
          : normalizeCompletedAt(status, input.completedAt);
      const report = researchReportSchema.parse({
        id: row.id,
        executionId: row.executionId,
        workspaceId: row.workspaceId,
        question: row.question,
        summary: input.summary,
        findings: input.findings,
        sources,
        citations: input.citations,
        limitations: input.limitations,
        warnings: input.warnings,
        status,
        createdAt: row.createdAt,
        completedAt,
      });

      tx.update(researchReports)
        .set({
          summaryJson: JSON.stringify(report.summary),
          findingsJson: JSON.stringify(report.findings),
          citationsJson: JSON.stringify(report.citations),
          limitationsJson: JSON.stringify(report.limitations),
          warningsJson: JSON.stringify(report.warnings),
          status: report.status,
          completedAt: report.completedAt,
          updatedAt: input.updatedAt ?? nowIso(),
        })
        .where(eq(researchReports.id, input.id))
        .run();

      const [updatedRow] = tx
        .select()
        .from(researchReports)
        .where(eq(researchReports.id, input.id))
        .limit(1)
        .all();

      if (!updatedRow) {
        throw new Error(`Research report was not found after update: ${input.id}`);
      }

      return toResearchReport(updatedRow, sources);
    });
  }

  private async getSources(reportId: ResearchReportId): Promise<ResearchSelectedSource[]> {
    const rows = await this.db
      .select()
      .from(researchSources)
      .where(eq(researchSources.reportId, reportId))
      .orderBy(
        asc(researchSources.selectionRank),
        asc(researchSources.createdAt),
        asc(researchSources.id),
      );

    return rows.map(toResearchSelectedSource);
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
      throw new Error(`Execution trace not found for research report: ${executionId}`);
    }

    if ((trace.workspaceId ?? null) !== workspaceId) {
      throw new Error(`Research report workspace mismatch for execution: ${executionId}`);
    }
  }
}

function buildReportFilters(input: ListResearchReportsInput): SQL[] {
  const filters: SQL[] = [reportWorkspaceFilter(input.workspaceId)];

  if (input.executionId) {
    filters.push(eq(researchReports.executionId, input.executionId));
  }

  if (input.status) {
    filters.push(eq(researchReports.status, input.status));
  }

  return filters;
}

function reportWorkspaceFilter(workspaceId: WorkspaceId | null): SQL {
  return workspaceId === null
    ? isNull(researchReports.workspaceId)
    : eq(researchReports.workspaceId, workspaceId);
}

function normalizePage(page: number | undefined): number {
  if (page === undefined) {
    return defaultPage;
  }

  return Math.max(Math.trunc(page), 1);
}

function normalizePageSize(pageSize: number | undefined): number {
  if (pageSize === undefined) {
    return defaultPageSize;
  }

  return Math.min(Math.max(Math.trunc(pageSize), 1), maxPageSize);
}

function normalizeCompletedAt(
  status: ResearchReportStatus,
  completedAt: string | null | undefined,
): string | null {
  if (status === "pending" || status === "running") {
    return null;
  }

  return completedAt ?? nowIso();
}

function requireReport(report: ResearchReport | null, reportId: ResearchReportId): ResearchReport {
  if (!report) {
    throw new Error(`Research report was not found after write: ${reportId}`);
  }

  return report;
}
