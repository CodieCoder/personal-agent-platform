import {
  researchRequestSchema,
  researchSourceSelectionSchema,
  researchWarningSchema,
  type NormalizedResearchCandidateSource,
  type ResearchCandidatePool,
  type ResearchRequestInput,
  type ResearchSelectedCandidateSource,
  type ResearchSourceId,
  type ResearchSourceSelection,
  type ResearchSourceSelectionExclusion,
  type ResearchSourceSelectionReason,
} from "@pap/contracts";

export type SelectResearchSourcesInput = {
  request: ResearchRequestInput;
  candidatePool: ResearchCandidatePool;
  failedSourceIds?: readonly ResearchSourceId[];
  maxSources?: number | null;
};

const DEFAULT_MAX_SOURCES = 5;
const MAX_EXTRACTION_BUDGET = 15;

export function selectResearchSources(input: SelectResearchSourcesInput): ResearchSourceSelection {
  const request = researchRequestSchema.parse(input.request);
  const requestedSourceCount = Math.min(
    Math.max(Math.trunc(input.maxSources ?? request.maxSources ?? DEFAULT_MAX_SOURCES), 1),
    MAX_EXTRACTION_BUDGET,
  );
  const failedSourceIds = new Set(input.failedSourceIds ?? []);
  const candidateOrder = [...input.candidatePool.candidates].sort(
    (left, right) => left.candidateRank - right.candidateRank,
  );
  const exclusions: ResearchSourceSelectionExclusion[] = [];
  const eligibleCandidates: NormalizedResearchCandidateSource[] = [];
  const seenCanonicalUrls = new Set<string>();

  for (const candidate of candidateOrder) {
    if (failedSourceIds.has(candidate.sourceId)) {
      exclusions.push(sourceSelectionExclusion(candidate, "extraction_failed"));
      continue;
    }

    if (seenCanonicalUrls.has(candidate.canonicalUrl)) {
      exclusions.push(sourceSelectionExclusion(candidate, "duplicate_canonical_url"));
      continue;
    }

    seenCanonicalUrls.add(candidate.canonicalUrl);
    eligibleCandidates.push(candidate);
  }

  const extractionBudget = Math.min(
    requestedSourceCount,
    eligibleCandidates.length,
    MAX_EXTRACTION_BUDGET,
  );
  const warnings =
    extractionBudget === 0
      ? [
          researchWarningSchema.parse({
            code: "no_sources_selected",
            message: "No research candidates were available for source selection.",
            details: {
              candidateCount: input.candidatePool.candidates.length,
              failedSourceCount: failedSourceIds.size,
            },
          }),
        ]
      : [];
  const domainBuckets = buildDomainBuckets(eligibleCandidates);
  const diversityTarget = Math.min(
    extractionBudget,
    domainBuckets.size,
    Math.ceil(extractionBudget * 0.6),
  );
  const selectedByCanonicalUrl = new Set<string>();
  const selectedReasons = new Map<string, ResearchSourceSelectionReason>();

  for (const bucket of domainBuckets.values()) {
    if (selectedByCanonicalUrl.size >= diversityTarget) {
      break;
    }

    const representative = chooseDomainRepresentative(bucket, request.timeRange !== null);
    selectedByCanonicalUrl.add(representative.canonicalUrl);
    selectedReasons.set(representative.sourceId, "domain_diversity");
  }

  for (const candidate of eligibleCandidates) {
    if (selectedByCanonicalUrl.size >= extractionBudget) {
      break;
    }

    if (selectedByCanonicalUrl.has(candidate.canonicalUrl)) {
      continue;
    }

    selectedByCanonicalUrl.add(candidate.canonicalUrl);
    selectedReasons.set(candidate.sourceId, "budget_fill");
  }

  const selectedCandidates = eligibleCandidates
    .filter((candidate) => selectedByCanonicalUrl.has(candidate.canonicalUrl))
    .sort((left, right) => left.candidateRank - right.candidateRank);
  const selected: ResearchSelectedCandidateSource[] = selectedCandidates.map((candidate, index) =>
    selectedCandidate(
      candidate,
      index + 1,
      selectedReasons.get(candidate.sourceId) ?? "budget_fill",
    ),
  );
  const selectedDomains = new Set(selected.map((source) => source.normalizedHostname));

  for (const candidate of eligibleCandidates) {
    if (selectedByCanonicalUrl.has(candidate.canonicalUrl)) {
      continue;
    }

    exclusions.push(
      sourceSelectionExclusion(
        candidate,
        selectedDomains.has(candidate.normalizedHostname)
          ? "domain_diversity_deferred"
          : "budget_exhausted",
      ),
    );
  }

  return researchSourceSelectionSchema.parse({
    queryPlanId: input.candidatePool.queryPlanId,
    requestedSourceCount,
    extractionBudget,
    selected,
    exclusions: exclusions.slice(0, 50),
    warnings,
  });
}

function buildDomainBuckets(
  candidates: readonly NormalizedResearchCandidateSource[],
): Map<string, NormalizedResearchCandidateSource[]> {
  const buckets = new Map<string, NormalizedResearchCandidateSource[]>();

  for (const candidate of candidates) {
    const bucket = buckets.get(candidate.normalizedHostname) ?? [];
    bucket.push(candidate);
    buckets.set(candidate.normalizedHostname, bucket);
  }

  return buckets;
}

function chooseDomainRepresentative(
  candidates: readonly NormalizedResearchCandidateSource[],
  preferRecency: boolean,
): NormalizedResearchCandidateSource {
  const first = candidates[0];

  if (!first) {
    throw new Error("Cannot choose a domain representative from an empty bucket.");
  }

  if (!preferRecency) {
    return first;
  }

  return candidates.reduce((best, candidate) => {
    const bestTimestamp = parseTimestamp(best.publishedAt);
    const candidateTimestamp = parseTimestamp(candidate.publishedAt);

    if (candidateTimestamp === null) {
      return best;
    }

    if (bestTimestamp === null || candidateTimestamp > bestTimestamp) {
      return candidate;
    }

    if (candidateTimestamp === bestTimestamp && candidate.candidateRank < best.candidateRank) {
      return candidate;
    }

    return best;
  }, first);
}

function selectedCandidate(
  candidate: NormalizedResearchCandidateSource,
  selectionRank: number,
  reason: ResearchSourceSelectionReason,
): ResearchSelectedCandidateSource {
  const primaryProvenance = candidate.provenance[0];

  if (!primaryProvenance) {
    throw new Error(`Research candidate is missing provenance: ${candidate.sourceId}`);
  }

  return {
    sourceId: candidate.sourceId,
    candidateRank: candidate.candidateRank,
    selectionRank,
    canonicalUrl: candidate.canonicalUrl,
    normalizedHostname: candidate.normalizedHostname,
    url: candidate.url,
    title: candidate.title,
    publishedAt: candidate.publishedAt,
    queryId: primaryProvenance.queryId,
    searchEvidenceId: primaryProvenance.searchEvidenceId,
    firstSeenResultIndex: candidate.firstSeenResultIndex,
    reason,
    warnings: candidate.warnings,
  };
}

function sourceSelectionExclusion(
  candidate: NormalizedResearchCandidateSource,
  reason: ResearchSourceSelectionExclusion["reason"],
): ResearchSourceSelectionExclusion {
  return {
    sourceId: candidate.sourceId,
    candidateRank: candidate.candidateRank,
    canonicalUrl: candidate.canonicalUrl,
    normalizedHostname: candidate.normalizedHostname,
    reason,
  };
}

function parseTimestamp(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}
