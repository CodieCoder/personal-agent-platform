import { z } from "zod";
import { isoDateTimeSchema, stableIdentifierSchema } from "./common.js";

type SearchUrl = {
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  toString(): string;
};

type SearchUrlConstructor = {
  new (value: string): SearchUrl;
};

const UrlConstructor = (globalThis as unknown as { URL: SearchUrlConstructor }).URL;

export const searchProviderIdSchema = stableIdentifierSchema;

export const searchProviderKindSchema = z.enum(["searxng"]);

export const searchProviderHealthStatusSchema = z.enum([
  "healthy",
  "degraded",
  "unavailable",
  "disabled",
  "unknown",
]);

export const searchProviderErrorKindSchema = z.enum([
  "search_provider_duplicate",
  "search_provider_not_found",
  "search_provider_disabled",
  "search_provider_unavailable",
  "search_provider_timeout",
  "search_provider_http_error",
  "search_provider_invalid_response",
  "search_provider_misconfigured",
]);

export const searchQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => value.length > 0, {
    message: "Search query must include non-whitespace content.",
  });

export const searchPageSchema = z.number().int().min(1).max(100);

export const searchPageSizeSchema = z.number().int().min(1).max(50);

export const searchLanguageSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9_-]+$/iu, {
    message: "Search language must use letters, numbers, underscores, or dashes.",
  });

export const searchSafeSearchSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const searchCategorySchema = z.string().trim().min(1).max(80);

export const searchTimeRangeSchema = z.enum(["day", "month", "year"]);

export const searchWarningCodeSchema = z.enum([
  "search_result_omitted",
  "search_result_truncated",
  "search_provider_warning",
]);

export const httpOrHttpsSearchUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .transform((value, context) => {
    let url: SearchUrl;

    try {
      url = new UrlConstructor(value);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Search result URL must be absolute.",
      });
      return z.NEVER;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "Search result URL must use HTTP or HTTPS.",
      });
      return z.NEVER;
    }

    if (url.username !== "" || url.password !== "") {
      context.addIssue({
        code: "custom",
        message: "Search result URL must not include credentials.",
      });
      return z.NEVER;
    }

    return url.toString();
  });

export const searchWarningSchema = z
  .object({
    code: searchWarningCodeSchema,
    message: z.string().trim().min(1).max(1_000),
    count: z.number().int().nonnegative().max(10_000).optional(),
  })
  .strict();

export const searchSafetyMetadataSchema = z
  .object({
    safesearch: searchSafeSearchSchema.nullable(),
    language: searchLanguageSchema.nullable(),
    categories: z.array(searchCategorySchema).max(8).nullable(),
    timeRange: searchTimeRangeSchema.nullable(),
    resultCount: z.number().int().nonnegative().max(50),
    omittedResultCount: z.number().int().nonnegative().max(10_000).default(0),
    normalizedUrlCount: z.number().int().nonnegative().max(50),
  })
  .strict();

export const searchProviderMetadataSchema = z
  .record(z.string().min(1).max(80), z.unknown())
  .refine((metadata) => Object.keys(metadata).length <= 25, {
    message: "Search provider metadata may include at most 25 keys.",
  });

export const searchResultSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    url: httpOrHttpsSearchUrlSchema,
    displayUrl: z.string().trim().min(1).max(500).nullable(),
    snippet: z.string().trim().max(5_000).nullable(),
    publishedAt: isoDateTimeSchema.nullable(),
    engine: z.string().trim().min(1).max(120).nullable(),
    category: z.string().trim().min(1).max(80).nullable(),
    score: z.number().nonnegative().nullable(),
  })
  .strict();

export const searchRequestSchema = z
  .object({
    query: searchQuerySchema,
    page: searchPageSchema.nullable().default(null),
    pageSize: searchPageSizeSchema.default(10),
    language: searchLanguageSchema.nullable().default(null),
    safesearch: searchSafeSearchSchema.nullable().default(null),
    categories: z.array(searchCategorySchema).max(8).nullable().default(null),
    timeRange: searchTimeRangeSchema.nullable().default(null),
    providerId: searchProviderIdSchema.nullable().default(null),
  })
  .strict();

export const searchResponseSchema = z
  .object({
    providerId: searchProviderIdSchema,
    query: searchQuerySchema,
    page: searchPageSchema,
    pageSize: searchPageSizeSchema,
    results: z.array(searchResultSchema).max(50),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema,
    durationMs: z.number().int().nonnegative().max(86_400_000),
    safety: searchSafetyMetadataSchema,
    warnings: z.array(searchWarningSchema).max(25).default([]),
  })
  .strict()
  .refine((response) => Date.parse(response.startedAt) <= Date.parse(response.completedAt), {
    message: "Search completion cannot precede start.",
    path: ["completedAt"],
  })
  .refine((response) => response.results.length <= response.pageSize, {
    message: "Search response cannot include more results than requested page size.",
    path: ["results"],
  });

export const searchProviderHealthSchema = z
  .object({
    providerId: searchProviderIdSchema,
    kind: searchProviderKindSchema,
    status: searchProviderHealthStatusSchema,
    checkedAt: isoDateTimeSchema,
    message: z.string().trim().min(1).max(1_000).optional(),
    metadata: searchProviderMetadataSchema.optional(),
  })
  .strict();

export const searchProviderErrorSchema = z
  .object({
    kind: searchProviderErrorKindSchema,
    providerId: searchProviderIdSchema.optional(),
    message: z.string().trim().min(1).max(1_000),
    retryable: z.boolean().default(false),
    details: searchProviderMetadataSchema.optional(),
  })
  .strict();

export type SearchProviderId = z.infer<typeof searchProviderIdSchema>;
export type SearchProviderKind = z.infer<typeof searchProviderKindSchema>;
export type SearchProviderHealthStatus = z.infer<typeof searchProviderHealthStatusSchema>;
export type SearchProviderErrorKind = z.infer<typeof searchProviderErrorKindSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchPage = z.infer<typeof searchPageSchema>;
export type SearchPageSize = z.infer<typeof searchPageSizeSchema>;
export type SearchLanguage = z.infer<typeof searchLanguageSchema>;
export type SearchSafeSearch = z.infer<typeof searchSafeSearchSchema>;
export type SearchCategory = z.infer<typeof searchCategorySchema>;
export type SearchTimeRange = z.infer<typeof searchTimeRangeSchema>;
export type SearchWarningCode = z.infer<typeof searchWarningCodeSchema>;
export type SearchWarning = z.infer<typeof searchWarningSchema>;
export type SearchSafetyMetadata = z.infer<typeof searchSafetyMetadataSchema>;
export type SearchProviderMetadata = z.infer<typeof searchProviderMetadataSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchRequestInput = z.input<typeof searchRequestSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type SearchProviderHealth = z.infer<typeof searchProviderHealthSchema>;
export type SearchProviderError = z.infer<typeof searchProviderErrorSchema>;
