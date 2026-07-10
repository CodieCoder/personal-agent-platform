import { z } from "zod";
import { isoDateTimeSchema, opaqueIdentifierSchema, workspaceIdSchema } from "./common.js";
import { researchReportIdSchema, researchSourceIdSchema } from "./research.js";

export const researchSourceFeedbackRatingSchema = z.enum(["useful", "neutral", "poor"]);
export const researchReportFeedbackRatingSchema = z.enum(["useful", "neutral", "poor"]);

const researchFeedbackReasonSchema = z.string().trim().min(1).max(500);
const researchFeedbackNotesSchema = z.string().trim().min(1).max(2_000);

const nullableWorkspaceIdSchema = workspaceIdSchema.nullable();

export const researchSourceFeedbackIdSchema = opaqueIdentifierSchema;

export const researchSourceFeedbackSchema = z
  .object({
    id: researchSourceFeedbackIdSchema,
    workspaceId: nullableWorkspaceIdSchema,
    reportId: researchReportIdSchema,
    sourceId: researchSourceIdSchema,
    rating: researchSourceFeedbackRatingSchema,
    helpful: z.boolean(),
    reason: researchFeedbackReasonSchema.nullable(),
    notes: researchFeedbackNotesSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const createResearchSourceFeedbackInputSchema = z
  .object({
    workspaceId: nullableWorkspaceIdSchema.default(null),
    reportId: researchReportIdSchema,
    sourceId: researchSourceIdSchema,
    rating: researchSourceFeedbackRatingSchema,
    helpful: z.boolean().default(false),
    reason: researchFeedbackReasonSchema.nullable().default(null),
    notes: researchFeedbackNotesSchema.nullable().default(null),
  })
  .strict();

export const updateResearchSourceFeedbackInputSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    workspaceId: nullableWorkspaceIdSchema.default(null),
    rating: researchSourceFeedbackRatingSchema.optional(),
    helpful: z.boolean().optional(),
    reason: researchFeedbackReasonSchema.nullable().optional(),
    notes: researchFeedbackNotesSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.rating !== undefined ||
      input.helpful !== undefined ||
      input.reason !== undefined ||
      input.notes !== undefined,
    {
      message: "At least one feedback field must be provided for update.",
    },
  );

export const deleteResearchSourceFeedbackInputSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    workspaceId: nullableWorkspaceIdSchema.default(null),
  })
  .strict();

export const researchReportFeedbackSchema = z
  .object({
    reportId: researchReportIdSchema,
    workspaceId: nullableWorkspaceIdSchema,
    rating: researchReportFeedbackRatingSchema,
    useful: z.boolean(),
    reason: researchFeedbackReasonSchema.nullable(),
    notes: researchFeedbackNotesSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const upsertResearchReportFeedbackInputSchema = z
  .object({
    reportId: researchReportIdSchema,
    workspaceId: nullableWorkspaceIdSchema.default(null),
    rating: researchReportFeedbackRatingSchema,
    useful: z.boolean().default(false),
    reason: researchFeedbackReasonSchema.nullable().default(null),
    notes: researchFeedbackNotesSchema.nullable().default(null),
  })
  .strict();

export const getResearchSourceFeedbackBySourceInputSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    workspaceId: nullableWorkspaceIdSchema.default(null),
  })
  .strict();

export const listResearchSourceFeedbackByReportInputSchema = z
  .object({
    reportId: researchReportIdSchema,
    workspaceId: nullableWorkspaceIdSchema.default(null),
  })
  .strict();

export const getResearchReportFeedbackInputSchema = z
  .object({
    reportId: researchReportIdSchema,
    workspaceId: nullableWorkspaceIdSchema.default(null),
  })
  .strict();

export type ResearchSourceFeedbackRating = z.infer<typeof researchSourceFeedbackRatingSchema>;
export type ResearchReportFeedbackRating = z.infer<typeof researchReportFeedbackRatingSchema>;
export type ResearchSourceFeedbackId = z.infer<typeof researchSourceFeedbackIdSchema>;
export type ResearchSourceFeedback = z.infer<typeof researchSourceFeedbackSchema>;
export type CreateResearchSourceFeedbackInput = z.infer<
  typeof createResearchSourceFeedbackInputSchema
>;
export type UpdateResearchSourceFeedbackInput = z.infer<
  typeof updateResearchSourceFeedbackInputSchema
>;
export type DeleteResearchSourceFeedbackInput = z.infer<
  typeof deleteResearchSourceFeedbackInputSchema
>;
export type ResearchReportFeedback = z.infer<typeof researchReportFeedbackSchema>;
export type UpsertResearchReportFeedbackInput = z.infer<
  typeof upsertResearchReportFeedbackInputSchema
>;
export type GetResearchSourceFeedbackBySourceInput = z.infer<
  typeof getResearchSourceFeedbackBySourceInputSchema
>;
export type ListResearchSourceFeedbackByReportInput = z.infer<
  typeof listResearchSourceFeedbackByReportInputSchema
>;
export type GetResearchReportFeedbackInput = z.infer<typeof getResearchReportFeedbackInputSchema>;
