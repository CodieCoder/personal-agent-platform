import { z } from "zod";
import { executionIdSchema, workspaceIdSchema } from "./common.js";
import { researchReportIdSchema } from "./research.js";

export const researchExportFormatSchema = z.enum(["plain-text", "markdown", "json"]);

export const researchExportContentSchema = z.string().max(500_000);

export const researchExportMimeTypeSchema = z.enum([
  "text/plain; charset=utf-8",
  "text/markdown; charset=utf-8",
  "application/json; charset=utf-8",
]);

export const researchExportFilenameSchema = z
  .string()
  .min(1)
  .max(260)
  .regex(/^research-[A-Za-z0-9._-]+-\d{4}-\d{2}-\d{2}\.(?:txt|md|json)$/u);

export const researchExportRequestSchema = z
  .object({
    reportId: researchReportIdSchema,
    workspaceId: workspaceIdSchema.nullable().default(null),
    format: researchExportFormatSchema,
  })
  .strict();

export const researchExportResultSchema = z
  .object({
    reportId: researchReportIdSchema,
    executionId: executionIdSchema,
    format: researchExportFormatSchema,
    content: researchExportContentSchema,
    filename: researchExportFilenameSchema,
    mimeType: researchExportMimeTypeSchema,
  })
  .strict()
  .superRefine((result, context) => {
    const expected = exportMetadataByFormat[result.format];

    if (!result.filename.endsWith(expected.extension)) {
      context.addIssue({
        code: "custom",
        message: `Research ${result.format} exports must use the ${expected.extension} extension.`,
        path: ["filename"],
      });
    }

    if (result.mimeType !== expected.mimeType) {
      context.addIssue({
        code: "custom",
        message: `Research ${result.format} exports must use the expected MIME type.`,
        path: ["mimeType"],
      });
    }
  });

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

const exportMetadataByFormat = {
  "plain-text": {
    extension: ".txt",
    mimeType: "text/plain; charset=utf-8",
  },
  markdown: {
    extension: ".md",
    mimeType: "text/markdown; charset=utf-8",
  },
  json: {
    extension: ".json",
    mimeType: "application/json; charset=utf-8",
  },
} as const satisfies Record<
  ResearchExportFormat,
  { extension: string; mimeType: z.infer<typeof researchExportMimeTypeSchema> }
>;
