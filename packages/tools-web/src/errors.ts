import type { FetchErrorKind, FetchStatusCode, FetchUrl } from "@pap/contracts";

export const fetchErrorCodes = [
  "fetch_url_invalid",
  "fetch_url_blocked",
  "fetch_timeout",
  "fetch_redirect_limit",
  "fetch_redirect_blocked",
  "fetch_http_error",
  "fetch_content_type_unsupported",
  "fetch_response_too_large",
  "fetch_network_error",
  "fetch_invalid_response",
] as const satisfies readonly FetchErrorKind[];

export type FetchErrorCode = (typeof fetchErrorCodes)[number];

export type FetchClientErrorOptions = {
  code: FetchErrorCode;
  message: string;
  url?: FetchUrl;
  statusCode?: FetchStatusCode;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class FetchClientError extends Error {
  readonly code: FetchErrorCode;
  readonly url?: FetchUrl;
  readonly statusCode?: FetchStatusCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(options: FetchClientErrorOptions) {
    super(options.message);
    this.name = "FetchClientError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;

    if (options.url !== undefined) {
      this.url = options.url;
    }

    if (options.statusCode !== undefined) {
      this.statusCode = options.statusCode;
    }

    if (options.details !== undefined) {
      this.details = options.details;
    }

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isFetchClientError(error: unknown): error is FetchClientError {
  return error instanceof FetchClientError;
}
