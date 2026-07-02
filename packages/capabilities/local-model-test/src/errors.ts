import { parsePlatformError, type PlatformError, type PlatformErrorCategory } from "@pap/contracts";

export type LocalModelTestErrorInput = {
  code: string;
  message: string;
  category: PlatformErrorCategory;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export class LocalModelTestSafeError extends Error {
  readonly platformError: PlatformError;

  constructor(input: LocalModelTestErrorInput) {
    const platformError = parsePlatformError({
      code: input.code,
      message: input.message,
      category: input.category,
      retryable: input.retryable ?? false,
      ...(input.details ? { details: input.details } : {}),
    });

    super(platformError.message);
    this.name = "LocalModelTestSafeError";
    this.platformError = platformError;
  }
}
