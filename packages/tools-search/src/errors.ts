import type { SearchProviderErrorKind, SearchProviderId } from "@pap/contracts";

export const searchProviderErrorCodes = [
  "search_provider_duplicate",
  "search_provider_not_found",
  "search_provider_disabled",
  "search_provider_unavailable",
  "search_provider_timeout",
  "search_provider_http_error",
  "search_provider_invalid_response",
  "search_provider_misconfigured",
] as const satisfies readonly SearchProviderErrorKind[];

export type SearchProviderErrorCode = (typeof searchProviderErrorCodes)[number];

export type SearchProviderErrorOptions = {
  code: SearchProviderErrorCode;
  message: string;
  providerId?: SearchProviderId;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class SearchProviderError extends Error {
  readonly code: SearchProviderErrorCode;
  readonly providerId?: SearchProviderId;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(options: SearchProviderErrorOptions) {
    super(options.message);
    this.name = "SearchProviderError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;

    if (options.providerId !== undefined) {
      this.providerId = options.providerId;
    }

    if (options.details !== undefined) {
      this.details = options.details;
    }

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isSearchProviderError(error: unknown): error is SearchProviderError {
  return error instanceof SearchProviderError;
}
