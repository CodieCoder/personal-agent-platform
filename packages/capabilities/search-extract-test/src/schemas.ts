import {
  extractionMethodSchema,
  extractionWarningSchema,
  fetchUrlSchema,
  searchQuerySchema,
  searchResultSchema,
  webEvidenceIdSchema,
  workspaceIdSchema,
  z,
} from "@pap/contracts";

export const searchExtractTestInputSchema = z
  .object({
    query: searchQuerySchema,
    selectedUrl: fetchUrlSchema.nullable().optional(),
    workspaceId: workspaceIdSchema.nullable().optional(),
  })
  .strict();

export const searchExtractTestWarningSchema = z
  .object({
    code: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(1_000),
    count: z.number().int().nonnegative().max(10_000).optional(),
  })
  .strict();

export const searchExtractTestDocumentSchema = z
  .object({
    finalUrl: fetchUrlSchema,
    title: z.string().trim().min(1).max(500).nullable(),
    byline: z.string().trim().min(1).max(500).nullable(),
    siteName: z.string().trim().min(1).max(250).nullable(),
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    canonicalUrl: fetchUrlSchema.nullable(),
    excerpt: z.string().trim().min(1).max(2_000).nullable(),
    contentTextSnapshot: z.string().trim().min(1).max(20_000),
    wordCount: z.number().int().nonnegative().max(50_000),
    method: extractionMethodSchema,
    sourceProfileId: z.string().min(3).max(200).nullable(),
    warnings: z.array(extractionWarningSchema).max(50),
  })
  .strict();

export const searchExtractTestOutputSchema = z
  .object({
    query: searchQuerySchema,
    results: z.array(searchResultSchema).max(50),
    selectedResult: z
      .object({
        index: z.number().int().nonnegative().max(49),
        result: searchResultSchema,
      })
      .strict()
      .nullable(),
    document: searchExtractTestDocumentSchema.nullable(),
    evidence: z
      .object({
        searchEvidenceId: webEvidenceIdSchema,
        fetchEvidenceId: webEvidenceIdSchema.optional(),
        extractionEvidenceId: webEvidenceIdSchema.optional(),
      })
      .strict(),
    warnings: z.array(searchExtractTestWarningSchema).max(100),
  })
  .strict();

export type SearchExtractTestInput = z.infer<typeof searchExtractTestInputSchema>;
export type SearchExtractTestWarning = z.infer<typeof searchExtractTestWarningSchema>;
export type SearchExtractTestDocument = z.infer<typeof searchExtractTestDocumentSchema>;
export type SearchExtractTestOutput = z.infer<typeof searchExtractTestOutputSchema>;
