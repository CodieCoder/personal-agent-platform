import {
  researchReportSchema,
  researchSelectedSourceSchema,
  type ResearchReport,
  type ResearchSelectedSource,
} from "@pap/contracts";
import type { ResearchReportRow, ResearchSourceRow } from "../schema/index.js";

export function toResearchSelectedSource(row: ResearchSourceRow): ResearchSelectedSource {
  return researchSelectedSourceSchema.parse({
    id: row.id,
    reportId: row.reportId,
    executionId: row.executionId,
    workspaceId: row.workspaceId,
    evidenceId: row.evidenceId,
    url: row.url,
    finalUrl: row.finalUrl,
    title: row.title,
    publishedAt: row.publishedAt,
    selectionRank: row.selectionRank,
    relevanceScore: row.relevanceScore,
    analysis: row.analysisJson === null ? null : parseJson(row.analysisJson),
    citationIds: parseJson(row.citationIdsJson),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toResearchReport(
  row: ResearchReportRow,
  sources: ResearchSelectedSource[],
): ResearchReport {
  return researchReportSchema.parse({
    id: row.id,
    executionId: row.executionId,
    workspaceId: row.workspaceId,
    question: row.question,
    summary: parseJson(row.summaryJson),
    findings: parseJson(row.findingsJson),
    sources,
    citations: parseJson(row.citationsJson),
    limitations: parseJson(row.limitationsJson),
    warnings: parseJson(row.warningsJson),
    status: row.status,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  });
}

export function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
