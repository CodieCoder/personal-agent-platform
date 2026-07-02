import { z } from "zod";
import { isoDateTimeSchema, stableIdentifierSchema } from "./common.js";

export const providerIdSchema = stableIdentifierSchema;

export const aiProviderKindSchema = z.enum(["ollama"]);

export const providerHealthStatusSchema = z.enum([
  "healthy",
  "degraded",
  "unavailable",
  "disabled",
  "unknown",
]);

export const providerErrorKindSchema = z.enum([
  "provider_unavailable",
  "provider_timeout",
  "provider_overloaded",
  "provider_http_error",
  "provider_invalid_response",
  "provider_schema_invalid",
  "provider_disabled",
]);

export const modelNameSchema = z.string().trim().min(1).max(200);

export const modelPromptSchema = z
  .string()
  .min(1)
  .max(32_000)
  .refine((value) => value.trim().length > 0, {
    message: "Prompt must include non-whitespace content.",
  });

export const modelSystemPromptSchema = z
  .string()
  .min(1)
  .max(16_000)
  .refine((value) => value.trim().length > 0, {
    message: "System prompt must include non-whitespace content.",
  });

export const modelTemperatureSchema = z.number().min(0).max(2);

export const modelMaxTokensSchema = z.number().int().min(1).max(128_000);

export const modelTimeoutMsSchema = z.number().int().min(100).max(300_000);

export const modelKeepAliveSchema = z.string().trim().min(1).max(80);

export const providerMetadataSchema = z
  .record(z.string().min(1).max(80), z.unknown())
  .refine((metadata) => Object.keys(metadata).length <= 25, {
    message: "Metadata may include at most 25 keys.",
  });

export const zodSchemaReferenceSchema = z.custom<z.ZodType<unknown>>(
  (value): value is z.ZodType<unknown> =>
    typeof value === "object" &&
    value !== null &&
    "safeParse" in value &&
    typeof (value as { safeParse?: unknown }).safeParse === "function",
  {
    message: "Expected an in-process Zod schema reference.",
  },
);

export const responseSchemaReferenceSchema = z
  .object({
    id: stableIdentifierSchema,
    description: z.string().trim().min(1).max(1_000).optional(),
    schema: zodSchemaReferenceSchema,
  })
  .strict();

export const modelTimingMetadataSchema = z
  .object({
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema,
    durationMs: z.number().int().nonnegative().max(86_400_000),
  })
  .strict();

export const modelUsageMetadataSchema = z
  .object({
    promptTokenCount: z.number().int().nonnegative().nullable(),
    completionTokenCount: z.number().int().nonnegative().nullable(),
    totalTokenCount: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const providerHealthSchema = z
  .object({
    providerId: providerIdSchema,
    kind: aiProviderKindSchema,
    status: providerHealthStatusSchema,
    checkedAt: isoDateTimeSchema,
    message: z.string().trim().min(1).max(1_000).optional(),
    model: modelNameSchema.optional(),
    metadata: providerMetadataSchema.optional(),
  })
  .strict();

export const providerErrorSchema = z
  .object({
    kind: providerErrorKindSchema,
    providerId: providerIdSchema.optional(),
    model: modelNameSchema.optional(),
    message: z.string().trim().min(1).max(1_000),
    retryable: z.boolean().default(false),
    details: providerMetadataSchema.optional(),
  })
  .strict();

export const structuredGenerationRequestSchema = z
  .object({
    providerId: providerIdSchema,
    model: modelNameSchema,
    systemPrompt: modelSystemPromptSchema.nullable(),
    prompt: modelPromptSchema,
    responseSchema: responseSchemaReferenceSchema,
    temperature: modelTemperatureSchema.nullable(),
    maxTokens: modelMaxTokensSchema.nullable(),
    timeoutMs: modelTimeoutMsSchema,
    keepAlive: modelKeepAliveSchema.nullable(),
    metadata: providerMetadataSchema.nullable(),
  })
  .strict();

export const structuredGenerationResultSchema = z
  .object({
    providerId: providerIdSchema,
    model: modelNameSchema,
    output: z.unknown(),
    rawText: z.string().max(256_000).nullable(),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema,
    durationMs: z.number().int().nonnegative().max(86_400_000),
    promptTokenCount: z.number().int().nonnegative().nullable(),
    completionTokenCount: z.number().int().nonnegative().nullable(),
    totalTokenCount: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .refine((result) => Date.parse(result.startedAt) <= Date.parse(result.completedAt), {
    message: "Generation completion cannot precede start.",
    path: ["completedAt"],
  });

export type ProviderId = z.infer<typeof providerIdSchema>;
export type AIProviderKind = z.infer<typeof aiProviderKindSchema>;
export type ProviderHealthStatus = z.infer<typeof providerHealthStatusSchema>;
export type ProviderErrorKind = z.infer<typeof providerErrorKindSchema>;
export type ModelName = z.infer<typeof modelNameSchema>;
export type ProviderMetadata = z.infer<typeof providerMetadataSchema>;
export type ResponseSchemaReference = z.infer<typeof responseSchemaReferenceSchema>;
export type ModelTimingMetadata = z.infer<typeof modelTimingMetadataSchema>;
export type ModelUsageMetadata = z.infer<typeof modelUsageMetadataSchema>;
export type ProviderHealth = z.infer<typeof providerHealthSchema>;
export type ProviderError = z.infer<typeof providerErrorSchema>;
export type StructuredGenerationRequest = z.infer<typeof structuredGenerationRequestSchema>;
export type StructuredGenerationResult = z.infer<typeof structuredGenerationResultSchema>;
