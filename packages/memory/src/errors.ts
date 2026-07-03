import { parsePlatformError, type PlatformError, type PlatformErrorCategory } from "@pap/contracts";

export const memoryServiceErrorCodes = {
  validationFailed: "MEMORY_VALIDATION_FAILED",
  writeRejected: "MEMORY_WRITE_REJECTED",
  recordNotFound: "MEMORY_RECORD_NOT_FOUND",
  sourceExecutionNotFound: "MEMORY_SOURCE_EXECUTION_NOT_FOUND",
  sourceExecutionMismatch: "MEMORY_SOURCE_EXECUTION_MISMATCH",
  invalidStatus: "MEMORY_INVALID_STATUS",
  storageError: "MEMORY_STORAGE_ERROR",
} as const;

export type MemoryServiceErrorCode =
  (typeof memoryServiceErrorCodes)[keyof typeof memoryServiceErrorCodes];

export class MemoryServiceError extends Error {
  readonly platformError: PlatformError;

  constructor(platformError: PlatformError, options: ErrorOptions = {}) {
    super(platformError.message, options);
    this.name = "MemoryServiceError";
    this.platformError = platformError;
  }
}

export type CreateMemoryServiceErrorInput = {
  code: MemoryServiceErrorCode;
  message: string;
  category?: PlatformErrorCategory;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export function createMemoryServiceError(input: CreateMemoryServiceErrorInput): MemoryServiceError {
  const platformError = parsePlatformError({
    code: input.code,
    message: input.message,
    category: input.category ?? "memory",
    retryable: input.retryable ?? false,
    ...(input.details ? { details: input.details } : {}),
  });

  return new MemoryServiceError(platformError, { cause: input.cause });
}

export function toMemoryServiceError(
  error: unknown,
  fallback: Omit<CreateMemoryServiceErrorInput, "cause">,
): MemoryServiceError {
  if (error instanceof MemoryServiceError) {
    return error;
  }

  return createMemoryServiceError({
    ...fallback,
    cause: error,
  });
}
