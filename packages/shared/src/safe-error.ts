export type SerializedError = {
  name: string;
  message: string;
  code?: string;
  stack?: string;
  cause?: SerializedError;
};

export type SerializeErrorOptions = {
  includeStack?: boolean;
  maxCauseDepth?: number;
};

export function serializeError(
  error: unknown,
  options: SerializeErrorOptions = {},
): SerializedError {
  const includeStack = options.includeStack ?? false;
  const maxCauseDepth = options.maxCauseDepth ?? 2;

  return serializeErrorWithDepth(error, includeStack, maxCauseDepth);
}

function serializeErrorWithDepth(
  error: unknown,
  includeStack: boolean,
  remainingCauseDepth: number,
): SerializedError {
  if (error instanceof Error) {
    const serialized: SerializedError = {
      name: error.name,
      message: error.message,
    };

    const code = readStringProperty(error, "code");
    if (code) {
      serialized.code = code;
    }

    if (includeStack && error.stack) {
      serialized.stack = error.stack;
    }

    if (remainingCauseDepth > 0 && "cause" in error) {
      serialized.cause = serializeErrorWithDepth(
        error.cause,
        includeStack,
        remainingCauseDepth - 1,
      );
    }

    return serialized;
  }

  return {
    name: "NonError",
    message: safeString(error),
  };
}

function readStringProperty(value: object, key: string): string | undefined {
  const record = value as Record<string, unknown>;
  const property = record[key];

  return typeof property === "string" && property.length > 0 ? property : undefined;
}

function safeString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
