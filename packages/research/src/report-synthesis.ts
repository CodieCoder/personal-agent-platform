import {
  researchCitationSchema,
  researchFindingSchema,
  researchLimitationSchema,
  researchReportSchema,
  researchReportSummarySchema,
  researchWarningSchema,
  type ResearchCitation,
  type ResearchFinding,
  type ResearchLimitation,
  type ResearchReport,
  type ResearchReportId,
  type ResearchReportStatus,
  type ResearchSelectedSource,
  type ResearchWarning,
  type WorkspaceId,
  type ExecutionId,
} from "@pap/contracts";
import { stableResearchId } from "./ids.js";
import { validateResearchReportCitations } from "./citations.js";

export type SynthesizeResearchReportInput = {
  reportId: ResearchReportId;
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
  question: string;
  sources: readonly ResearchSelectedSource[];
  warnings?: readonly ResearchWarning[];
  completedAt: string;
};

export function synthesizeResearchReport(input: SynthesizeResearchReportInput): ResearchReport {
  const analyzedSources = input.sources.filter(
    (source) => source.status === "analyzed" && source.analysis !== null && source.evidenceId,
  );
  const warnings = [...(input.warnings ?? [])];
  const citations: ResearchCitation[] = [];
  const findings: ResearchFinding[] = [];
  const limitations: ResearchLimitation[] = [
    researchLimitationSchema.parse({
      code: "coverage_note",
      message: `Coverage is limited to ${input.sources.length} selected source(s) and ${analyzedSources.length} analyzed source(s).`,
    }),
  ];

  for (const source of analyzedSources) {
    if (!source.analysis || !source.evidenceId || !source.title) {
      continue;
    }

    const analysis = source.analysis;

    analysis.claims.slice(0, 2).forEach((claim, index) => {
      const citation = researchCitationSchema.parse({
        citationId: stableResearchId("research_citation", {
          reportId: input.reportId,
          sourceId: source.id,
          claimId: claim.claimId,
        }),
        sourceId: source.id,
        sourceTitle: source.title,
        sourceUrl: source.finalUrl ?? source.url,
        evidenceId: source.evidenceId,
        claimText: claim.claimText,
        sourceExcerpt: claim.sourceExcerpt,
      });
      citations.push(citation);
      findings.push(
        researchFindingSchema.parse({
          id: stableResearchId("research_finding", {
            reportId: input.reportId,
            sourceId: source.id,
            claimId: claim.claimId,
          }),
          title: titleFromClaim(claim.claimText, index),
          claimText: claim.claimText,
          citationIds: [citation.citationId],
          confidence: Math.min(analysis.confidence, claim.confidence),
          kind: "sourced_fact",
        }),
      );
    });

    for (const caveat of analysis.caveats) {
      limitations.push(
        researchLimitationSchema.parse({
          code: "source_caveat",
          message: caveat,
          sourceId: source.id,
          evidenceId: source.evidenceId,
        }),
      );
    }
  }

  const failedSourceCount = input.sources.filter((source) =>
    ["fetch_failed", "extraction_failed", "analysis_failed"].includes(source.status),
  ).length;

  if (failedSourceCount > 0) {
    warnings.push(
      researchWarningSchema.parse({
        code: "partial_source_failure",
        message: "Some selected sources could not be fetched, extracted, or analyzed.",
        details: { failedSourceCount },
      }),
    );
  }

  const status = resolveReportStatus({ findingCount: findings.length, warnings });
  const summary = researchReportSummarySchema.parse({
    text:
      findings.length > 0
        ? `Research found ${findings.length} cited finding(s) across ${analyzedSources.length} analyzed source(s).`
        : "Research could not produce source-backed findings from the selected sources.",
    keyPoints: findings.slice(0, 5).map((finding) => finding.claimText),
  });
  const report = researchReportSchema.parse({
    id: input.reportId,
    executionId: input.executionId,
    workspaceId: input.workspaceId,
    question: input.question,
    summary,
    findings,
    sources: input.sources,
    citations,
    limitations: limitations.slice(0, 50),
    warnings: warnings.slice(0, 50),
    status,
    createdAt: input.completedAt,
    completedAt: input.completedAt,
  });

  return findings.length > 0 ? validateResearchReportCitations(report) : report;
}

export function buildFailedResearchReport(input: {
  reportId: ResearchReportId;
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
  question: string;
  sources?: readonly ResearchSelectedSource[];
  warnings?: readonly ResearchWarning[];
  limitations?: readonly ResearchLimitation[];
  completedAt: string;
  message: string;
}): ResearchReport {
  return researchReportSchema.parse({
    id: input.reportId,
    executionId: input.executionId,
    workspaceId: input.workspaceId,
    question: input.question,
    summary: {
      text: input.message,
      keyPoints: [],
    },
    findings: [],
    sources: input.sources ?? [],
    citations: [],
    limitations: input.limitations ?? [
      {
        code: "no_source_backed_report",
        message: "No source-backed report could be completed for this request.",
      },
    ],
    warnings: input.warnings ?? [],
    status: "failed",
    createdAt: input.completedAt,
    completedAt: input.completedAt,
  });
}

function resolveReportStatus(input: {
  findingCount: number;
  warnings: readonly ResearchWarning[];
}): ResearchReportStatus {
  if (input.findingCount === 0) {
    return "failed";
  }

  return input.warnings.length > 0 ? "completed_with_warnings" : "completed";
}

function titleFromClaim(claimText: string, index: number): string {
  const firstSentence = claimText.split(/[.!?]/u)[0]?.trim() ?? "";
  const title = firstSentence || `Finding ${index + 1}`;

  return title.length > 120 ? `${title.slice(0, 117).trim()}...` : title;
}
