import { randomUUID } from "node:crypto";

const idPrefixPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

export function createId(prefix = "id"): string {
  if (!idPrefixPattern.test(prefix)) {
    throw new Error(`Invalid ID prefix: ${prefix}`);
  }

  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function createExecutionId(): string {
  return createId("exec");
}

export function createTraceStepId(): string {
  return createId("step");
}
