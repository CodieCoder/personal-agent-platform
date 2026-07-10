import { researchReportFeedbackSchema, type ResearchReportFeedback } from "@pap/contracts";
import { nowIso } from "@pap/shared";
import type {
  GetResearchReportFeedbackInput,
  ResearchReportFeedbackRepository,
  UpsertResearchReportFeedbackInput,
} from "@pap/storage";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  researchReportFeedback,
  researchReports,
  type ResearchReportFeedbackRow,
} from "../schema/index.js";
import type * as sqliteSchema from "../schema/index.js";

export class SqliteResearchReportFeedbackRepository implements ResearchReportFeedbackRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof sqliteSchema>) {}

  async upsert(input: UpsertResearchReportFeedbackInput): Promise<ResearchReportFeedback> {
    await this.assertReportExists(input.reportId, input.workspaceId);

    const existing = await this.getByReportId({
      reportId: input.reportId,
      workspaceId: input.workspaceId,
    });
    const timestamp = nowIso();

    const feedback = researchReportFeedbackSchema.parse({
      reportId: input.reportId,
      workspaceId: input.workspaceId,
      rating: input.rating,
      useful: input.useful,
      reason: input.reason,
      notes: input.notes,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });

    await this.db
      .insert(researchReportFeedback)
      .values({
        reportId: feedback.reportId,
        workspaceId: feedback.workspaceId,
        rating: feedback.rating,
        useful: feedback.useful ? 1 : 0,
        reason: feedback.reason,
        notes: feedback.notes,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
      })
      .onConflictDoUpdate({
        target: researchReportFeedback.reportId,
        set: {
          workspaceId: feedback.workspaceId,
          rating: feedback.rating,
          useful: feedback.useful ? 1 : 0,
          reason: feedback.reason,
          notes: feedback.notes,
          updatedAt: feedback.updatedAt,
        },
      });

    const created = await this.getByReportId({
      reportId: feedback.reportId,
      workspaceId: feedback.workspaceId,
    });
    return requireReportFeedback(created, feedback.reportId);
  }

  async getByReportId(
    input: GetResearchReportFeedbackInput,
  ): Promise<ResearchReportFeedback | null> {
    const [row] = await this.db
      .select()
      .from(researchReportFeedback)
      .where(
        and(
          eq(researchReportFeedback.reportId, input.reportId),
          reportFeedbackWorkspaceFilter(input.workspaceId),
        ),
      )
      .limit(1);

    return row ? toResearchReportFeedback(row) : null;
  }

  private async assertReportExists(reportId: string, workspaceId: string | null): Promise<void> {
    const [row] = await this.db
      .select({
        id: researchReports.id,
        workspaceId: researchReports.workspaceId,
      })
      .from(researchReports)
      .where(eq(researchReports.id, reportId))
      .limit(1);

    if (!row) {
      throw new Error(`Research report not found for feedback: ${reportId}`);
    }

    if ((row.workspaceId ?? null) !== workspaceId) {
      throw new Error(`Research report feedback workspace mismatch: ${reportId}`);
    }
  }
}

function reportFeedbackWorkspaceFilter(workspaceId: string | null): SQL {
  return workspaceId === null
    ? isNull(researchReportFeedback.workspaceId)
    : eq(researchReportFeedback.workspaceId, workspaceId);
}

function toResearchReportFeedback(row: ResearchReportFeedbackRow): ResearchReportFeedback {
  return researchReportFeedbackSchema.parse({
    reportId: row.reportId,
    workspaceId: row.workspaceId ?? null,
    rating: row.rating,
    useful: row.useful === 1,
    reason: row.reason ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function requireReportFeedback(
  feedback: ResearchReportFeedback | null,
  reportId: string,
): ResearchReportFeedback {
  if (!feedback) {
    throw new Error(`Research report feedback was not found after upsert: ${reportId}`);
  }

  return feedback;
}
