import {
  normalizedResearchCandidateSourceSchema,
  researchCandidatePoolSchema,
  researchWarningSchema,
  searchProviderIdSchema,
  webEvidenceIdSchema,
  webSearchEvidenceSchema,
  type JsonValue,
  type NormalizedResearchCandidateSource,
  type ResearchCandidateDeduplication,
  type ResearchCandidatePool,
  type ResearchCandidatePoolExclusion,
  type ResearchCandidatePoolExclusionReason,
  type ResearchCandidateProvenance,
  type ResearchQueryId,
  type ResearchQueryPlan,
  type ResearchWarning,
  type SearchProviderId,
  type SearchResponse,
  type SearchWarning,
  type WebEvidenceId,
  type WebEvidenceStatus,
  type WebSearchEvidence,
} from "@pap/contracts";
import { fingerprintValue, stableResearchId } from "./ids.js";
import { normalizeResearchText } from "./query-planning.js";
import { safeCanonicalizeResearchUrl } from "./url.js";

export type NormalizeResearchCandidatesInput = {
  queryPlan: ResearchQueryPlan;
  searches: readonly ResearchCandidateSearchInput[];
  maxCandidates?: number | null;
};

export type ResearchCandidateSearchInput = {
  queryId: ResearchQueryId;
  searchEvidenceId?: WebEvidenceId | null;
  providerId?: SearchProviderId | null;
  results?: readonly unknown[];
  response?: SearchResponse;
  evidence?: WebSearchEvidence;
  warnings?: readonly SearchWarning[];
  status?: WebEvidenceStatus;
  failureCategory?: string | null;
  failureMessage?: string | null;
};

type ResolvedSearchInput = {
  queryId: ResearchQueryId;
  searchEvidenceId: WebEvidenceId | null;
  providerId: SearchProviderId | null;
  results: readonly unknown[];
  warnings: readonly SearchWarning[];
  status: WebEvidenceStatus;
  failureCategory: string | null;
  failureMessage: string | null;
};

type SearchResultFields = {
  title: string;
  url: string;
  displayUrl: string | null;
  snippet: string | null;
  publishedAt: string | null;
  engine: string | null;
  category: string | null;
  score: number | null;
};

const DEFAULT_MAX_CANDIDATES = 50;

export function normalizeResearchCandidates(
  input: NormalizeResearchCandidatesInput,
): ResearchCandidatePool {
  const queryPlan = input.queryPlan;
  const maxCandidates = clampCandidateLimit(input.maxCandidates ?? DEFAULT_MAX_CANDIDATES);
  const queriesById = new Map(
    queryPlan.queries.map((query, index) => [query.queryId, { query, index }]),
  );
  const searchesByQueryId = groupSearchesByQuery(input.searches.map(resolveSearchInput));
  const candidates: NormalizedResearchCandidateSource[] = [];
  const candidatesByCanonicalUrl = new Map<string, NormalizedResearchCandidateSource>();
  const deduplications: ResearchCandidateDeduplication[] = [];
  const exclusions: ResearchCandidatePoolExclusion[] = [];
  const warnings: ResearchWarning[] = [];
  let poolTruncationWarningAdded = false;

  for (const query of queryPlan.queries) {
    const queryContext = queriesById.get(query.queryId);

    if (!queryContext) {
      continue;
    }

    for (const search of searchesByQueryId.get(query.queryId) ?? []) {
      appendSearchWarnings(search.warnings, warnings);

      if (search.status === "failed") {
        exclusions.push(
          candidatePoolExclusion({
            queryId: query.queryId,
            searchEvidenceId: search.searchEvidenceId,
            searchResultIndex: null,
            reason: "search_evidence_failed",
            details: {
              failureCategory: search.failureCategory,
              failureMessage: search.failureMessage,
            },
          }),
        );
        warnings.push(
          researchWarningSchema.parse({
            code: "search_evidence_failed",
            message: "Search evidence failed and was omitted from candidate normalization.",
            details: {
              queryId: query.queryId,
              searchEvidenceId: search.searchEvidenceId,
            },
          }),
        );
        continue;
      }

      search.results.forEach((result, searchResultIndex) => {
        if (searchResultIndex > 49) {
          return;
        }

        const fields = normalizeSearchResultFields(result);

        if (!fields.title) {
          exclusions.push(
            candidatePoolExclusion({
              queryId: query.queryId,
              searchEvidenceId: search.searchEvidenceId,
              searchResultIndex,
              reason: "candidate_title_missing",
              details: { urlFingerprint: fingerprintValue(getUnknownField(result, "url") ?? "") },
            }),
          );
          warnings.push(
            researchWarningSchema.parse({
              code: "candidate_title_missing",
              message: "Search result was omitted because its title was empty after cleanup.",
              details: { queryId: query.queryId, searchResultIndex },
            }),
          );
          return;
        }

        const canonicalized = safeCanonicalizeResearchUrl(fields.url);

        if (!canonicalized) {
          exclusions.push(
            candidatePoolExclusion({
              queryId: query.queryId,
              searchEvidenceId: search.searchEvidenceId,
              searchResultIndex,
              reason: "candidate_url_invalid",
              details: { urlFingerprint: fingerprintValue(fields.url) },
            }),
          );
          warnings.push(
            researchWarningSchema.parse({
              code: "candidate_url_invalid",
              message: "Search result was omitted because its URL was invalid.",
              details: { queryId: query.queryId, searchResultIndex },
            }),
          );
          return;
        }

        const provenance: ResearchCandidateProvenance = {
          queryId: query.queryId,
          query: query.query,
          searchEvidenceId: search.searchEvidenceId,
          searchResultIndex,
          providerId: search.providerId,
          engine: fields.engine,
          category: fields.category,
          score: fields.score,
          role: "primary",
        };
        const existingCandidate = candidatesByCanonicalUrl.get(canonicalized.canonicalUrl);

        if (existingCandidate) {
          const duplicateProvenance = { ...provenance, role: "duplicate" as const };
          existingCandidate.provenance.push(duplicateProvenance);
          existingCandidate.duplicateCount += 1;
          deduplications.push({
            sourceId: existingCandidate.sourceId,
            canonicalUrl: canonicalized.canonicalUrl,
            duplicateQueryId: query.queryId,
            duplicateSearchEvidenceId: search.searchEvidenceId,
            duplicateSearchResultIndex: searchResultIndex,
            reason: "duplicate_canonical_url",
          });
          return;
        }

        if (candidates.length >= maxCandidates) {
          exclusions.push(
            candidatePoolExclusion({
              queryId: query.queryId,
              searchEvidenceId: search.searchEvidenceId,
              searchResultIndex,
              canonicalUrl: canonicalized.canonicalUrl,
              reason: "candidate_pool_truncated",
              details: { maxCandidates },
            }),
          );

          if (!poolTruncationWarningAdded) {
            warnings.push(
              researchWarningSchema.parse({
                code: "candidate_pool_truncated",
                message: "Research candidate pool was truncated to the configured limit.",
                details: { maxCandidates },
              }),
            );
            poolTruncationWarningAdded = true;
          }

          return;
        }

        const candidate = normalizedResearchCandidateSourceSchema.parse({
          sourceId: stableResearchId("research_source", canonicalized.canonicalUrl),
          candidateRank: candidates.length + 1,
          canonicalUrl: canonicalized.canonicalUrl,
          normalizedHostname: canonicalized.normalizedHostname,
          url: canonicalized.normalizedUrl,
          title: fields.title,
          displayUrl: fields.displayUrl,
          snippet: fields.snippet,
          publishedAt: fields.publishedAt,
          firstSeenQueryIndex: queryContext.index,
          firstSeenResultIndex: searchResultIndex,
          providerId: search.providerId,
          engine: fields.engine,
          category: fields.category,
          providerScore: fields.score,
          provenance: [provenance],
          duplicateCount: 0,
          warnings: [],
        });

        candidates.push(candidate);
        candidatesByCanonicalUrl.set(candidate.canonicalUrl, candidate);
      });
    }
  }

  return researchCandidatePoolSchema.parse({
    queryPlanId: queryPlan.id,
    candidates,
    deduplications,
    exclusions: exclusions.slice(0, 50),
    warnings: warnings.slice(0, 50),
  });
}

function groupSearchesByQuery(
  searches: readonly ResolvedSearchInput[],
): Map<ResearchQueryId, ResolvedSearchInput[]> {
  const grouped = new Map<ResearchQueryId, ResolvedSearchInput[]>();

  for (const search of searches) {
    const existing = grouped.get(search.queryId) ?? [];
    existing.push(search);
    grouped.set(search.queryId, existing);
  }

  return grouped;
}

function resolveSearchInput(input: ResearchCandidateSearchInput): ResolvedSearchInput {
  if (input.evidence) {
    const evidence = webSearchEvidenceSchema.parse(input.evidence);
    return {
      queryId: input.queryId,
      searchEvidenceId: evidence.id,
      providerId: evidence.providerId,
      results: evidence.results,
      warnings: evidence.warnings,
      status: evidence.status,
      failureCategory: evidence.failureCategory,
      failureMessage: evidence.failureMessage,
    };
  }

  if (input.response) {
    return {
      queryId: input.queryId,
      searchEvidenceId: input.searchEvidenceId ?? null,
      providerId: input.response.providerId,
      results: input.response.results,
      warnings: input.response.warnings,
      status: "completed",
      failureCategory: null,
      failureMessage: null,
    };
  }

  return {
    queryId: input.queryId,
    searchEvidenceId: parseNullableWebEvidenceId(input.searchEvidenceId ?? null),
    providerId: parseNullableProviderId(input.providerId ?? null),
    results: input.results ?? [],
    warnings: input.warnings ?? [],
    status: input.status ?? "completed",
    failureCategory: input.failureCategory ?? null,
    failureMessage: input.failureMessage ?? null,
  };
}

function normalizeSearchResultFields(result: unknown): SearchResultFields {
  const title = normalizeNullableText(getUnknownField(result, "title"), 500);
  const url =
    typeof getUnknownField(result, "url") === "string"
      ? String(getUnknownField(result, "url"))
      : "";

  return {
    title: title ?? "",
    url,
    displayUrl: normalizeNullableText(getUnknownField(result, "displayUrl"), 500),
    snippet: normalizeNullableText(getUnknownField(result, "snippet"), 5_000),
    publishedAt: normalizeIsoDateTime(getUnknownField(result, "publishedAt")),
    engine: normalizeNullableText(getUnknownField(result, "engine"), 120),
    category: normalizeNullableText(getUnknownField(result, "category"), 80),
    score: normalizeScore(getUnknownField(result, "score")),
  };
}

function normalizeNullableText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeResearchText(value);

  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

function normalizeIsoDateTime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function normalizeScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function getUnknownField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function candidatePoolExclusion(input: {
  queryId: ResearchQueryId;
  searchEvidenceId: WebEvidenceId | null;
  searchResultIndex: number | null;
  canonicalUrl?: string;
  reason: ResearchCandidatePoolExclusionReason;
  details?: Record<string, JsonValue>;
}): ResearchCandidatePoolExclusion {
  return {
    queryId: input.queryId,
    searchEvidenceId: input.searchEvidenceId,
    searchResultIndex: input.searchResultIndex,
    urlFingerprint:
      typeof input.details?.urlFingerprint === "string" ? input.details.urlFingerprint : null,
    canonicalUrl: input.canonicalUrl ?? null,
    reason: input.reason,
    ...(input.details ? { details: input.details } : {}),
  };
}

function appendSearchWarnings(
  searchWarnings: readonly SearchWarning[],
  researchWarnings: ResearchWarning[],
): void {
  for (const warning of searchWarnings) {
    researchWarnings.push(
      researchWarningSchema.parse({
        code: "search_provider_warning",
        message: warning.message,
        details: {
          code: warning.code,
          count: warning.count ?? 0,
        },
      }),
    );
  }
}

function parseNullableProviderId(providerId: SearchProviderId | null): SearchProviderId | null {
  if (providerId === null) {
    return null;
  }

  return searchProviderIdSchema.parse(providerId);
}

function parseNullableWebEvidenceId(evidenceId: WebEvidenceId | null): WebEvidenceId | null {
  if (evidenceId === null) {
    return null;
  }

  return webEvidenceIdSchema.parse(evidenceId);
}

function clampCandidateLimit(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), DEFAULT_MAX_CANDIDATES);
}
