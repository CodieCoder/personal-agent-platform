import { z } from "zod";
import { isoDateTimeSchema, opaqueIdentifierSchema } from "./common.js";

export const sourceProfileIdSchema = opaqueIdentifierSchema;

export const sourceProfileStatusSchema = z.enum(["active", "archived"]);

export const sourceProfileDomainSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .transform((value, context) => {
    const normalized = value.toLowerCase().replace(/\.$/u, "");

    if (
      normalized.includes("/") ||
      normalized.includes(":") ||
      normalized.includes("@") ||
      normalized.includes("[") ||
      normalized.includes("]")
    ) {
      context.addIssue({
        code: "custom",
        message: "Source profile domain must be a hostname, not a URL.",
      });
      return z.NEVER;
    }

    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(normalized)) {
      context.addIssue({
        code: "custom",
        message: "Source profile domain contains unsupported hostname characters.",
      });
      return z.NEVER;
    }

    if (
      normalized.split(".").some((label) => label.length === 0 || label.length > 63) ||
      !normalized.includes(".")
    ) {
      context.addIssue({
        code: "custom",
        message: "Source profile domain must be a fully-qualified hostname.",
      });
      return z.NEVER;
    }

    return normalized;
  });

export const sourceProfileNameSchema = z.string().trim().min(1).max(200);

export const sourceProfileSelectorSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((selector) => !/[{};]/u.test(selector), {
    message: "Source profile selectors must be CSS selector strings, not declarations.",
  });

export const sourceProfileNotesSchema = z.string().trim().max(5_000);

export const sourceProfileSchema = z
  .object({
    id: sourceProfileIdSchema,
    domain: sourceProfileDomainSchema,
    name: sourceProfileNameSchema,
    status: sourceProfileStatusSchema,
    articleContainerSelector: sourceProfileSelectorSchema.nullable(),
    titleSelector: sourceProfileSelectorSchema.nullable(),
    bylineSelector: sourceProfileSelectorSchema.nullable(),
    publishedAtSelector: sourceProfileSelectorSchema.nullable(),
    contentSelector: sourceProfileSelectorSchema.nullable(),
    canonicalUrlSelector: sourceProfileSelectorSchema.nullable(),
    notes: sourceProfileNotesSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    archivedAt: isoDateTimeSchema.nullable(),
  })
  .strict()
  .refine((profile) => profile.status === "archived" || profile.archivedAt === null, {
    message: "Active source profiles must not include archivedAt.",
    path: ["archivedAt"],
  })
  .refine((profile) => profile.status === "active" || profile.archivedAt !== null, {
    message: "Archived source profiles must include archivedAt.",
    path: ["archivedAt"],
  });

export const createSourceProfileRequestSchema = z
  .object({
    domain: sourceProfileDomainSchema,
    name: sourceProfileNameSchema,
    articleContainerSelector: sourceProfileSelectorSchema.nullable().default(null),
    titleSelector: sourceProfileSelectorSchema.nullable().default(null),
    bylineSelector: sourceProfileSelectorSchema.nullable().default(null),
    publishedAtSelector: sourceProfileSelectorSchema.nullable().default(null),
    contentSelector: sourceProfileSelectorSchema.nullable().default(null),
    canonicalUrlSelector: sourceProfileSelectorSchema.nullable().default(null),
    notes: sourceProfileNotesSchema.nullable().default(null),
  })
  .strict();

export const updateSourceProfileRequestSchema = z
  .object({
    id: sourceProfileIdSchema,
    domain: sourceProfileDomainSchema.optional(),
    name: sourceProfileNameSchema.optional(),
    articleContainerSelector: sourceProfileSelectorSchema.nullable().optional(),
    titleSelector: sourceProfileSelectorSchema.nullable().optional(),
    bylineSelector: sourceProfileSelectorSchema.nullable().optional(),
    publishedAtSelector: sourceProfileSelectorSchema.nullable().optional(),
    contentSelector: sourceProfileSelectorSchema.nullable().optional(),
    canonicalUrlSelector: sourceProfileSelectorSchema.nullable().optional(),
    notes: sourceProfileNotesSchema.nullable().optional(),
  })
  .strict();

export const listSourceProfilesQuerySchema = z
  .object({
    includeArchived: z.boolean().default(false),
    domain: sourceProfileDomainSchema.optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export type SourceProfileId = z.infer<typeof sourceProfileIdSchema>;
export type SourceProfileStatus = z.infer<typeof sourceProfileStatusSchema>;
export type SourceProfileDomain = z.infer<typeof sourceProfileDomainSchema>;
export type SourceProfileSelector = z.infer<typeof sourceProfileSelectorSchema>;
export type SourceProfile = z.infer<typeof sourceProfileSchema>;
export type CreateSourceProfileRequestInput = z.input<typeof createSourceProfileRequestSchema>;
export type CreateSourceProfileRequest = z.infer<typeof createSourceProfileRequestSchema>;
export type UpdateSourceProfileRequestInput = z.input<typeof updateSourceProfileRequestSchema>;
export type UpdateSourceProfileRequest = z.infer<typeof updateSourceProfileRequestSchema>;
export type ListSourceProfilesQueryInput = z.input<typeof listSourceProfilesQuerySchema>;
export type ListSourceProfilesQuery = z.infer<typeof listSourceProfilesQuerySchema>;
