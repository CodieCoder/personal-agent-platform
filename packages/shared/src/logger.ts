import pino, { type Logger, type LoggerOptions } from "pino";

export type PapLogger = Logger;

export type LoggerContext = {
  executionId?: string;
  capabilityId?: string;
  toolId?: string;
};

const defaultRedact: NonNullable<LoggerOptions["redact"]> = {
  paths: [
    "authorization",
    "headers.authorization",
    "headers.cookie",
    "cookie",
    "password",
    "token",
    "apiKey",
    "emailBody",
    "documentText",
    "rawPayload",
  ],
  censor: "[redacted]",
};

const defaultLoggerOptions: LoggerOptions = {
  level: "info",
  redact: defaultRedact,
};

export function createLogger(options: LoggerOptions = {}): PapLogger {
  return pino({
    ...defaultLoggerOptions,
    ...options,
    redact: options.redact ?? defaultRedact,
  });
}

export function createExecutionLogger(logger: PapLogger, context: LoggerContext): PapLogger {
  return logger.child(context);
}
