import { z } from "zod";

export const platformErrorCategorySchema = z.enum([
  "validation",
  "permission",
  "approval",
  "tool",
  "llm",
  "memory",
  "storage",
  "network",
  "capability",
  "unknown",
]);

export const platformErrorCodeSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Z][A-Z0-9_]*$/u, {
    message: "Use uppercase error codes such as CAPABILITY_NOT_FOUND.",
  });

export const platformErrorSchema = z
  .object({
    code: platformErrorCodeSchema,
    message: z.string().min(1),
    category: platformErrorCategorySchema,
    retryable: z.boolean().default(false),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type PlatformErrorCategory = z.infer<typeof platformErrorCategorySchema>;
export type PlatformError = z.infer<typeof platformErrorSchema>;

export function parsePlatformError(input: unknown): PlatformError {
  return platformErrorSchema.parse(input);
}
