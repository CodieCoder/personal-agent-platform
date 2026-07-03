import { searchLanguageSchema, searchSafeSearchSchema } from "@pap/contracts";
import { z } from "zod";

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LANGUAGE = "en";
const DEFAULT_SAFESEARCH = 1;

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

function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase();

  if (lower.startsWith("[") && lower.endsWith("]")) {
    return lower.slice(1, -1);
  }

  return lower;
}

function isLoopbackIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  return parts[0] === 127;
}

function isAllowedLoopbackSearxngUrl(value: string): boolean {
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

  return hostname === "localhost" || hostname === "::1" || isLoopbackIpv4(hostname);
}

function normalizeBaseUrl(value: string): string {
  return new URL(value).origin;
}

const searxngBaseUrlSchema = z
  .preprocess((value) => optionalString(value) ?? DEFAULT_BASE_URL, z.string().trim().min(1))
  .refine(isAllowedLoopbackSearxngUrl, {
    message:
      "SEARXNG_BASE_URL must use a loopback HTTP(S) origin without credentials, path, query, or hash.",
  })
  .transform(normalizeBaseUrl);

export const searxngConfigSchema = z
  .object({
    SEARXNG_BASE_URL: searxngBaseUrlSchema,
    SEARXNG_TIMEOUT_MS: integerEnvironmentSchema(DEFAULT_TIMEOUT_MS, 1_000, 60_000),
    SEARXNG_ENABLED: booleanEnvironmentSchema(true),
    SEARXNG_DEFAULT_LANGUAGE: z.preprocess(
      (value) => optionalString(value) ?? DEFAULT_LANGUAGE,
      searchLanguageSchema,
    ),
    SEARXNG_DEFAULT_SAFESEARCH: z.preprocess(
      (value) => optionalString(value) ?? DEFAULT_SAFESEARCH,
      z.coerce.number().pipe(searchSafeSearchSchema),
    ),
  })
  .passthrough()
  .transform((env) => ({
    enabled: env.SEARXNG_ENABLED,
    baseUrl: env.SEARXNG_BASE_URL,
    timeoutMs: env.SEARXNG_TIMEOUT_MS,
    defaultLanguage: env.SEARXNG_DEFAULT_LANGUAGE,
    defaultSafesearch: env.SEARXNG_DEFAULT_SAFESEARCH,
  }));

export type SearxngConfig = z.infer<typeof searxngConfigSchema>;

export function resolveSearxngConfig(
  input: Record<string, string | undefined> = process.env,
): SearxngConfig {
  return searxngConfigSchema.parse(input);
}
