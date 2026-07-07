import type {
  ExtractionErrorKind,
  ExtractionMethod,
  ExtractionWarning,
  FetchUrl,
  SourceProfileId,
} from "@pap/contracts";

export const articleExtractionErrorCodes = [
  "extraction_input_invalid",
  "extraction_empty_content",
  "extraction_content_too_short",
  "extraction_readability_failed",
  "extraction_plain_text_unavailable",
  "extraction_invalid_output",
] as const satisfies readonly ExtractionErrorKind[];

export type ArticleExtractionErrorCode = (typeof articleExtractionErrorCodes)[number];

export type ArticleExtractionErrorOptions = {
  code: ArticleExtractionErrorCode;
  message: string;
  method?: ExtractionMethod;
  url?: FetchUrl;
  sourceProfileId?: SourceProfileId;
  retryable?: boolean;
  warnings?: ExtractionWarning[];
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class ArticleExtractionError extends Error {
  readonly code: ArticleExtractionErrorCode;
  readonly method?: ExtractionMethod;
  readonly url?: FetchUrl;
  readonly sourceProfileId?: SourceProfileId;
  readonly retryable: boolean;
  readonly warnings: ExtractionWarning[];
  readonly details?: Record<string, unknown>;

  constructor(options: ArticleExtractionErrorOptions) {
    super(options.message);
    this.name = "ArticleExtractionError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.warnings = options.warnings ?? [];

    if (options.method !== undefined) {
      this.method = options.method;
    }

    if (options.url !== undefined) {
      this.url = options.url;
    }

    if (options.sourceProfileId !== undefined) {
      this.sourceProfileId = options.sourceProfileId;
    }

    if (options.details !== undefined) {
      this.details = options.details;
    }

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isArticleExtractionError(error: unknown): error is ArticleExtractionError {
  return error instanceof ArticleExtractionError;
}
