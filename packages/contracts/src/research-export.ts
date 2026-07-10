import { z } from "zod";
import { executionIdSchema, isoDateTimeSchema } from "./common.js";
import { researchReportIdSchema } from "./research.js";

export const researchExportFormatSchema = z.enum(["plain-text", "markdown", "json"]);

export const researchExportRequestSchema = z
  .object({
    reportId: researchReportIdSchema,
    format: researchExportFormatSchema,
  })
  .strict();

export const researchExportResultSchema = z
  .object({
    reportId: researchReportIdSchema,
    executionId: executionIdSchema,
    format: researchExportFormatSchema,
    content: z.string().max(500_000),
    contentType: z.string().max(120),
    generatedAt: isoDateTimeSchema,
  })
  .strict();

export const researchExportPlainTextInputSchema = z
  .object({
    reportId: z.string().trim().min(1),
    executionId: z.string().trim().min(1),
    question: z.string().trim().min(1),
    workspaceId: z.string().trim().min(1).nullable(),
    summaryText: z.string().trim().min(1),
    findings: z
      .array(
        z.object({
          title: z.string().trim().min(1),
          claimText: z.string().trim().min(1),
          confidence: z.number().finite().min(0).max(1),
          citationIds: z.array(z.string()).max(20),
        }),
      )
      .max(100),
    citations: z
      .array(
        z.object({
          citationId: z.string().trim().min(1),
          sourceId: z.string().trim().min(1),
          sourceTitle: z.string().trim().min(1),
          sourceUrl: z.string().trim().min(1),
          claimText: z.string().trim().min(1),
          sourceExcerpt: z.string().trim().min(1).nullable(),
        }),
      )
      .max(200),
    sources: z
      .array(
        z.object({
          id: z.string().trim().min(1),
          title: z.string().trim().min(1).nullable(),
          url: z.string().trim().min(1),
          finalUrl: z.string().trim().min(1).nullable(),
          relevanceScore: z.number().finite().min(0).max(1).nullable(),
          status: z.string().trim().min(1),
        }),
      )
      .max(50),
    warnings: z
      .array(
        z.object({
          code: z.string().trim().min(1),
          message: z.string().trim().min(1),
        }),
      )
      .max(50),
    limitations: z
      .array(
        z.object({
          code: z.string().trim().min(1),
          message: z.string().trim().min(1),
        }),
      )
      .max(50),
    completedAt: z.string().trim().min(1).nullable(),
    createdAt: z.string().trim().min(1),
  })
  .strict();

export type ResearchExportFormat = z.infer<typeof researchExportFormatSchema>;
export type ResearchExportRequest = z.infer<typeof researchExportRequestSchema>;
export type ResearchExportResult = z.infer<typeof researchExportResultSchema>;
export type ResearchExportPlainTextInput = z.infer<typeof researchExportPlainTextInputSchema>;
