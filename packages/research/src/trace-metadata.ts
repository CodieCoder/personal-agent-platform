import {
  traceStepMetadataSchema,
  type ResearchCandidatePool,
  type ResearchQueryPlan,
  type ResearchSourceSelection,
  type TraceStepMetadata,
} from "@pap/contracts";
import { fingerprintValue } from "./ids.js";

export function buildQueryPlanTraceMetadata(plan: ResearchQueryPlan): TraceStepMetadata {
  return traceStepMetadataSchema.parse({
    queryPlanId: plan.id,
    queryCount: plan.queries.length,
    queryIds: plan.queries.map((query) => query.queryId),
    queryReasons: plan.queries.map((query) => query.reason),
    queryFingerprints: plan.queries.map((query) => fingerprintValue(query.query)),
    warningCount: plan.warnings.length,
    warningCodes: plan.warnings.map((warning) => warning.code),
    createdAt: plan.createdAt,
  });
}

export function buildCandidatePoolTraceMetadata(pool: ResearchCandidatePool): TraceStepMetadata {
  return traceStepMetadataSchema.parse({
    queryPlanId: pool.queryPlanId,
    candidateCount: pool.candidates.length,
    sourceIds: pool.candidates.map((candidate) => candidate.sourceId),
    canonicalUrlFingerprints: pool.candidates.map((candidate) =>
      fingerprintValue(candidate.canonicalUrl),
    ),
    domains: pool.candidates.map((candidate) => candidate.normalizedHostname),
    deduplicationCount: pool.deduplications.length,
    exclusionCount: pool.exclusions.length,
    exclusionReasons: pool.exclusions.map((exclusion) => exclusion.reason),
    warningCount: pool.warnings.length,
    warningCodes: pool.warnings.map((warning) => warning.code),
  });
}

export function buildSourceSelectionTraceMetadata(
  selection: ResearchSourceSelection,
): TraceStepMetadata {
  return traceStepMetadataSchema.parse({
    queryPlanId: selection.queryPlanId,
    requestedSourceCount: selection.requestedSourceCount,
    extractionBudget: selection.extractionBudget,
    selectedCount: selection.selected.length,
    selectedSourceIds: selection.selected.map((source) => source.sourceId),
    selectedCanonicalUrlFingerprints: selection.selected.map((source) =>
      fingerprintValue(source.canonicalUrl),
    ),
    selectedDomains: selection.selected.map((source) => source.normalizedHostname),
    selectionReasons: selection.selected.map((source) => source.reason),
    exclusionCount: selection.exclusions.length,
    exclusionReasons: selection.exclusions.map((exclusion) => exclusion.reason),
    warningCount: selection.warnings.length,
  });
}
