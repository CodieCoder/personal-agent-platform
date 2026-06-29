import { parsePlatformError, type PlatformError, type PlatformErrorCategory } from "@pap/contracts";
import { serializeError } from "@pap/shared";

export const runtimeErrorCodes = {
  capabilityAlreadyRegistered: "CAPABILITY_ALREADY_REGISTERED",
  capabilityNotFound: "CAPABILITY_NOT_FOUND",
  capabilityInputInvalid: "CAPABILITY_INPUT_INVALID",
  capabilityOutputInvalid: "CAPABILITY_OUTPUT_INVALID",
  capabilityExecutionFailed: "CAPABILITY_EXECUTION_FAILED",
  runtimeFeatureUnavailable: "RUNTIME_FEATURE_UNAVAILABLE",
  traceAlreadyStarted: "TRACE_ALREADY_STARTED",
  traceNotStarted: "TRACE_NOT_STARTED",
  traceAlreadyFinalized: "TRACE_ALREADY_FINALIZED",
} as const;

export type RuntimeErrorCode = (typeof runtimeErrorCodes)[keyof typeof runtimeErrorCodes];

export class RuntimeSafeError extends Error {
  readonly platformError: PlatformError;

  constructor(platformError: PlatformError, options: ErrorOptions = {}) {
    super(platformError.message, options);
    this.name = "RuntimeSafeError";
    this.platformError = platformError;
  }
}

export type CreateRuntimeSafeErrorInput = {
  code: RuntimeErrorCode;
  message: string;
  category: PlatformErrorCategory;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export function createRuntimeSafeError(input: CreateRuntimeSafeErrorInput): RuntimeSafeError {
  const platformError = parsePlatformError({
    code: input.code,
    message: input.message,
    category: input.category,
    retryable: input.retryable ?? false,
    ...(input.details ? { details: input.details } : {}),
  });

  return new RuntimeSafeError(platformError, { cause: input.cause });
}

export function toPlatformError(
  error: unknown,
  fallback: {
    code: RuntimeErrorCode;
    message: string;
    category: PlatformErrorCategory;
  },
): PlatformError {
  if (error instanceof RuntimeSafeError) {
    return error.platformError;
  }

  const serialized = serializeError(error);

  return parsePlatformError({
    code: fallback.code,
    message: fallback.message,
    category: fallback.category,
    retryable: false,
    details: {
      errorName: serialized.name,
      errorMessage: serialized.message,
      ...(serialized.code ? { errorCode: serialized.code } : {}),
    },
  });
}

export function assertRuntimeSafeError(error: unknown): RuntimeSafeError {
  if (error instanceof RuntimeSafeError) {
    return error;
  }

  throw error;
}
