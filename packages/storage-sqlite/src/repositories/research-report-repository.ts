import {
  type ExecutionId,
  type ResearchReport,
  type ResearchReportDashboardSummary,
  type ResearchReportHistoryItem,
  type ResearchReportHistoryPage,
  type ResearchReportHistorySort,
  type ResearchReportId,
  type ResearchReportListPage,
  type ResearchSelectedSource,
  type ResearchReportStatus,
  type WorkspaceId,
  researchReportDashboardQuerySchema,
  researchReportDashboardSummarySchema,
  researchReportHistoryPageSchema,
  researchReportHistoryQuerySchema,
  researchReportListPageSchema,
  researchReportSchema,
} from "@pap/contracts";
import { createId, nowIso } from "@pap/shared";
import type {
  CreateResearchReportInput,
  GetResearchReportDashboardSummaryInput,
  GetResearchReportByIdInput,
  ListResearchReportHistoryInput,
  ListResearchReportsInput,
  ReplaceResearchReportContentInput,
  ResearchReportRepository,
  UpdateResearchReportStatusInput,
} from "@pap/storage";
import { and, asc, count, desc, eq, gte, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  executionTraces,
  researchReports,
  researchSources,
  semanticMemory,
} from "../schema/index.js";
import type * as sqliteSchema from "../schema/index.js";
import { parseJson, toResearchReport, toResearchSelectedSource } from "./research-mappers.js";

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

  async listHistory(input: ListResearchReportHistoryInput): Promise<ResearchReportHistoryPage> {
    const query = researchReportHistoryQuerySchema.parse(input);
    const offset = (query.page - 1) * query.pageSize;
    const filters = buildReportHistoryFilters(query);
    const orderBy = buildHistoryOrderBy(query.sort);

    const rows = await this.db
      .select({
        id: researchReports.id,
        executionId: researchReports.executionId,
        workspaceId: researchReports.workspaceId,
        question: researchReports.question,
        status: researchReports.status,
        warningsJson: researchReports.warningsJson,
        pendingMemoryProposalCount: pendingMemoryProposalCountSql(),
        createdAt: researchReports.createdAt,
        updatedAt: researchReports.updatedAt,
        completedAt: researchReports.completedAt,
        effectiveAt: effectiveReportTimestampSql(),
      })
      .from(researchReports)
      .where(and(...filters))
      .orderBy(...orderBy)
      .limit(query.pageSize)
      .offset(offset);

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(researchReports)
      .where(and(...filters));

    const reports: ResearchReportHistoryItem[] = [];

    for (const row of rows) {
      reports.push(
        toResearchReportHistoryItem({
          ...row,
          sourceCount: await this.getSourceCount(row.id),
        }),
      );
    }
    const total = totalRow?.total ?? 0;

    return researchReportHistoryPageSchema.parse({
      reports,
      filters: query,
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasNextPage: offset + reports.length < total,
      hasPreviousPage: query.page > 1,
    });
  }

  async getDashboardSummary(
    input: GetResearchReportDashboardSummaryInput,
  ): Promise<ResearchReportDashboardSummary> {
    const query = researchReportDashboardQuerySchema.parse(input);
    const rows = await this.db
      .select({
        status: researchReports.status,
        warningsJson: researchReports.warningsJson,
        pendingMemoryProposalCount: pendingMemoryProposalCountSql(),
        effectiveAt: effectiveReportTimestampSql(),
      })
      .from(researchReports)
      .where(reportWorkspaceFilter(query.workspaceId));

    const statusCounts = {
      pending: 0,
      running: 0,
      completed: 0,
      completed_with_warnings: 0,
      failed: 0,
      cancelled: 0,
    };
    let warningReportCount = 0;
    let pendingMemoryProposalReportCount = 0;
    let latestReportAt: string | null = null;

    for (const row of rows) {
      statusCounts[row.status] += 1;

      if (countWarningsJson(row.warningsJson) > 0) {
        warningReportCount += 1;
      }

      if (Number(row.pendingMemoryProposalCount) > 0) {
        pendingMemoryProposalReportCount += 1;
      }

      if (latestReportAt === null || row.effectiveAt > latestReportAt) {
        latestReportAt = row.effectiveAt;
      }
    }

    return researchReportDashboardSummarySchema.parse({
      workspaceId: query.workspaceId,
      totalReportCount: rows.length,
      statusCounts,
      warningReportCount,
      pendingMemoryProposalReportCount,
      latestReportAt,
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

  private async getSourceCount(reportId: ResearchReportId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(researchSources)
      .where(eq(researchSources.reportId, reportId));

    return row?.total ?? 0;
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

function buildReportHistoryFilters(input: ListResearchReportHistoryInput): SQL[] {
  const filters: SQL[] = [reportWorkspaceFilter(input.workspaceId)];

  if (input.status) {
    filters.push(eq(researchReports.status, input.status));
  }

  if (input.dateFrom) {
    filters.push(gte(effectiveReportTimestampSql(), `${input.dateFrom}T00:00:00.000Z`));
  }

  if (input.dateTo) {
    filters.push(lte(effectiveReportTimestampSql(), `${input.dateTo}T23:59:59.999Z`));
  }

  if (input.question) {
    filters.push(
      sql`lower(${researchReports.question}) like ${`%${escapeSqliteLike(
        input.question.toLowerCase(),
      )}%`} escape '\\'`,
    );
  }

  if (input.hasWarnings === true) {
    filters.push(ne(researchReports.warningsJson, "[]"));
  } else if (input.hasWarnings === false) {
    filters.push(eq(researchReports.warningsJson, "[]"));
  }

  if (input.hasPendingMemoryProposal === true) {
    filters.push(pendingMemoryProposalExistsSql());
  } else if (input.hasPendingMemoryProposal === false) {
    filters.push(sql`not ${pendingMemoryProposalExistsSql()}`);
  }

  return filters;
}

function reportWorkspaceFilter(workspaceId: WorkspaceId | null): SQL {
  return workspaceId === null
    ? isNull(researchReports.workspaceId)
    : eq(researchReports.workspaceId, workspaceId);
}

function buildHistoryOrderBy(sort: ResearchReportHistorySort): SQL[] {
  const effectiveAt = effectiveReportTimestampSql();

  if (sort === "oldest_completed_or_updated_first") {
    return [asc(effectiveAt), asc(researchReports.id)];
  }

  return [desc(effectiveAt), desc(researchReports.id)];
}

function effectiveReportTimestampSql(): SQL<string> {
  return sql<string>`coalesce(${researchReports.completedAt}, ${researchReports.updatedAt}, ${researchReports.createdAt})`;
}

function pendingMemoryProposalCountSql(): SQL<number> {
  return sql<number>`(
    select count(*)
    from ${semanticMemory}
    where ${semanticMemory.sourceExecutionId} = ${researchReports.executionId}
      and ${semanticMemory.status} = 'proposed'
      and (
        ${semanticMemory.workspaceId} = ${researchReports.workspaceId}
        or (${semanticMemory.workspaceId} is null and ${researchReports.workspaceId} is null)
      )
  )`;
}

function pendingMemoryProposalExistsSql(): SQL {
  return sql`exists (
    select 1
    from ${semanticMemory}
    where ${semanticMemory.sourceExecutionId} = ${researchReports.executionId}
      and ${semanticMemory.status} = 'proposed'
      and (
        ${semanticMemory.workspaceId} = ${researchReports.workspaceId}
        or (${semanticMemory.workspaceId} is null and ${researchReports.workspaceId} is null)
      )
  )`;
}

function toResearchReportHistoryItem(row: {
  id: ResearchReportId;
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
  question: string;
  status: ResearchReportStatus;
  warningsJson: string;
  sourceCount: unknown;
  pendingMemoryProposalCount: unknown;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  effectiveAt: string;
}): ResearchReportHistoryItem {
  return {
    id: row.id,
    executionId: row.executionId,
    workspaceId: row.workspaceId,
    question: row.question,
    status: row.status,
    sourceCount: Number(row.sourceCount),
    warningCount: countWarningsJson(row.warningsJson),
    pendingMemoryProposalCount: Number(row.pendingMemoryProposalCount),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    effectiveAt: row.effectiveAt,
  };
}

function countWarningsJson(value: string): number {
  const warnings = parseJson(value);
  return Array.isArray(warnings) ? warnings.length : 0;
}

function escapeSqliteLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
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
