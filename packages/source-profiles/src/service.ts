import {
  type ExtractedDocument,
  type ExtractionRequest,
  type ExtractionRequestInput,
  type ExtractionWarning,
  extractedDocumentSchema,
  extractionRequestSchema,
  type FetchUrl,
  fetchUrlSchema,
  type SourceProfile,
  type SourceProfileDomain,
  sourceProfileDomainSchema,
} from "@pap/contracts";
import type { SourceProfileRepository } from "@pap/storage";
import {
  ArticleExtractionError,
  countWords,
  createReadabilityExtractor,
  isArticleExtractionError,
  normalizeHtmlFragment,
  normalizeNullableText,
  type ReadabilityExtractor,
} from "@pap/tools-web-readability";
import { JSDOM } from "jsdom";
import type { z } from "zod";

export type SourceProfileServiceOptions = {
  repository: SourceProfileRepository;
  readabilityExtractor?: ReadabilityExtractor;
  clock?: () => Date;
  defaultMaxContentChars?: number;
  defaultMinWordCount?: number;
};

export interface SourceProfileService {
  findActiveProfileForUrl(url: FetchUrl): Promise<SourceProfile | null>;
  extract(request: ExtractionRequestInput): Promise<ExtractedDocument>;
}

type SelectorExtractionResult =
  | { ok: true; document: ExtractedDocument }
  | { ok: false; warnings: ExtractionWarning[] };

type SelectorValues = {
  title: string | null;
  byline: string | null;
  publishedAt: string | null;
  canonicalUrl: FetchUrl | null;
};

const defaultMaxContentChars = 50_000;
const defaultMinWordCount = 30;

export function createSourceProfileService(
  options: SourceProfileServiceOptions,
): SourceProfileService {
  const readabilityExtractor = options.readabilityExtractor ?? createReadabilityExtractor();
  const clock = options.clock ?? (() => new Date());
  const maxContentChars = options.defaultMaxContentChars ?? defaultMaxContentChars;
  const minWordCount = options.defaultMinWordCount ?? defaultMinWordCount;

  return {
    async findActiveProfileForUrl(url) {
      return options.repository.getActiveByDomain(getNormalizedHostname(url));
    },

    async extract(requestInput) {
      const request = parseExtractionRequest(requestInput);
      const warnings: ExtractionWarning[] = [];
      const profile = await options.repository.getActiveByDomain(
        getNormalizedHostname(request.finalUrl),
      );

      if (profile === null) {
        warnings.push({
          code: "extraction_profile_not_found",
          method: "source_profile",
          message: "No active source profile matched the final URL hostname.",
        });
        return extractWithFallback(readabilityExtractor, request, warnings);
      }

      const selectorResult = trySelectorExtraction({
        request,
        profile,
        clock,
        maxContentChars: request.maxContentChars ?? maxContentChars,
        minWordCount: request.minWordCount ?? minWordCount,
      });

      if (selectorResult.ok) {
        return selectorResult.document;
      }

      return extractWithFallback(readabilityExtractor, request, selectorResult.warnings);
    },
  };
}

function trySelectorExtraction({
  request,
  profile,
  clock,
  maxContentChars,
  minWordCount,
}: {
  request: ExtractionRequest;
  profile: SourceProfile;
  clock: () => Date;
  maxContentChars: number;
  minWordCount: number;
}): SelectorExtractionResult {
  const warnings: ExtractionWarning[] = [];

  if (request.html === null) {
    return {
      ok: false,
      warnings: [
        {
          code: "extraction_profile_invalid",
          method: "source_profile",
          message: "Source-profile extraction requires supplied HTML content.",
        },
      ],
    };
  }

  if (profile.contentSelector === null && profile.articleContainerSelector === null) {
    return {
      ok: false,
      warnings: [
        {
          code: "extraction_profile_invalid",
          method: "source_profile",
          message: "Source profile must define a content or article container selector.",
        },
      ],
    };
  }

  const dom = createSelectorDom(request, warnings);

  if (dom === null) {
    return { ok: false, warnings };
  }

  const document = dom.window.document;
  const scopeResult = selectScope(document, profile, warnings);

  if (scopeResult === null) {
    return { ok: false, warnings };
  }

  const contentResult = selectContent(scopeResult, profile, warnings);

  if (contentResult === null) {
    return { ok: false, warnings };
  }

  const contentDom = new JSDOM(`<body>${contentResult.outerHTML}</body>`, {
    url: request.finalUrl,
    contentType: "text/html",
  });
  const normalized = normalizeHtmlFragment(contentDom.window.document, maxContentChars);
  const contentText = normalized.text;
  const wordCount = countWords(contentText);

  warnings.push(...normalized.warnings);

  if (wordCount < minWordCount) {
    warnings.push({
      code: "extraction_low_quality",
      method: "source_profile",
      message: "Source-profile selectors produced too little usable article text.",
      count: wordCount,
    });
    return { ok: false, warnings };
  }

  const selectorValues = readSelectorValues(
    document,
    scopeResult,
    profile,
    request.finalUrl,
    warnings,
  );
  const title = selectorValues.title ?? normalizeNullableText(document.title);
  const documentWarnings = [
    ...warnings,
    ...missingProfileMetadataWarnings({
      title,
      byline: selectorValues.byline,
      publishedAt: selectorValues.publishedAt,
      canonicalUrl: selectorValues.canonicalUrl,
    }),
  ];

  try {
    return {
      ok: true,
      document: extractedDocumentSchema.parse({
        title,
        byline: selectorValues.byline,
        siteName: readMetaContent(document, "property", "og:site_name"),
        publishedAt: selectorValues.publishedAt,
        language: normalizeNullableText(document.documentElement.lang),
        canonicalUrl: selectorValues.canonicalUrl ?? request.finalUrl,
        excerpt: contentText.slice(0, 280) || null,
        contentText,
        contentHtml: normalized.html,
        wordCount,
        method: "source_profile",
        warnings: documentWarnings,
        metadata: {
          requestedUrl: request.requestedUrl,
          finalUrl: request.finalUrl,
          sourceProfileId: profile.id,
          contentType: request.contentType,
          contentChars: contentText.length,
          originalContentChars: request.html.length,
          maxContentChars,
          extractedAt: clock().toISOString(),
        },
      }),
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [
        ...documentWarnings,
        {
          code: "extraction_profile_invalid",
          method: "source_profile",
          message: "Source-profile extraction output failed contract validation.",
          count: summarizeZodIssueCount(error),
        },
      ],
    };
  }
}

function createSelectorDom(
  request: ExtractionRequest,
  warnings: ExtractionWarning[],
): JSDOM | null {
  try {
    return new JSDOM(request.html ?? "", {
      url: request.finalUrl,
      contentType:
        request.contentType === "application/xhtml+xml" ? "application/xhtml+xml" : "text/html",
    });
  } catch {
    warnings.push({
      code: "extraction_profile_invalid",
      method: "source_profile",
      message: "Source-profile extraction could not parse supplied HTML content.",
    });
    return null;
  }
}

async function extractWithFallback(
  readabilityExtractor: ReadabilityExtractor,
  request: ExtractionRequest,
  warnings: ExtractionWarning[],
): Promise<ExtractedDocument> {
  try {
    const fallback = await readabilityExtractor.extract(request);
    return appendWarnings(fallback, warnings);
  } catch (error) {
    if (isArticleExtractionError(error)) {
      const errorOptions = {
        code: error.code,
        retryable: error.retryable,
        warnings: [...warnings, ...error.warnings],
        message: error.message,
        cause: error,
      } satisfies ConstructorParameters<typeof ArticleExtractionError>[0];

      throw new ArticleExtractionError({
        ...errorOptions,
        ...(error.method === undefined ? {} : { method: error.method }),
        ...(error.url === undefined ? {} : { url: error.url }),
        ...(error.sourceProfileId === undefined ? {} : { sourceProfileId: error.sourceProfileId }),
        ...(error.details === undefined ? {} : { details: error.details }),
      });
    }

    throw error;
  }
}

function selectScope(
  document: Document,
  profile: SourceProfile,
  warnings: ExtractionWarning[],
): Element | Document | null {
  if (profile.articleContainerSelector === null) {
    return document;
  }

  const element = safeQuerySelector(document, profile.articleContainerSelector, warnings);

  if (element === null) {
    warnings.push({
      code: "extraction_selector_no_match",
      method: "source_profile",
      selector: profile.articleContainerSelector,
      message: "Source-profile article container selector did not match any element.",
    });
  }

  return element;
}

function selectContent(
  scope: Element | Document,
  profile: SourceProfile,
  warnings: ExtractionWarning[],
): Element | null {
  if (profile.contentSelector === null) {
    return isElementNode(scope) ? scope : null;
  }

  const element = safeQuerySelector(scope, profile.contentSelector, warnings);

  if (element === null) {
    warnings.push({
      code: "extraction_selector_no_match",
      method: "source_profile",
      selector: profile.contentSelector,
      message: "Source-profile content selector did not match any element.",
    });
  }

  return element;
}

function readSelectorValues(
  document: Document,
  scope: Element | Document,
  profile: SourceProfile,
  finalUrl: FetchUrl,
  warnings: ExtractionWarning[],
): SelectorValues {
  return {
    title: readOptionalSelectorText(scope, profile.titleSelector, warnings),
    byline: readOptionalSelectorText(scope, profile.bylineSelector, warnings),
    publishedAt: normalizePublishedAt(
      readOptionalSelectorText(scope, profile.publishedAtSelector, warnings) ??
        readMetaContent(document, "property", "article:published_time"),
    ),
    canonicalUrl: readOptionalSelectorUrl(scope, profile.canonicalUrlSelector, finalUrl, warnings),
  };
}

function readOptionalSelectorText(
  scope: Element | Document,
  selector: string | null,
  warnings: ExtractionWarning[],
): string | null {
  if (selector === null) {
    return null;
  }

  const element = safeQuerySelector(scope, selector, warnings);

  if (element === null) {
    warnings.push({
      code: "extraction_selector_partial",
      method: "source_profile",
      selector,
      message: "Optional source-profile selector did not match any element.",
    });
    return null;
  }

  return (
    normalizeNullableText(element.getAttribute("content")) ??
    normalizeNullableText(element.textContent)
  );
}

function readOptionalSelectorUrl(
  scope: Element | Document,
  selector: string | null,
  finalUrl: FetchUrl,
  warnings: ExtractionWarning[],
): FetchUrl | null {
  if (selector === null) {
    return null;
  }

  const element = safeQuerySelector(scope, selector, warnings);
  const value =
    element?.getAttribute("href") ??
    element?.getAttribute("content") ??
    normalizeNullableText(element?.textContent);

  if (value === null || value === undefined) {
    warnings.push({
      code: "extraction_selector_partial",
      method: "source_profile",
      selector,
      message: "Source-profile canonical URL selector did not return a URL value.",
    });
    return null;
  }

  try {
    const resolved = new URL(value, finalUrl).toString();
    const parsed = fetchUrlSchema.safeParse(resolved);

    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // The warning below preserves the fallback path without exposing parser internals.
  }

  warnings.push({
    code: "extraction_selector_partial",
    method: "source_profile",
    selector,
    message: "Source-profile canonical URL selector returned an invalid URL.",
  });
  return null;
}

function safeQuerySelector(
  scope: Element | Document,
  selector: string,
  warnings: ExtractionWarning[],
): Element | null {
  try {
    return scope.querySelector(selector);
  } catch {
    warnings.push({
      code: "extraction_selector_invalid",
      method: "source_profile",
      selector,
      message: "Source-profile selector is invalid and was skipped.",
    });
    return null;
  }
}

function isElementNode(value: Element | Document): value is Element {
  return value.nodeType === 1;
}

function appendWarnings(
  document: ExtractedDocument,
  warnings: ExtractionWarning[],
): ExtractedDocument {
  if (warnings.length === 0) {
    return document;
  }

  return extractedDocumentSchema.parse({
    ...document,
    warnings: [...warnings, ...document.warnings].slice(0, 50),
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

function getNormalizedHostname(url: FetchUrl): SourceProfileDomain {
  return sourceProfileDomainSchema.parse(new URL(url).hostname);
}

function readMetaContent(
  document: Document,
  attribute: "name" | "property",
  value: string,
): string | null {
  const content = document.querySelector(`meta[${attribute}="${value}"]`)?.getAttribute("content");
  return normalizeNullableText(content);
}

function normalizePublishedAt(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function missingProfileMetadataWarnings(metadata: {
  title: string | null;
  byline: string | null;
  publishedAt: string | null;
  canonicalUrl: FetchUrl | null;
}): ExtractionWarning[] {
  const missingCount = Object.values(metadata).filter((value) => value === null).length;

  return missingCount === 0
    ? []
    : [
        {
          code: "extraction_metadata_missing",
          method: "source_profile",
          message: "Source-profile extraction could not determine all metadata fields.",
          count: missingCount,
        },
      ];
}

function summarizeZodIssueCount(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    return error.issues.length;
  }

  return 1;
}

function summarizeZodIssues(error: z.ZodError): Record<string, unknown>[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
