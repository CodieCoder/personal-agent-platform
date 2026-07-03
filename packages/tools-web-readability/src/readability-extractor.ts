import { Readability } from "@mozilla/readability";
import {
  type ExtractedDocument,
  type ExtractionRequest,
  type ExtractionRequestInput,
  type ExtractionWarning,
  extractedDocumentSchema,
  extractionRequestSchema,
  type FetchUrl,
  fetchUrlSchema,
} from "@pap/contracts";
import { JSDOM } from "jsdom";
import type { z } from "zod";
import { ArticleExtractionError, isArticleExtractionError } from "./errors.js";
import {
  countWords,
  normalizeHtmlFragment,
  normalizeNullableText,
  normalizeTextContent,
  sanitizeDocument,
} from "./html-normalization.js";

export type ReadabilityExtractorOptions = {
  clock?: () => Date;
  defaultMaxContentChars?: number;
  defaultReadabilityMinWordCount?: number;
  defaultPlainTextMinWordCount?: number;
};

export interface ReadabilityExtractor {
  extract(request: ExtractionRequestInput): Promise<ExtractedDocument>;
}

type ResolvedExtractionOptions = {
  maxContentChars: number;
  readabilityMinWordCount: number;
  plainTextMinWordCount: number;
};

type ArticleMetadata = {
  title: string | null;
  byline: string | null;
  siteName: string | null;
  publishedAt: string | null;
  language: string | null;
  canonicalUrl: FetchUrl | null;
  excerpt: string | null;
};

const defaultOptions: ResolvedExtractionOptions = {
  maxContentChars: 50_000,
  readabilityMinWordCount: 30,
  plainTextMinWordCount: 5,
};

export function createReadabilityExtractor(
  options: ReadabilityExtractorOptions = {},
): ReadabilityExtractor {
  const clock = options.clock ?? (() => new Date());
  const resolvedOptions: ResolvedExtractionOptions = {
    maxContentChars: options.defaultMaxContentChars ?? defaultOptions.maxContentChars,
    readabilityMinWordCount:
      options.defaultReadabilityMinWordCount ?? defaultOptions.readabilityMinWordCount,
    plainTextMinWordCount:
      options.defaultPlainTextMinWordCount ?? defaultOptions.plainTextMinWordCount,
  };

  return {
    async extract(requestInput) {
      const request = parseExtractionRequest(requestInput);
      const requestOptions = resolveRequestOptions(request, resolvedOptions);

      try {
        if (request.html !== null) {
          return extractFromHtml(request, requestOptions, clock);
        }

        if (request.text !== null) {
          return extractFromPlainText(request, requestOptions, clock, [
            {
              code: "extraction_plain_text_fallback",
              method: "plain_text",
              message: "Extraction used bounded plain text content.",
            },
          ]);
        }

        throw new ArticleExtractionError({
          code: "extraction_empty_content",
          url: request.finalUrl,
          message: "Extraction request did not include usable content.",
        });
      } catch (error) {
        if (isArticleExtractionError(error)) {
          throw error;
        }

        throw new ArticleExtractionError({
          code: "extraction_readability_failed",
          method: "readability",
          url: request.finalUrl,
          message: "Readability extraction failed safely.",
          cause: error,
        });
      }
    },
  };
}

function extractFromHtml(
  request: ExtractionRequest,
  options: ResolvedExtractionOptions,
  clock: () => Date,
): ExtractedDocument {
  const dom = new JSDOM(request.html ?? "", {
    url: request.finalUrl,
    contentType:
      request.contentType === "application/xhtml+xml" ? "application/xhtml+xml" : "text/html",
  });
  const document = dom.window.document;
  const cleanupWarnings = sanitizeDocument(document);
  const metadata = extractDocumentMetadata(document, request.finalUrl);
  const reader = new Readability(document);
  const article = reader.parse();

  if (article === null) {
    throw new ArticleExtractionError({
      code: "extraction_readability_failed",
      method: "readability",
      url: request.finalUrl,
      warnings: [
        ...cleanupWarnings,
        {
          code: "extraction_readability_failed",
          method: "readability",
          message: "Readability did not return an article candidate.",
        },
      ],
      message: "Readability did not return an article candidate.",
    });
  }

  const articleDom = new JSDOM(`<body>${article.content}</body>`, {
    url: request.finalUrl,
    contentType: "text/html",
  });
  const normalized = normalizeHtmlFragment(articleDom.window.document, options.maxContentChars);
  const contentText = normalized.text;
  const wordCount = countWords(contentText);
  const warnings = [
    ...cleanupWarnings,
    ...normalized.warnings,
    ...missingMetadataWarnings({
      ...metadata,
      title: normalizeNullableText(article.title) ?? metadata.title,
      byline: normalizeNullableText(article.byline) ?? metadata.byline,
      siteName: normalizeNullableText(article.siteName) ?? metadata.siteName,
      excerpt: normalizeNullableText(article.excerpt) ?? metadata.excerpt,
    }),
  ];

  if (wordCount < options.readabilityMinWordCount) {
    throw new ArticleExtractionError({
      code: contentText.length === 0 ? "extraction_empty_content" : "extraction_content_too_short",
      method: "readability",
      url: request.finalUrl,
      warnings: [
        ...warnings,
        {
          code: "extraction_low_quality",
          method: "readability",
          message: "Readability extracted too little usable article text.",
          count: wordCount,
        },
      ],
      message: "Readability extracted too little usable article text.",
      details: { wordCount, minWordCount: options.readabilityMinWordCount },
    });
  }

  return parseExtractedDocument({
    title: normalizeNullableText(article.title) ?? metadata.title,
    byline: normalizeNullableText(article.byline) ?? metadata.byline,
    siteName: normalizeNullableText(article.siteName) ?? metadata.siteName,
    publishedAt: metadata.publishedAt,
    language: metadata.language,
    canonicalUrl: metadata.canonicalUrl,
    excerpt: normalizeNullableText(article.excerpt) ?? metadata.excerpt,
    contentText,
    contentHtml: normalized.html,
    wordCount,
    method: "readability",
    warnings,
    metadata: {
      requestedUrl: request.requestedUrl,
      finalUrl: request.finalUrl,
      sourceProfileId: request.sourceProfileId,
      contentType: request.contentType,
      contentChars: contentText.length,
      originalContentChars: request.html?.length ?? 0,
      maxContentChars: options.maxContentChars,
      extractedAt: clock().toISOString(),
    },
  });
}

export function extractFromPlainText(
  request: ExtractionRequest,
  options: ResolvedExtractionOptions,
  clock: () => Date,
  warnings: ExtractionWarning[] = [],
): ExtractedDocument {
  const normalized = normalizeTextContent(request.text ?? "", options.maxContentChars);
  const wordCount = countWords(normalized.text);
  const documentWarnings = [...warnings];

  if (normalized.truncated) {
    documentWarnings.push({
      code: "extraction_content_truncated",
      method: "plain_text",
      message: "Plain text extraction exceeded configured bounds and was truncated.",
      count: normalized.originalLength,
    });
  }

  if (wordCount < options.plainTextMinWordCount) {
    throw new ArticleExtractionError({
      code:
        normalized.text.length === 0 ? "extraction_empty_content" : "extraction_content_too_short",
      method: "plain_text",
      url: request.finalUrl,
      warnings: [
        ...documentWarnings,
        {
          code: "extraction_low_quality",
          method: "plain_text",
          message: "Plain text extraction produced too little usable text.",
          count: wordCount,
        },
      ],
      message: "Plain text extraction produced too little usable text.",
      details: { wordCount, minWordCount: options.plainTextMinWordCount },
    });
  }

  return parseExtractedDocument({
    title: null,
    byline: null,
    siteName: null,
    publishedAt: null,
    language: null,
    canonicalUrl: request.finalUrl,
    excerpt: normalized.text.slice(0, 280) || null,
    contentText: normalized.text,
    contentHtml: null,
    wordCount,
    method: "plain_text",
    warnings: documentWarnings,
    metadata: {
      requestedUrl: request.requestedUrl,
      finalUrl: request.finalUrl,
      sourceProfileId: request.sourceProfileId,
      contentType: request.contentType,
      contentChars: normalized.text.length,
      originalContentChars: request.text?.length ?? 0,
      maxContentChars: options.maxContentChars,
      extractedAt: clock().toISOString(),
    },
  });
}

function parseExtractionRequest(requestInput: ExtractionRequestInput): ExtractionRequest {
  const parsed = extractionRequestSchema.safeParse(requestInput);

  if (!parsed.success) {
    throw new ArticleExtractionError({
      code: "extraction_input_invalid",
      message: "Extraction request did not match the extraction request contract.",
      details: { issues: summarizeZodIssues(parsed.error) },
    });
  }

  return parsed.data;
}

function resolveRequestOptions(
  request: ExtractionRequest,
  defaults: ResolvedExtractionOptions,
): ResolvedExtractionOptions {
  return {
    maxContentChars: request.maxContentChars ?? defaults.maxContentChars,
    readabilityMinWordCount: request.minWordCount ?? defaults.readabilityMinWordCount,
    plainTextMinWordCount: request.minWordCount ?? defaults.plainTextMinWordCount,
  };
}

function extractDocumentMetadata(document: Document, finalUrl: FetchUrl): ArticleMetadata {
  return {
    title: normalizeNullableText(document.title),
    byline:
      getMetaContent(document, "name", "author") ??
      getMetaContent(document, "property", "article:author"),
    siteName: getMetaContent(document, "property", "og:site_name"),
    publishedAt: normalizePublishedAt(
      getMetaContent(document, "property", "article:published_time") ??
        getMetaContent(document, "name", "date") ??
        getMetaContent(document, "name", "pubdate"),
    ),
    language: normalizeNullableText(document.documentElement.lang),
    canonicalUrl: normalizeCanonicalUrl(document, finalUrl),
    excerpt:
      getMetaContent(document, "name", "description") ??
      getMetaContent(document, "property", "og:description"),
  };
}

function getMetaContent(
  document: Document,
  attribute: "name" | "property",
  value: string,
): string | null {
  const content = document.querySelector(`meta[${attribute}="${value}"]`)?.getAttribute("content");
  return normalizeNullableText(content);
}

function normalizeCanonicalUrl(document: Document, finalUrl: FetchUrl): FetchUrl | null {
  const href = document.querySelector('link[rel~="canonical"]')?.getAttribute("href");

  if (href === null || href === undefined || href.trim().length === 0) {
    return finalUrl;
  }

  try {
    const resolved = new URL(href, finalUrl).toString();
    const parsed = fetchUrlSchema.safeParse(resolved);
    return parsed.success ? parsed.data : finalUrl;
  } catch {
    return finalUrl;
  }
}

function normalizePublishedAt(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function missingMetadataWarnings(metadata: ArticleMetadata): ExtractionWarning[] {
  const missing = [
    ["title", metadata.title],
    ["byline", metadata.byline],
    ["siteName", metadata.siteName],
    ["publishedAt", metadata.publishedAt],
  ].filter(([, value]) => value === null);

  return missing.length === 0
    ? []
    : [
        {
          code: "extraction_metadata_missing",
          method: "readability",
          message: "Readability extraction could not determine all article metadata fields.",
          count: missing.length,
        },
      ];
}

function parseExtractedDocument(document: ExtractedDocument): ExtractedDocument {
  const parsed = extractedDocumentSchema.safeParse(document);

  if (!parsed.success) {
    const errorOptions = {
      code: "extraction_invalid_output",
      method: document.method,
      url: document.metadata.finalUrl,
      warnings: document.warnings,
      message: "Extracted document did not match the extraction output contract.",
      details: { issues: summarizeZodIssues(parsed.error) },
    } satisfies ConstructorParameters<typeof ArticleExtractionError>[0];

    throw new ArticleExtractionError(
      document.metadata.sourceProfileId === null
        ? errorOptions
        : { ...errorOptions, sourceProfileId: document.metadata.sourceProfileId },
    );
  }

  return parsed.data;
}

function summarizeZodIssues(error: z.ZodError): Record<string, unknown>[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
