import { z } from "zod";
import { isoDateTimeSchema, workspaceIdSchema } from "./common.js";

export const workspaceStatusSchema = z.enum(["active", "archived"]);

export const workspaceNameSchema = z.string().trim().min(1).max(120);

export const workspaceDescriptionInputSchema = z.string().trim().max(2_000);

export const workspaceDescriptionSchema = workspaceDescriptionInputSchema.default("");

export const workspaceSchema = z
  .object({
    id: workspaceIdSchema,
    name: workspaceNameSchema,
    description: workspaceDescriptionSchema,
    status: workspaceStatusSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    archivedAt: isoDateTimeSchema.optional(),
  })
  .strict();

export const createWorkspaceRequestSchema = z
  .object({
    name: workspaceNameSchema,
    description: workspaceDescriptionSchema,
  })
  .strict();

export const updateWorkspaceRequestSchema = z
  .object({
    id: workspaceIdSchema,
    name: workspaceNameSchema.optional(),
    description: workspaceDescriptionInputSchema.optional(),
  })
  .strict()
  .refine((input) => input.name !== undefined || input.description !== undefined, {
    message: "At least one workspace field must be provided.",
  });

export const listWorkspacesRequestSchema = z
  .object({
    includeArchived: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .strict();

export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;
export type UpdateWorkspaceRequest = z.infer<typeof updateWorkspaceRequestSchema>;
export type ListWorkspacesRequest = z.infer<typeof listWorkspacesRequestSchema>;
