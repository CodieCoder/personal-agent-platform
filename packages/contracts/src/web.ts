import { z } from "zod";
import { isoDateTimeSchema, opaqueIdentifierSchema } from "./common.js";

type WebUrl = {
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  toString(): string;
};

type WebUrlConstructor = {
  new (value: string): WebUrl;
};

const UrlConstructor = (globalThis as unknown as { URL: WebUrlConstructor }).URL;

export const fetchErrorKindSchema = z.enum([
  "fetch_url_invalid",
  "fetch_url_blocked",
  "fetch_timeout",
  "fetch_redirect_limit",
  "fetch_redirect_blocked",
  "fetch_http_error",
  "fetch_content_type_unsupported",
  "fetch_response_too_large",
  "fetch_network_error",
  "fetch_invalid_response",
]);

export const fetchAcceptedContentTypeSchema = z.enum([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
]);

export const fetchWarningCodeSchema = z.enum([
  "fetch_content_length_missing",
  "fetch_content_length_invalid",
  "fetch_redirect_followed",
]);

export const fetchUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .transform((value, context) => {
    let url: WebUrl;

    try {
      url = new UrlConstructor(value);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Fetch URL must be absolute.",
      });
      return z.NEVER;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "Fetch URL must use HTTP or HTTPS.",
      });
      return z.NEVER;
    }

    if (url.username !== "" || url.password !== "") {
      context.addIssue({
        code: "custom",
        message: "Fetch URL must not include credentials.",
      });
      return z.NEVER;
    }

    return url.toString();
  });

export const fetchTimeoutMsSchema = z.number().int().min(100).max(120_000);

export const fetchMaxBytesSchema = z.number().int().min(1).max(50_000_000);

export const fetchMaxRedirectsSchema = z.number().int().min(0).max(10);

export const fetchStatusCodeSchema = z.number().int().min(100).max(599);

export const fetchContentLengthSchema = z.number().int().nonnegative().max(50_000_000).nullable();

export const fetchRequestSchema = z
  .object({
    url: fetchUrlSchema,
    timeoutMs: fetchTimeoutMsSchema.nullable().default(null),
    maxBytes: fetchMaxBytesSchema.nullable().default(null),
    allowRedirects: z.boolean().nullable().default(null),
    maxRedirects: fetchMaxRedirectsSchema.nullable().default(null),
    acceptedContentTypes: z
      .array(fetchAcceptedContentTypeSchema)
      .min(1)
      .max(8)
      .nullable()
      .default(null),
    workspaceId: opaqueIdentifierSchema.nullable().default(null),
    sourceProfileId: opaqueIdentifierSchema.nullable().default(null),
  })
  .strict();

export const fetchRedirectSchema = z
  .object({
    fromUrl: fetchUrlSchema,
    toUrl: fetchUrlSchema,
    statusCode: fetchStatusCodeSchema,
  })
  .strict()
  .refine((redirect) => redirect.statusCode >= 300 && redirect.statusCode < 400, {
    message: "Redirect status code must be a 3xx response.",
    path: ["statusCode"],
  });

export const fetchWarningSchema = z
  .object({
    code: fetchWarningCodeSchema,
    message: z.string().trim().min(1).max(1_000),
    count: z.number().int().nonnegative().max(10_000).optional(),
  })
  .strict();

export const fetchMetadataSchema = z
  .object({
    timeoutMs: fetchTimeoutMsSchema,
    maxBytes: fetchMaxBytesSchema,
    allowRedirects: z.boolean(),
    maxRedirects: fetchMaxRedirectsSchema,
    acceptedContentTypes: z.array(fetchAcceptedContentTypeSchema).min(1).max(8),
    redirectCount: z.number().int().nonnegative().max(10),
    contentBytes: z.number().int().nonnegative().max(50_000_000),
    responseSizeKnown: z.boolean(),
  })
  .strict();

export const fetchResultSchema = z
  .object({
    requestedUrl: fetchUrlSchema,
    finalUrl: fetchUrlSchema,
    statusCode: fetchStatusCodeSchema,
    contentType: fetchAcceptedContentTypeSchema.nullable(),
    contentLength: fetchContentLengthSchema,
    html: z.string().max(50_000_000).nullable(),
    text: z.string().max(50_000_000).nullable(),
    redirects: z.array(fetchRedirectSchema).max(10),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema,
    durationMs: z.number().int().nonnegative().max(86_400_000),
    warnings: z.array(fetchWarningSchema).max(25).default([]),
    metadata: fetchMetadataSchema,
  })
  .strict()
  .refine((result) => Date.parse(result.startedAt) <= Date.parse(result.completedAt), {
    message: "Fetch completion cannot precede start.",
    path: ["completedAt"],
  })
  .refine((result) => (result.html === null) !== (result.text === null), {
    message: "Fetch result must include either HTML or plain text content.",
    path: ["html"],
  })
  .refine((result) => result.redirects.length === result.metadata.redirectCount, {
    message: "Fetch redirect metadata must match the redirect chain.",
    path: ["metadata", "redirectCount"],
  });

export const fetchErrorMetadataSchema = z
  .record(z.string().min(1).max(80), z.unknown())
  .refine((metadata) => Object.keys(metadata).length <= 25, {
    message: "Fetch error metadata may include at most 25 keys.",
  });

export const fetchErrorSchema = z
  .object({
    kind: fetchErrorKindSchema,
    url: fetchUrlSchema.optional(),
    statusCode: fetchStatusCodeSchema.optional(),
    message: z.string().trim().min(1).max(1_000),
    retryable: z.boolean().default(false),
    details: fetchErrorMetadataSchema.optional(),
  })
  .strict();

export type FetchErrorKind = z.infer<typeof fetchErrorKindSchema>;
export type FetchAcceptedContentType = z.infer<typeof fetchAcceptedContentTypeSchema>;
export type FetchWarningCode = z.infer<typeof fetchWarningCodeSchema>;
export type FetchUrl = z.infer<typeof fetchUrlSchema>;
export type FetchTimeoutMs = z.infer<typeof fetchTimeoutMsSchema>;
export type FetchMaxBytes = z.infer<typeof fetchMaxBytesSchema>;
export type FetchMaxRedirects = z.infer<typeof fetchMaxRedirectsSchema>;
export type FetchStatusCode = z.infer<typeof fetchStatusCodeSchema>;
export type FetchRequestInput = z.input<typeof fetchRequestSchema>;
export type FetchRequest = z.infer<typeof fetchRequestSchema>;
export type FetchRedirect = z.infer<typeof fetchRedirectSchema>;
export type FetchWarning = z.infer<typeof fetchWarningSchema>;
export type FetchMetadata = z.infer<typeof fetchMetadataSchema>;
export type FetchResult = z.infer<typeof fetchResultSchema>;
export type FetchErrorMetadata = z.infer<typeof fetchErrorMetadataSchema>;
export type FetchError = z.infer<typeof fetchErrorSchema>;
