import { type PlatformError, type PlatformErrorCategory, parsePlatformError } from "@pap/contracts";

export type SearchExtractTestErrorInput = {
  code: string;
  message: string;
  category: PlatformErrorCategory;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export class SearchExtractTestSafeError extends Error {
  readonly platformError: PlatformError;

  constructor(input: SearchExtractTestErrorInput) {
    const platformError = parsePlatformError({
      code: input.code,
      message: input.message,
      category: input.category,
      retryable: input.retryable ?? false,
      ...(input.details ? { details: input.details } : {}),
    });

    super(platformError.message);
    this.name = "SearchExtractTestSafeError";
    this.platformError = platformError;
  }
}
