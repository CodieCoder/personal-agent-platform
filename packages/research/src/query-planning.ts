import {
  researchQueryPlanSchema,
  researchRequestSchema,
  researchWarningSchema,
  searchRequestSchema,
  type ResearchMode,
  type ResearchQueryPlan,
  type ResearchQueryPlanReason,
  type ResearchRequest,
  type ResearchRequestInput,
  type ResearchTimeRange,
  type ResearchWarning,
  type SearchProviderId,
  type SearchRequest,
  type SearchSafeSearch,
  type SearchTimeRange,
} from "@pap/contracts";
import { ResearchPreparationError } from "./errors.js";
import { stableResearchId } from "./ids.js";

export const DEFAULT_RESEARCH_PLAN_CREATED_AT = "1970-01-01T00:00:00.000Z";
export const DEFAULT_RESEARCH_MAX_QUERY_COUNT = 4;
export const DEFAULT_RESEARCH_MAX_SEARCH_RESULTS = 20;

export type PlanResearchQueriesOptions = {
  createdAt?: Date | string;
  clock?: () => Date;
  maxQueryCount?: number;
  mode?: ResearchMode;
};

export type PlannedSearchRequest = {
  queryId: string;
  request: SearchRequest;
};

export type BuildSearchRequestsOptions = {
  providerId?: SearchProviderId | null;
  safesearch?: SearchSafeSearch | null;
};

type QueryVariant = {
  text: string;
  reason: ResearchQueryPlanReason;
  focus: string | null;
  timeRange: ResearchTimeRange | null;
};

export function planResearchQueries(
  requestInput: ResearchRequestInput,
  options: PlanResearchQueriesOptions = {},
): ResearchQueryPlan {
  const request = researchRequestSchema.parse(requestInput);
  const normalizedQuestion = normalizeResearchText(request.question);

  if (normalizedQuestion.length === 0) {
    throw new ResearchPreparationError(
      "research_question_empty_after_normalization",
      "Research question must include searchable content after normalization.",
    );
  }

  const normalizedFocus = request.focus ? normalizeResearchText(request.focus) : null;
  const variants = buildQueryVariants(request, normalizedQuestion, normalizedFocus);
  const maxQueryCount = clampInteger(
    options.maxQueryCount ?? DEFAULT_RESEARCH_MAX_QUERY_COUNT,
    1,
    8,
  );
  const queryWarnings: ResearchWarning[] = [];
  const seenQueries = new Set<string>();
  const queries = [];
  const requestFingerprint = {
    question: normalizedQuestion,
    focus: normalizedFocus,
    timeRange: request.timeRange,
    language: request.language,
    categories: request.categories,
    maxSources: request.maxSources ?? 5,
    maxSearchResults: request.maxSearchResults ?? DEFAULT_RESEARCH_MAX_SEARCH_RESULTS,
  };

  for (const variant of variants) {
    if (queries.length >= maxQueryCount) {
      break;
    }

    const normalizedQuery = normalizeSearchQuery(variant.text);
    const dedupeKey = normalizedQuery.query.toLowerCase();

    if (seenQueries.has(dedupeKey)) {
      continue;
    }

    seenQueries.add(dedupeKey);

    if (normalizedQuery.warning) {
      queryWarnings.push(normalizedQuery.warning);
    }

    queries.push({
      queryId: stableResearchId("research_query", {
        ...requestFingerprint,
        reason: variant.reason,
        query: normalizedQuery.query,
        position: queries.length,
      }),
      query: normalizedQuery.query,
      focus: variant.focus,
      timeRange: variant.timeRange,
      reason: variant.reason,
      language: request.language,
      categories: request.categories,
      warnings: normalizedQuery.warning ? [normalizedQuery.warning] : [],
    });
  }

  if (queries.length === 0) {
    throw new ResearchPreparationError(
      "research_query_plan_empty",
      "Research query planning produced no searchable queries.",
    );
  }

  return researchQueryPlanSchema.parse({
    id: stableResearchId("research_plan", requestFingerprint),
    question: normalizedQuestion,
    mode: options.mode ?? "standard",
    queries,
    warnings: queryWarnings.slice(0, 25),
    createdAt: normalizeCreatedAt(options),
  });
}

export function buildSearchRequests(
  planInput: ResearchQueryPlan,
  requestInput: ResearchRequestInput,
  options: BuildSearchRequestsOptions = {},
): PlannedSearchRequest[] {
  const plan = researchQueryPlanSchema.parse(planInput);
  const request = researchRequestSchema.parse(requestInput);
  const totalResultBudget = request.maxSearchResults ?? DEFAULT_RESEARCH_MAX_SEARCH_RESULTS;
  const pageSizes = allocateSearchResultBudget(totalResultBudget, plan.queries.length);

  return plan.queries.flatMap((query, index) => {
    const pageSize = pageSizes[index] ?? 0;

    if (pageSize <= 0) {
      return [];
    }

    return [
      {
        queryId: query.queryId,
        request: searchRequestSchema.parse({
          query: query.query,
          page: null,
          pageSize,
          language: query.language,
          safesearch: options.safesearch ?? null,
          categories: query.categories,
          timeRange: mapSearchTimeRange(query.timeRange),
          providerId: options.providerId ?? null,
        }),
      },
    ];
  });
}

export function normalizeResearchText(value: string): string {
  return replaceAsciiControlCharacters(value.normalize("NFKC"))
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/([,.;:!?])(?=\S)/gu, "$1 ")
    .trim();
}

function replaceAsciiControlCharacters(value: string): string {
  let normalized = "";

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    normalized +=
      codePoint !== undefined && (codePoint <= 31 || codePoint === 127) ? " " : character;
  }

  return normalized;
}

function buildQueryVariants(
  request: ResearchRequest,
  normalizedQuestion: string,
  normalizedFocus: string | null,
): QueryVariant[] {
  const timePhrase = timeRangeToQueryPhrase(request.timeRange);
  const variants: QueryVariant[] = [
    {
      text: normalizedQuestion,
      reason: "primary",
      focus: null,
      timeRange: request.timeRange,
    },
  ];

  if (normalizedFocus) {
    variants.push({
      text: `${normalizedQuestion} ${normalizedFocus}`,
      reason: "focus_variant",
      focus: normalizedFocus,
      timeRange: request.timeRange,
    });
  }

  if (timePhrase) {
    variants.push({
      text: `${normalizedQuestion} ${timePhrase}`,
      reason: "time_range_variant",
      focus: null,
      timeRange: request.timeRange,
    });
  }

  if (normalizedFocus && timePhrase) {
    variants.push({
      text: `${normalizedQuestion} ${normalizedFocus} ${timePhrase}`,
      reason: "focus_time_range_variant",
      focus: normalizedFocus,
      timeRange: request.timeRange,
    });
  }

  return variants;
}

function normalizeSearchQuery(value: string): { query: string; warning: ResearchWarning | null } {
  const normalized = normalizeResearchText(value);

  if (normalized.length <= 500) {
    return { query: normalized, warning: null };
  }

  const hardTruncated = normalized.slice(0, 500);
  const wordBoundary = hardTruncated.lastIndexOf(" ");
  const query =
    wordBoundary >= 250 ? hardTruncated.slice(0, wordBoundary).trim() : hardTruncated.trim();

  return {
    query,
    warning: researchWarningSchema.parse({
      code: "query_truncated",
      message: "Research query was truncated to the search provider limit.",
      details: {
        originalLength: normalized.length,
        maxLength: 500,
      },
    }),
  };
}

function normalizeCreatedAt(options: PlanResearchQueriesOptions): string {
  if (options.createdAt instanceof Date) {
    return options.createdAt.toISOString();
  }

  if (typeof options.createdAt === "string") {
    return options.createdAt;
  }

  if (options.clock) {
    return options.clock().toISOString();
  }

  return DEFAULT_RESEARCH_PLAN_CREATED_AT;
}

function timeRangeToQueryPhrase(timeRange: ResearchTimeRange | null): string | null {
  switch (timeRange) {
    case "day":
      return "today";
    case "week":
      return "this week";
    case "month":
      return "this month";
    case "year":
      return "this year";
    case "all":
    case null:
      return null;
  }
}

function mapSearchTimeRange(timeRange: ResearchTimeRange | null): SearchTimeRange | null {
  switch (timeRange) {
    case "day":
    case "month":
    case "year":
      return timeRange;
    case "week":
    case "all":
    case null:
      return null;
  }
}

function allocateSearchResultBudget(totalResultBudget: number, queryCount: number): number[] {
  const basePageSize = Math.floor(totalResultBudget / queryCount);
  const remainder = totalResultBudget % queryCount;

  return Array.from(
    { length: queryCount },
    (_, index) => basePageSize + (index < remainder ? 1 : 0),
  );
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}
