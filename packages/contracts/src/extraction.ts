import { z } from "zod";
import { isoDateTimeSchema, opaqueIdentifierSchema } from "./common.js";
import { fetchAcceptedContentTypeSchema, fetchUrlSchema } from "./web.js";

export const extractionMethodSchema = z.enum(["source_profile", "readability", "plain_text"]);

export const extractionWarningCodeSchema = z.enum([
  "extraction_content_truncated",
  "extraction_html_sanitized",
  "extraction_low_quality",
  "extraction_metadata_missing",
  "extraction_profile_not_found",
  "extraction_profile_invalid",
  "extraction_selector_invalid",
  "extraction_selector_no_match",
  "extraction_selector_partial",
  "extraction_readability_failed",
  "extraction_plain_text_fallback",
]);

export const extractionErrorKindSchema = z.enum([
  "extraction_input_invalid",
  "extraction_empty_content",
  "extraction_content_too_short",
  "extraction_readability_failed",
  "extraction_plain_text_unavailable",
  "extraction_invalid_output",
]);

export const extractionContentTextSchema = z.string().trim().min(1).max(200_000);

export const extractionContentHtmlSchema = z.string().trim().min(1).max(250_000);

export const extractionTitleSchema = z.string().trim().min(1).max(500);

export const extractionBylineSchema = z.string().trim().min(1).max(500);

export const extractionSiteNameSchema = z.string().trim().min(1).max(250);

export const extractionLanguageSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9_-]+$/iu, {
    message: "Extraction language must use letters, numbers, underscores, or dashes.",
  });

export const extractionExcerptSchema = z.string().trim().min(1).max(2_000);

export const extractionWordCountSchema = z.number().int().nonnegative().max(50_000);

export const extractionMaxContentCharsSchema = z.number().int().min(1_000).max(200_000);

export const extractionMinWordCountSchema = z.number().int().min(1).max(1_000);

export const extractionWarningSchema = z
  .object({
    code: extractionWarningCodeSchema,
    method: extractionMethodSchema.optional(),
    message: z.string().trim().min(1).max(1_000),
    selector: z.string().trim().min(1).max(500).optional(),
    count: z.number().int().nonnegative().max(10_000).optional(),
  })
  .strict();

export const extractionMetadataSchema = z
  .object({
    requestedUrl: fetchUrlSchema.nullable(),
    finalUrl: fetchUrlSchema,
    sourceProfileId: opaqueIdentifierSchema.nullable(),
    contentType: fetchAcceptedContentTypeSchema.nullable(),
    contentChars: z.number().int().nonnegative().max(200_000),
    originalContentChars: z.number().int().nonnegative().max(50_000_000),
    maxContentChars: extractionMaxContentCharsSchema,
    extractedAt: isoDateTimeSchema,
  })
  .strict();

export const extractedDocumentSchema = z
  .object({
    title: extractionTitleSchema.nullable(),
    byline: extractionBylineSchema.nullable(),
    siteName: extractionSiteNameSchema.nullable(),
    publishedAt: isoDateTimeSchema.nullable(),
    language: extractionLanguageSchema.nullable(),
    canonicalUrl: fetchUrlSchema.nullable(),
    excerpt: extractionExcerptSchema.nullable(),
    contentText: extractionContentTextSchema,
    contentHtml: extractionContentHtmlSchema.nullable(),
    wordCount: extractionWordCountSchema,
    method: extractionMethodSchema,
    warnings: z.array(extractionWarningSchema).max(50).default([]),
    metadata: extractionMetadataSchema,
  })
  .strict()
  .refine((document) => document.wordCount === countWords(document.contentText), {
    message: "Extracted document word count must match normalized content text.",
    path: ["wordCount"],
  });

export const extractionRequestSchema = z
  .object({
    requestedUrl: fetchUrlSchema.nullable().default(null),
    finalUrl: fetchUrlSchema,
    html: z.string().max(50_000_000).nullable().default(null),
    text: z.string().max(50_000_000).nullable().default(null),
    contentType: fetchAcceptedContentTypeSchema.nullable().default(null),
    sourceProfileId: opaqueIdentifierSchema.nullable().default(null),
    maxContentChars: extractionMaxContentCharsSchema.nullable().default(null),
    minWordCount: extractionMinWordCountSchema.nullable().default(null),
  })
  .strict()
  .refine((request) => request.html !== null || request.text !== null, {
    message: "Extraction request must include HTML or plain text content.",
    path: ["html"],
  });

export const extractionErrorMetadataSchema = z
  .record(z.string().min(1).max(80), z.unknown())
  .refine((metadata) => Object.keys(metadata).length <= 25, {
    message: "Extraction error metadata may include at most 25 keys.",
  });

export const extractionErrorSchema = z
  .object({
    kind: extractionErrorKindSchema,
    method: extractionMethodSchema.optional(),
    url: fetchUrlSchema.optional(),
    sourceProfileId: opaqueIdentifierSchema.optional(),
    message: z.string().trim().min(1).max(1_000),
    retryable: z.boolean().default(false),
    warnings: z.array(extractionWarningSchema).max(50).default([]),
    details: extractionErrorMetadataSchema.optional(),
  })
  .strict();

export type ExtractionMethod = z.infer<typeof extractionMethodSchema>;
export type ExtractionWarningCode = z.infer<typeof extractionWarningCodeSchema>;
export type ExtractionErrorKind = z.infer<typeof extractionErrorKindSchema>;
export type ExtractionContentText = z.infer<typeof extractionContentTextSchema>;
export type ExtractionContentHtml = z.infer<typeof extractionContentHtmlSchema>;
export type ExtractionWarning = z.infer<typeof extractionWarningSchema>;
export type ExtractionMetadata = z.infer<typeof extractionMetadataSchema>;
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;
export type ExtractionRequestInput = z.input<typeof extractionRequestSchema>;
export type ExtractionRequest = z.infer<typeof extractionRequestSchema>;
export type ExtractionErrorMetadata = z.infer<typeof extractionErrorMetadataSchema>;
export type ExtractionError = z.infer<typeof extractionErrorSchema>;

function countWords(value: string): number {
  const matches = value.trim().match(/\S+/gu);
  return matches?.length ?? 0;
}
