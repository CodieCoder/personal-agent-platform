import {
  fetchAcceptedContentTypeSchema,
  fetchRequestSchema,
  fetchResultSchema,
  type FetchAcceptedContentType,
  type FetchMaxBytes,
  type FetchMaxRedirects,
  type FetchRequest,
  type FetchRequestInput,
  type FetchResult,
  type FetchTimeoutMs,
  type FetchUrl,
  type FetchWarning,
} from "@pap/contracts";
import type { z } from "zod";
import { FetchClientError, isFetchClientError } from "./errors.js";
import { createUrlSafetyPolicy, type UrlSafetyPolicy } from "./fetch-policy.js";

export type WebFetchTransport = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type FetchClientDefaults = {
  timeoutMs?: FetchTimeoutMs;
  maxBytes?: FetchMaxBytes;
  allowRedirects?: boolean;
  maxRedirects?: FetchMaxRedirects;
  acceptedContentTypes?: FetchAcceptedContentType[];
};

export type GuardedFetchClientOptions = {
  fetch?: WebFetchTransport;
  policy?: UrlSafetyPolicy;
  clock?: () => Date;
  defaults?: FetchClientDefaults;
};

export interface GuardedFetchClient {
  fetch(request: FetchRequestInput): Promise<FetchResult>;
}

type ResolvedFetchOptions = {
  timeoutMs: FetchTimeoutMs;
  maxBytes: FetchMaxBytes;
  allowRedirects: boolean;
  maxRedirects: FetchMaxRedirects;
  acceptedContentTypes: FetchAcceptedContentType[];
};

type FetchExecutionContext = {
  requestedUrl: FetchUrl;
  currentUrl: FetchUrl;
  startedAt: string;
  controller: AbortController;
  options: ResolvedFetchOptions;
  redirects: {
    fromUrl: FetchUrl;
    toUrl: FetchUrl;
    statusCode: number;
  }[];
  warnings: FetchWarning[];
};

const defaultAcceptedContentTypes: FetchAcceptedContentType[] = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
];

const defaultOptions: ResolvedFetchOptions = {
  timeoutMs: 15_000,
  maxBytes: 1_000_000,
  allowRedirects: true,
  maxRedirects: 5,
  acceptedContentTypes: defaultAcceptedContentTypes,
};

export function createGuardedFetchClient(
  options: GuardedFetchClientOptions = {},
): GuardedFetchClient {
  const fetchTransport = options.fetch ?? fetch;
  const policy = options.policy ?? createUrlSafetyPolicy();
  const clock = options.clock ?? (() => new Date());
  const defaults = resolveDefaultOptions(options.defaults);

  return {
    async fetch(requestInput) {
      const request = parseFetchRequest(requestInput);
      const resolvedOptions = resolveRequestOptions(request, defaults);
      const startedAt = clock().toISOString();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), resolvedOptions.timeoutMs);

      try {
        const requestedUrl = await policy.validateUrl(request.url, { phase: "request" });
        return await fetchWithRedirects({
          fetchTransport,
          policy,
          clock,
          context: {
            requestedUrl,
            currentUrl: requestedUrl,
            startedAt,
            controller,
            options: resolvedOptions,
            redirects: [],
            warnings: [],
          },
        });
      } catch (error) {
        if (isFetchClientError(error)) {
          throw error;
        }

        throw normalizeTransportError(error, controller.signal.aborted);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

async function fetchWithRedirects({
  fetchTransport,
  policy,
  clock,
  context,
}: {
  fetchTransport: WebFetchTransport;
  policy: UrlSafetyPolicy;
  clock: () => Date;
  context: FetchExecutionContext;
}): Promise<FetchResult> {
  while (true) {
    const response = await fetchTransport(context.currentUrl, {
      method: "GET",
      headers: {
        accept: buildAcceptHeader(context.options.acceptedContentTypes),
      },
      redirect: "manual",
      signal: context.controller.signal,
    });

    assertValidResponse(response, context.currentUrl);

    if (isRedirectStatus(response.status)) {
      const redirectTarget = response.headers.get("location");

      if (redirectTarget === null || redirectTarget.trim().length === 0) {
        throw new FetchClientError({
          code: "fetch_invalid_response",
          url: context.currentUrl,
          statusCode: response.status,
          message: "Redirect response did not include a Location header.",
        });
      }

      if (
        !context.options.allowRedirects ||
        context.redirects.length >= context.options.maxRedirects
      ) {
        throw new FetchClientError({
          code: "fetch_redirect_limit",
          url: context.currentUrl,
          statusCode: response.status,
          message: "Fetch redirect limit was reached.",
          details: { maxRedirects: context.options.maxRedirects },
        });
      }

      const nextUrl = resolveRedirectUrl(redirectTarget, context.currentUrl, response.status);
      const validatedRedirectUrl = await policy.validateUrl(nextUrl, {
        phase: "redirect",
        fromUrl: context.currentUrl,
      });

      context.redirects.push({
        fromUrl: context.currentUrl,
        toUrl: validatedRedirectUrl,
        statusCode: response.status,
      });
      context.warnings.push({
        code: "fetch_redirect_followed",
        message: "Fetch followed an HTTP redirect after revalidating the target URL.",
        count: context.redirects.length,
      });
      context.currentUrl = validatedRedirectUrl;
      continue;
    }

    return readFinalResponse(response, context, clock);
  }
}

async function readFinalResponse(
  response: Response,
  context: FetchExecutionContext,
  clock: () => Date,
): Promise<FetchResult> {
  if (!response.ok) {
    throw new FetchClientError({
      code: "fetch_http_error",
      url: context.currentUrl,
      statusCode: response.status,
      retryable: response.status >= 500,
      message: "Fetch target returned an HTTP error.",
      details: { httpStatus: response.status },
    });
  }

  const rawContentType = response.headers.get("content-type");
  const contentType = normalizeContentType(rawContentType);

  if (contentType === null || !context.options.acceptedContentTypes.includes(contentType)) {
    throw new FetchClientError({
      code: "fetch_content_type_unsupported",
      url: context.currentUrl,
      statusCode: response.status,
      message: "Fetch target returned an unsupported content type.",
      details: { contentType: rawContentType ?? null },
    });
  }

  const contentLength = parseContentLength(response.headers.get("content-length"));

  if (contentLength.kind === "known" && contentLength.value > context.options.maxBytes) {
    throw new FetchClientError({
      code: "fetch_response_too_large",
      url: context.currentUrl,
      statusCode: response.status,
      message: "Fetch response body exceeds the configured byte limit.",
      details: {
        contentLength: contentLength.value,
        maxBytes: context.options.maxBytes,
      },
    });
  }

  if (contentLength.kind === "missing") {
    context.warnings.push({
      code: "fetch_content_length_missing",
      message: "Fetch response did not include a Content-Length header.",
    });
  }

  if (contentLength.kind === "invalid") {
    context.warnings.push({
      code: "fetch_content_length_invalid",
      message: "Fetch response included an invalid Content-Length header.",
    });
  }

  const body = await readBoundedBody(response, context);
  const completedAt = clock().toISOString();

  return fetchResultSchema.parse({
    requestedUrl: context.requestedUrl,
    finalUrl: context.currentUrl,
    statusCode: response.status,
    contentType,
    contentLength: contentLength.kind === "known" ? contentLength.value : null,
    html: contentType === "text/html" || contentType === "application/xhtml+xml" ? body.text : null,
    text: contentType === "text/plain" ? body.text : null,
    redirects: context.redirects,
    startedAt: context.startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(context.startedAt)),
    warnings: context.warnings,
    metadata: {
      timeoutMs: context.options.timeoutMs,
      maxBytes: context.options.maxBytes,
      allowRedirects: context.options.allowRedirects,
      maxRedirects: context.options.maxRedirects,
      acceptedContentTypes: context.options.acceptedContentTypes,
      redirectCount: context.redirects.length,
      contentBytes: body.byteLength,
      responseSizeKnown: contentLength.kind === "known",
    },
  });
}

async function readBoundedBody(
  response: Response,
  context: FetchExecutionContext,
): Promise<{ text: string; byteLength: number }> {
  if (response.body !== null && typeof response.body.getReader === "function") {
    return readBoundedStream(response.body, context);
  }

  if (typeof response.arrayBuffer !== "function") {
    throw new FetchClientError({
      code: "fetch_invalid_response",
      url: context.currentUrl,
      statusCode: response.status,
      message: "Fetch transport returned a response without a readable body.",
    });
  }

  const body = new Uint8Array(await response.arrayBuffer());

  if (body.byteLength > context.options.maxBytes) {
    throw responseTooLargeError(context, response.status, body.byteLength);
  }

  return {
    text: new TextDecoder().decode(body),
    byteLength: body.byteLength,
  };
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  context: FetchExecutionContext,
): Promise<{ text: string; byteLength: number }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      if (chunk.value === undefined) {
        continue;
      }

      byteLength += chunk.value.byteLength;

      if (byteLength > context.options.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw responseTooLargeError(context, undefined, byteLength);
      }

      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = concatChunks(chunks, byteLength);

  return {
    text: new TextDecoder().decode(body),
    byteLength,
  };
}

function parseFetchRequest(requestInput: FetchRequestInput): FetchRequest {
  const parsed = fetchRequestSchema.safeParse(requestInput);

  if (!parsed.success) {
    throw new FetchClientError({
      code: "fetch_url_invalid",
      message: "Fetch request did not match the fetch request contract.",
      details: {
        issues: summarizeZodIssues(parsed.error),
      },
    });
  }

  return parsed.data;
}

function resolveDefaultOptions(defaults: FetchClientDefaults | undefined): ResolvedFetchOptions {
  return {
    timeoutMs: defaults?.timeoutMs ?? defaultOptions.timeoutMs,
    maxBytes: defaults?.maxBytes ?? defaultOptions.maxBytes,
    allowRedirects: defaults?.allowRedirects ?? defaultOptions.allowRedirects,
    maxRedirects: defaults?.maxRedirects ?? defaultOptions.maxRedirects,
    acceptedContentTypes: defaults?.acceptedContentTypes ?? defaultOptions.acceptedContentTypes,
  };
}

function resolveRequestOptions(
  request: FetchRequest,
  defaults: ResolvedFetchOptions,
): ResolvedFetchOptions {
  return {
    timeoutMs: request.timeoutMs ?? defaults.timeoutMs,
    maxBytes: request.maxBytes ?? defaults.maxBytes,
    allowRedirects: request.allowRedirects ?? defaults.allowRedirects,
    maxRedirects: request.maxRedirects ?? defaults.maxRedirects,
    acceptedContentTypes: request.acceptedContentTypes ?? defaults.acceptedContentTypes,
  };
}

function assertValidResponse(response: Response, url: FetchUrl): void {
  if (
    typeof response !== "object" ||
    response === null ||
    typeof response.status !== "number" ||
    typeof response.ok !== "boolean" ||
    typeof response.headers !== "object" ||
    response.headers === null ||
    typeof response.headers.get !== "function"
  ) {
    throw new FetchClientError({
      code: "fetch_invalid_response",
      url,
      message: "Fetch transport returned an invalid response object.",
    });
  }

  if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) {
    throw new FetchClientError({
      code: "fetch_invalid_response",
      url,
      message: "Fetch transport returned an invalid response status.",
    });
  }
}

function isRedirectStatus(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode);
}

function resolveRedirectUrl(location: string, baseUrl: FetchUrl, statusCode: number): string {
  try {
    return new URL(location, baseUrl).toString();
  } catch (error) {
    throw new FetchClientError({
      code: "fetch_redirect_blocked",
      url: baseUrl,
      statusCode,
      message: "Redirect response included an invalid Location header.",
      details: { reason: "invalid_location" },
      cause: error,
    });
  }
}

function normalizeContentType(value: string | null): FetchAcceptedContentType | null {
  if (value === null) {
    return null;
  }

  const mimeType = value.split(";")[0]?.trim().toLowerCase();

  if (mimeType === undefined || mimeType.length === 0) {
    return null;
  }

  const parsed = fetchAcceptedContentTypeSchema.safeParse(mimeType);
  return parsed.success ? parsed.data : null;
}

function parseContentLength(
  value: string | null,
): { kind: "known"; value: number } | { kind: "missing" } | { kind: "invalid" } {
  if (value === null) {
    return { kind: "missing" };
  }

  if (!/^\d+$/u.test(value.trim())) {
    return { kind: "invalid" };
  }

  const length = Number.parseInt(value.trim(), 10);

  return Number.isSafeInteger(length) ? { kind: "known", value: length } : { kind: "invalid" };
}

function buildAcceptHeader(contentTypes: FetchAcceptedContentType[]): string {
  return contentTypes
    .map((contentType, index) => (index === 0 ? contentType : `${contentType};q=0.9`))
    .join(", ");
}

function concatChunks(chunks: Uint8Array[], byteLength: number): Uint8Array {
  const output = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function responseTooLargeError(
  context: FetchExecutionContext,
  statusCode: number | undefined,
  observedBytes: number,
): FetchClientError {
  return new FetchClientError({
    code: "fetch_response_too_large",
    url: context.currentUrl,
    ...(statusCode === undefined ? {} : { statusCode }),
    message: "Fetch response body exceeds the configured byte limit.",
    details: {
      observedBytes,
      maxBytes: context.options.maxBytes,
    },
  });
}

function normalizeTransportError(error: unknown, aborted: boolean): FetchClientError {
  if (aborted || getErrorName(error) === "AbortError" || getErrorCode(error) === "ETIMEDOUT") {
    return new FetchClientError({
      code: "fetch_timeout",
      retryable: true,
      message: "Fetch request timed out.",
    });
  }

  return new FetchClientError({
    code: "fetch_network_error",
    retryable: true,
    message: "Fetch request failed before a valid HTTP response was available.",
  });
}

function getErrorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return undefined;
  }

  return typeof error.name === "string" ? error.name : undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error) {
    return getErrorCode(error.cause);
  }

  return undefined;
}

function summarizeZodIssues(error: z.ZodError): Record<string, unknown>[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
