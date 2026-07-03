import type { ProviderId } from "@pap/contracts";

export const aiProviderErrorCodes = [
  "provider_duplicate",
  "provider_not_found",
  "provider_unavailable",
  "provider_timeout",
  "provider_overloaded",
  "provider_http_error",
  "provider_invalid_response",
  "provider_schema_invalid",
  "provider_disabled",
] as const;

export type AIProviderErrorCode = (typeof aiProviderErrorCodes)[number];

export type AIProviderErrorOptions = {
  code: AIProviderErrorCode;
  message: string;
  providerId?: ProviderId;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly providerId?: ProviderId;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(options: AIProviderErrorOptions) {
    super(options.message);
    this.name = "AIProviderError";
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

export function isAIProviderError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError;
}
