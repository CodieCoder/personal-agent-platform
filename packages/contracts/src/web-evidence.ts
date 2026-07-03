import { z } from "zod";
import {
  executionIdSchema,
  isoDateTimeSchema,
  opaqueIdentifierSchema,
  workspaceIdSchema,
} from "./common.js";
import {
  extractionBylineSchema,
  extractionExcerptSchema,
  extractionMethodSchema,
  extractionSiteNameSchema,
  extractionTitleSchema,
  extractionWarningSchema,
  extractionWordCountSchema,
} from "./extraction.js";
import {
  searchProviderIdSchema,
  searchQuerySchema,
  searchRequestSchema,
  searchResultSchema,
  searchWarningSchema,
} from "./search.js";
import {
  fetchContentLengthSchema,
  fetchRedirectSchema,
  fetchStatusCodeSchema,
  fetchUrlSchema,
  fetchWarningSchema,
} from "./web.js";

export const webEvidenceIdSchema = opaqueIdentifierSchema;

export const webEvidenceStatusSchema = z.enum(["completed", "failed"]);

export const webEvidenceFailureCategorySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9_]*$/u, {
    message: "Web evidence failure categories must use lower snake case.",
  });

export const webEvidenceFailureMessageSchema = z.string().trim().min(1).max(1_000);

export const webEvidenceDurationMsSchema = z.number().int().nonnegative().max(86_400_000);

export const webEvidenceContentTypeSchema = z.string().trim().min(1).max(200);

export const webEvidenceContentBytesSchema = z.number().int().nonnegative().max(50_000_000);

export const webEvidenceSha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, {
  message: "Expected a lowercase SHA-256 hex digest.",
});

export const webEvidenceContentSnapshotSchema = z.string().trim().min(1).max(20_000);

export const webSelectedUrlSourceSchema = z.enum(["search_result", "explicit_test_allowlist"]);

const nullableWorkspaceIdSchema = workspaceIdSchema.nullable();

const nullableFailureFieldsSchema = {
  failureCategory: webEvidenceFailureCategorySchema.nullable(),
  failureMessage: webEvidenceFailureMessageSchema.nullable(),
};

const timingFieldsSchema = {
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema,
  durationMs: webEvidenceDurationMsSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
};

export const webSearchEvidenceSchema = z
  .object({
    id: webEvidenceIdSchema,
    executionId: executionIdSchema,
    workspaceId: nullableWorkspaceIdSchema,
    providerId: searchProviderIdSchema,
    query: searchQuerySchema,
    request: searchRequestSchema,
    status: webEvidenceStatusSchema,
    resultCount: z.number().int().nonnegative().max(50),
    results: z.array(searchResultSchema).max(50),
    warnings: z.array(searchWarningSchema).max(25).default([]),
    ...nullableFailureFieldsSchema,
    ...timingFieldsSchema,
  })
  .strict()
  .refine((evidence) => evidence.resultCount === evidence.results.length, {
    message: "Search evidence result count must match normalized results.",
    path: ["resultCount"],
  })
  .refine((evidence) => Date.parse(evidence.startedAt) <= Date.parse(evidence.completedAt), {
    message: "Search evidence completion cannot precede start.",
    path: ["completedAt"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.failureCategory === null, {
    message: "Completed search evidence must not include a failure category.",
    path: ["failureCategory"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.failureMessage === null, {
    message: "Completed search evidence must not include a failure message.",
    path: ["failureMessage"],
  })
  .refine((evidence) => evidence.status === "completed" || evidence.failureCategory !== null, {
    message: "Failed search evidence must include a failure category.",
    path: ["failureCategory"],
  })
  .refine((evidence) => evidence.status === "completed" || evidence.failureMessage !== null, {
    message: "Failed search evidence must include a failure message.",
    path: ["failureMessage"],
  });

export const webFetchEvidenceSchema = z
  .object({
    id: webEvidenceIdSchema,
    executionId: executionIdSchema,
    workspaceId: nullableWorkspaceIdSchema,
    searchEvidenceId: webEvidenceIdSchema.nullable(),
    selectedUrlSource: webSelectedUrlSourceSchema,
    selectedResultIndex: z.number().int().nonnegative().max(49).nullable(),
    requestedUrl: fetchUrlSchema,
    finalUrl: fetchUrlSchema.nullable(),
    status: webEvidenceStatusSchema,
    statusCode: fetchStatusCodeSchema.nullable(),
    contentType: webEvidenceContentTypeSchema.nullable(),
    contentLength: fetchContentLengthSchema,
    contentBytes: webEvidenceContentBytesSchema.nullable(),
    bodySha256: webEvidenceSha256Schema.nullable(),
    redirects: z.array(fetchRedirectSchema).max(10),
    warnings: z.array(fetchWarningSchema).max(25).default([]),
    ...nullableFailureFieldsSchema,
    ...timingFieldsSchema,
  })
  .strict()
  .refine((evidence) => Date.parse(evidence.startedAt) <= Date.parse(evidence.completedAt), {
    message: "Fetch evidence completion cannot precede start.",
    path: ["completedAt"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.finalUrl !== null, {
    message: "Completed fetch evidence must include the final URL.",
    path: ["finalUrl"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.bodySha256 !== null, {
    message: "Completed fetch evidence must include a body hash.",
    path: ["bodySha256"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.failureCategory === null, {
    message: "Completed fetch evidence must not include a failure category.",
    path: ["failureCategory"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.failureMessage === null, {
    message: "Completed fetch evidence must not include a failure message.",
    path: ["failureMessage"],
  })
  .refine((evidence) => evidence.status === "completed" || evidence.failureCategory !== null, {
    message: "Failed fetch evidence must include a failure category.",
    path: ["failureCategory"],
  })
  .refine((evidence) => evidence.status === "completed" || evidence.failureMessage !== null, {
    message: "Failed fetch evidence must include a failure message.",
    path: ["failureMessage"],
  });

export const webExtractionEvidenceSchema = z
  .object({
    id: webEvidenceIdSchema,
    executionId: executionIdSchema,
    workspaceId: nullableWorkspaceIdSchema,
    fetchEvidenceId: webEvidenceIdSchema.nullable(),
    finalUrl: fetchUrlSchema,
    status: webEvidenceStatusSchema,
    extractionMethod: extractionMethodSchema.nullable(),
    sourceProfileId: opaqueIdentifierSchema.nullable(),
    title: extractionTitleSchema.nullable(),
    byline: extractionBylineSchema.nullable(),
    siteName: extractionSiteNameSchema.nullable(),
    publishedAt: isoDateTimeSchema.nullable(),
    canonicalUrl: fetchUrlSchema.nullable(),
    excerpt: extractionExcerptSchema.nullable(),
    wordCount: extractionWordCountSchema.nullable(),
    contentTextSnapshot: webEvidenceContentSnapshotSchema.nullable(),
    contentTextSha256: webEvidenceSha256Schema.nullable(),
    contentChars: z.number().int().nonnegative().max(200_000).nullable(),
    originalContentChars: z.number().int().nonnegative().max(50_000_000).nullable(),
    warnings: z.array(extractionWarningSchema).max(50).default([]),
    ...nullableFailureFieldsSchema,
    ...timingFieldsSchema,
  })
  .strict()
  .refine((evidence) => Date.parse(evidence.startedAt) <= Date.parse(evidence.completedAt), {
    message: "Extraction evidence completion cannot precede start.",
    path: ["completedAt"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.extractionMethod !== null, {
    message: "Completed extraction evidence must include an extraction method.",
    path: ["extractionMethod"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.contentTextSha256 !== null, {
    message: "Completed extraction evidence must include a content hash.",
    path: ["contentTextSha256"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.contentTextSnapshot !== null, {
    message: "Completed extraction evidence must include a bounded content snapshot.",
    path: ["contentTextSnapshot"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.failureCategory === null, {
    message: "Completed extraction evidence must not include a failure category.",
    path: ["failureCategory"],
  })
  .refine((evidence) => evidence.status === "failed" || evidence.failureMessage === null, {
    message: "Completed extraction evidence must not include a failure message.",
    path: ["failureMessage"],
  })
  .refine((evidence) => evidence.status === "completed" || evidence.failureCategory !== null, {
    message: "Failed extraction evidence must include a failure category.",
    path: ["failureCategory"],
  })
  .refine((evidence) => evidence.status === "completed" || evidence.failureMessage !== null, {
    message: "Failed extraction evidence must include a failure message.",
    path: ["failureMessage"],
  });

export const webEvidenceBundleSchema = z
  .object({
    searches: z.array(webSearchEvidenceSchema),
    fetches: z.array(webFetchEvidenceSchema),
    extractions: z.array(webExtractionEvidenceSchema),
  })
  .strict();

export const persistWebEvidenceResultSchema = z
  .object({
    searchEvidenceId: webEvidenceIdSchema.optional(),
    fetchEvidenceId: webEvidenceIdSchema.optional(),
    extractionEvidenceId: webEvidenceIdSchema.optional(),
    evidenceCount: z.number().int().nonnegative().max(3),
  })
  .strict();

export type WebEvidenceId = z.infer<typeof webEvidenceIdSchema>;
export type WebEvidenceStatus = z.infer<typeof webEvidenceStatusSchema>;
export type WebEvidenceFailureCategory = z.infer<typeof webEvidenceFailureCategorySchema>;
export type WebSelectedUrlSource = z.infer<typeof webSelectedUrlSourceSchema>;
export type WebSearchEvidence = z.infer<typeof webSearchEvidenceSchema>;
export type WebFetchEvidence = z.infer<typeof webFetchEvidenceSchema>;
export type WebExtractionEvidence = z.infer<typeof webExtractionEvidenceSchema>;
export type WebEvidenceBundle = z.infer<typeof webEvidenceBundleSchema>;
export type PersistWebEvidenceResult = z.infer<typeof persistWebEvidenceResultSchema>;
