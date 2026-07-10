import { researchSourceFeedbackSchema, type ResearchSourceFeedback } from "@pap/contracts";
import { createId, nowIso } from "@pap/shared";
import type {
  CreateResearchSourceFeedbackInput,
  DeleteResearchSourceFeedbackInput,
  GetResearchSourceFeedbackBySourceInput,
  ListResearchSourceFeedbackByReportInput,
  ResearchSourceFeedbackRepository,
  UpdateResearchSourceFeedbackInput,
} from "@pap/storage";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  researchSourceFeedback,
  researchSources,
  type ResearchSourceFeedbackRow,
} from "../schema/index.js";
import type * as sqliteSchema from "../schema/index.js";

export class SqliteResearchSourceFeedbackRepository implements ResearchSourceFeedbackRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof sqliteSchema>) {}

  async create(input: CreateResearchSourceFeedbackInput): Promise<ResearchSourceFeedback> {
    await this.assertSourceExists(input.sourceId, input.workspaceId);

    const timestamp = nowIso();
    const feedback = researchSourceFeedbackSchema.parse({
      id: createId("rsf"),
      workspaceId: input.workspaceId,
      reportId: input.reportId,
      sourceId: input.sourceId,
      rating: input.rating,
      helpful: input.helpful,
      reason: input.reason,
      notes: input.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await this.db.insert(researchSourceFeedback).values({
      id: feedback.id,
      workspaceId: feedback.workspaceId,
      reportId: feedback.reportId,
      sourceId: feedback.sourceId,
      rating: feedback.rating,
      helpful: feedback.helpful ? 1 : 0,
      reason: feedback.reason,
      notes: feedback.notes,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
    });

    const created = await this.getBySourceId({
      sourceId: feedback.sourceId,
      workspaceId: feedback.workspaceId,
    });
    return requireSourceFeedback(created, feedback.sourceId);
  }

  async getBySourceId(
    input: GetResearchSourceFeedbackBySourceInput,
  ): Promise<ResearchSourceFeedback | null> {
    const [row] = await this.db
      .select()
      .from(researchSourceFeedback)
      .where(
        and(
          eq(researchSourceFeedback.sourceId, input.sourceId),
          feedbackWorkspaceFilter(input.workspaceId),
        ),
      )
      .limit(1);

    return row ? toResearchSourceFeedback(row) : null;
  }

  async listByReport(
    input: ListResearchSourceFeedbackByReportInput,
  ): Promise<ResearchSourceFeedback[]> {
    const rows = await this.db
      .select()
      .from(researchSourceFeedback)
      .where(
        and(
          eq(researchSourceFeedback.reportId, input.reportId),
          feedbackWorkspaceFilter(input.workspaceId),
        ),
      )
      .orderBy(researchSourceFeedback.createdAt, researchSourceFeedback.id);

    return rows.map(toResearchSourceFeedback);
  }

  async update(input: UpdateResearchSourceFeedbackInput): Promise<ResearchSourceFeedback> {
    const existing = await this.getBySourceId({
      sourceId: input.sourceId,
      workspaceId: input.workspaceId,
    });

    if (!existing) {
      throw new Error(`Research source feedback not found: ${input.sourceId}`);
    }

    const updatedAt = nowIso();
    const setValues: Record<string, unknown> = { updatedAt };

    if (input.rating !== undefined) {
      setValues.rating = input.rating;
    }

    if (input.helpful !== undefined) {
      setValues.helpful = input.helpful ? 1 : 0;
    }

    if (input.reason !== undefined) {
      setValues.reason = input.reason;
    }

    if (input.notes !== undefined) {
      setValues.notes = input.notes;
    }

    await this.db
      .update(researchSourceFeedback)
      .set(setValues)
      .where(
        and(
          eq(researchSourceFeedback.sourceId, input.sourceId),
          feedbackWorkspaceFilter(input.workspaceId),
        ),
      );

    const updated = await this.getBySourceId({
      sourceId: input.sourceId,
      workspaceId: input.workspaceId,
    });
    return requireSourceFeedback(updated, input.sourceId);
  }

  async delete(input: DeleteResearchSourceFeedbackInput): Promise<void> {
    const existing = await this.getBySourceId({
      sourceId: input.sourceId,
      workspaceId: input.workspaceId,
    });

    if (!existing) {
      throw new Error(`Research source feedback not found: ${input.sourceId}`);
    }

    await this.db
      .delete(researchSourceFeedback)
      .where(
        and(
          eq(researchSourceFeedback.sourceId, input.sourceId),
          feedbackWorkspaceFilter(input.workspaceId),
        ),
      );
  }

  private async assertSourceExists(sourceId: string, workspaceId: string | null): Promise<void> {
    const [row] = await this.db
      .select({
        id: researchSources.id,
        workspaceId: researchSources.workspaceId,
      })
      .from(researchSources)
      .where(eq(researchSources.id, sourceId))
      .limit(1);

    if (!row) {
      throw new Error(`Research source not found for feedback: ${sourceId}`);
    }

    if ((row.workspaceId ?? null) !== workspaceId) {
      throw new Error(`Research source feedback workspace mismatch: ${sourceId}`);
    }
  }
}

function feedbackWorkspaceFilter(workspaceId: string | null): SQL {
  return workspaceId === null
    ? isNull(researchSourceFeedback.workspaceId)
    : eq(researchSourceFeedback.workspaceId, workspaceId);
}

function toResearchSourceFeedback(row: ResearchSourceFeedbackRow): ResearchSourceFeedback {
  return researchSourceFeedbackSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId ?? null,
    reportId: row.reportId,
    sourceId: row.sourceId,
    rating: row.rating,
    helpful: row.helpful === 1,
    reason: row.reason ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function requireSourceFeedback(
  feedback: ResearchSourceFeedback | null,
  sourceId: string,
): ResearchSourceFeedback {
  if (!feedback) {
    throw new Error(`Research source feedback was not found after write: ${sourceId}`);
  }

  return feedback;
}
