import type {
  CreateSemanticMemoryRequest,
  ResearchReport,
  ResearchRequest,
  SemanticMemoryRecord,
} from "@pap/contracts";

export type ResearchMemoryProposalEligibility =
  | {
      eligible: true;
      reason: "eligible";
    }
  | {
      eligible: false;
      reason:
        | "disabled"
        | "report_not_successful"
        | "no_cited_findings"
        | "confidence_too_low"
        | "active_memory_exists";
    };

export type BuildResearchMemoryProposalInput = {
  request: ResearchRequest;
  report: ResearchReport;
  activeSemanticMemory?: readonly SemanticMemoryRecord[];
  confidenceThreshold?: number;
};

export function evaluateResearchMemoryProposalEligibility(
  input: BuildResearchMemoryProposalInput,
): ResearchMemoryProposalEligibility {
  if (input.request.memoryProposalMode !== "propose") {
    return { eligible: false, reason: "disabled" };
  }

  if (input.report.status !== "completed" && input.report.status !== "completed_with_warnings") {
    return { eligible: false, reason: "report_not_successful" };
  }

  const citedFindings = input.report.findings.filter((finding) => finding.citationIds.length > 0);

  if (citedFindings.length === 0) {
    return { eligible: false, reason: "no_cited_findings" };
  }

  const bestConfidence = Math.max(...citedFindings.map((finding) => finding.confidence));
  const threshold = input.confidenceThreshold ?? 0.7;

  if (bestConfidence < threshold) {
    return { eligible: false, reason: "confidence_too_low" };
  }

  if ((input.activeSemanticMemory ?? []).some((memory) => memory.status === "active")) {
    return { eligible: false, reason: "active_memory_exists" };
  }

  return { eligible: true, reason: "eligible" };
}

export function buildResearchSemanticMemoryProposals(
  input: BuildResearchMemoryProposalInput,
): CreateSemanticMemoryRequest[] {
  const eligibility = evaluateResearchMemoryProposalEligibility(input);

  if (!eligibility.eligible) {
    return [];
  }

  const finding = [...input.report.findings]
    .filter((candidate) => candidate.citationIds.length > 0)
    .sort((left, right) => right.confidence - left.confidence)[0];

  if (!finding) {
    return [];
  }

  const citations = finding.citationIds
    .map((citationId) =>
      input.report.citations.find((citation) => citation.citationId === citationId),
    )
    .filter((citation) => citation !== undefined);

  if (citations.length === 0) {
    return [];
  }

  return [
    {
      scope: input.report.workspaceId ? "workspace" : "personal",
      ...(input.report.workspaceId ? { workspaceId: input.report.workspaceId } : {}),
      capabilityId: "capability.research",
      subject: `Research: ${truncateForSubject(input.request.question)}`,
      predicate: "research_suggests",
      value: {
        reportId: input.report.id,
        findingId: finding.id,
        claim: finding.claimText,
        citationIds: finding.citationIds,
      },
      sourceType: "research_report",
      sourceRef: input.report.id,
      sourceExecutionId: input.report.executionId,
      sourceCapabilityId: "capability.research",
      evidenceRefs: citations.map((citation) => ({
        reportId: input.report.id,
        citationId: citation.citationId,
        sourceId: citation.sourceId,
        evidenceId: citation.evidenceId,
      })),
      createdBy: "capability.research",
      confidence: finding.confidence,
      sensitivity: "low",
    },
  ];
}

function truncateForSubject(value: string): string {
  return value.length <= 210 ? value : `${value.slice(0, 207).trim()}...`;
}
