import { modelNameSchema } from "@pap/contracts";
import { z } from "zod";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_KEEP_ALIVE = "5m";
const MAX_KEEP_ALIVE_MS = 86_400_000;

function optionalString(value: unknown): unknown {
  if (value === undefined || value === "") {
    return undefined;
  }

  return value;
}

function booleanEnvironmentSchema(defaultValue: boolean) {
  return z.preprocess(
    (value) => optionalString(value) ?? String(defaultValue),
    z.enum(["true", "false"]).transform((value) => value === "true"),
  );
}

function integerEnvironmentSchema(defaultValue: number, minimum: number, maximum: number) {
  return z.preprocess(
    (value) => optionalString(value) ?? defaultValue,
    z.coerce.number().int().min(minimum).max(maximum),
  );
}

function keepAliveToMilliseconds(value: string): number {
  if (value === "0") {
    return 0;
  }

  const match = /^(?<amount>[1-9]\d*)(?<unit>ms|s|m|h)$/u.exec(value);

  if (match?.groups === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  const amount = Number(match.groups.amount);
  const unit = match.groups.unit;

  if (unit === "ms") {
    return amount;
  }

  if (unit === "s") {
    return amount * 1_000;
  }

  if (unit === "m") {
    return amount * 60_000;
  }

  return amount * 3_600_000;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = parts;

  if (first === undefined || second === undefined) {
    return false;
  }

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isSingleLabelLocalService(hostname: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(hostname);
}

function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();

  if (lower.startsWith("[") && lower.endsWith("]")) {
    return lower.slice(1, -1);
  }

  return lower;
}

function isAllowedLocalOllamaUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    return false;
  }

  if (url.pathname !== "" && url.pathname !== "/") {
    return false;
  }

  const hostname = normalizeHostname(url.hostname);

  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    isPrivateIpv4(hostname) ||
    hostname.endsWith(".local") ||
    isSingleLabelLocalService(hostname)
  );
}

function normalizeBaseUrl(value: string): string {
  return new URL(value).origin;
}

const ollamaBaseUrlSchema = z
  .preprocess((value) => optionalString(value) ?? DEFAULT_BASE_URL, z.string().trim().min(1))
  .refine(isAllowedLocalOllamaUrl, {
    message:
      "OLLAMA_BASE_URL must use a loopback, localhost, private LAN, .local, or single-label local host.",
  })
  .transform(normalizeBaseUrl);

const ollamaKeepAliveSchema = z
  .preprocess(
    (value) => optionalString(value) ?? DEFAULT_KEEP_ALIVE,
    z.string().trim().min(1).max(80),
  )
  .refine((value) => keepAliveToMilliseconds(value) <= MAX_KEEP_ALIVE_MS, {
    message: "OLLAMA_KEEP_ALIVE must be 0 or a duration up to 24h, such as 30s, 5m, or 1h.",
  });

export const ollamaConfigSchema = z
  .object({
    OLLAMA_BASE_URL: ollamaBaseUrlSchema,
    OLLAMA_DEFAULT_MODEL: z.preprocess(optionalString, modelNameSchema.optional()),
    OLLAMA_TIMEOUT_MS: integerEnvironmentSchema(DEFAULT_TIMEOUT_MS, 1_000, 300_000),
    OLLAMA_KEEP_ALIVE: ollamaKeepAliveSchema,
    OLLAMA_ENABLED: booleanEnvironmentSchema(true),
  })
  .passthrough()
  .superRefine((env, context) => {
    if (env.OLLAMA_ENABLED && env.OLLAMA_DEFAULT_MODEL === undefined) {
      context.addIssue({
        code: "custom",
        path: ["OLLAMA_DEFAULT_MODEL"],
        message: "OLLAMA_DEFAULT_MODEL is required when OLLAMA_ENABLED=true.",
      });
    }
  })
  .transform((env) => ({
    enabled: env.OLLAMA_ENABLED,
    baseUrl: env.OLLAMA_BASE_URL,
    defaultModel: env.OLLAMA_DEFAULT_MODEL ?? null,
    timeoutMs: env.OLLAMA_TIMEOUT_MS,
    keepAlive: env.OLLAMA_KEEP_ALIVE,
  }));

export type OllamaConfig = z.infer<typeof ollamaConfigSchema>;

export function resolveOllamaConfig(
  input: Record<string, string | undefined> = process.env,
): OllamaConfig {
  return ollamaConfigSchema.parse(input);
}
