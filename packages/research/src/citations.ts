import {
  researchReportSchema,
  type ResearchCitation,
  type ResearchCitationId,
  type ResearchReport,
  type ResearchSelectedSource,
} from "@pap/contracts";

export function validateResearchReportCitations(reportInput: ResearchReport): ResearchReport {
  const report = researchReportSchema.parse(reportInput);
  const sourceById = new Map(report.sources.map((source) => [source.id, source]));

  for (const citation of report.citations) {
    const source = sourceById.get(citation.sourceId);

    if (!source?.analysis) {
      throw new ResearchCitationValidationError(
        "research_citation_source_not_analyzed",
        `Citation '${citation.citationId}' does not reference an analyzed source.`,
      );
    }

    const sourceClaim = source.analysis.claims.find(
      (claim) => claim.claimText === citation.claimText,
    );

    if (!sourceClaim) {
      throw new ResearchCitationValidationError(
        "research_citation_claim_unsupported",
        `Citation '${citation.citationId}' claim is not supported by source analysis.`,
      );
    }
  }

  for (const finding of report.findings) {
    if (finding.kind !== "uncertainty" && finding.citationIds.length === 0) {
      throw new ResearchCitationValidationError(
        "research_finding_uncited",
        `Finding '${finding.id}' is substantive but has no citation.`,
      );
    }
  }

  return report;
}

export function findUnsupportedFindingCitationIds(input: {
  findings: ResearchReport["findings"];
  citations: readonly ResearchCitation[];
  sources: readonly ResearchSelectedSource[];
}): ResearchCitationId[] {
  const citationById = new Map(input.citations.map((citation) => [citation.citationId, citation]));
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const unsupported = new Set<ResearchCitationId>();

  for (const finding of input.findings) {
    for (const citationId of finding.citationIds) {
      const citation = citationById.get(citationId);
      const source = citation ? sourceById.get(citation.sourceId) : null;
      const claimSupported = source?.analysis?.claims.some(
        (claim) => citation !== undefined && claim.claimText === citation.claimText,
      );

      if (!citation || !source || !claimSupported) {
        unsupported.add(citationId);
      }
    }
  }

  return [...unsupported];
}

export class ResearchCitationValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResearchCitationValidationError";
  }
}
