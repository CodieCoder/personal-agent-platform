import {
  researchMemoryProposalModeSchema,
  researchReportIdSchema,
  researchReportStatusSchema,
  researchRequestSchema,
  workspaceIdSchema,
  z,
} from "@pap/contracts";

export const researchCapabilityInputSchema = researchRequestSchema;

export const researchMemoryProposalStatusSchema = z.enum([
  "not_requested",
  "not_eligible",
  "pending_review",
  "failed",
]);

export const researchCapabilityOutputSchema = z
  .object({
    reportId: researchReportIdSchema,
    workspaceId: workspaceIdSchema.nullable(),
    status: researchReportStatusSchema,
    sourceCount: z.number().int().nonnegative().max(50),
    citationCount: z.number().int().nonnegative().max(200),
    warningCount: z.number().int().nonnegative().max(50),
    memoryProposalMode: researchMemoryProposalModeSchema.nullable(),
    memoryProposalStatus: researchMemoryProposalStatusSchema,
    memoryProposalIds: z.array(z.string().min(3).max(200)).max(10).default([]),
  })
  .strict();

export type ResearchCapabilityInput = z.infer<typeof researchCapabilityInputSchema>;
export type ResearchCapabilityOutput = z.infer<typeof researchCapabilityOutputSchema>;
export type ResearchMemoryProposalStatus = z.infer<typeof researchMemoryProposalStatusSchema>;
