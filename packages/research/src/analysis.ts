import {
  researchAnalysisClaimSchema,
  researchConfidenceSchema,
  researchScoreSchema,
  researchSourceAnalysisSchema,
  researchSourceIdSchema,
  webEvidenceIdSchema,
  z,
  type ResearchSourceAnalysis,
  type ResearchSourceId,
  type WebEvidenceId,
} from "@pap/contracts";
import { stableResearchId } from "./ids.js";

export const researchArticleAnalysisClaimOutputSchema = z
  .object({
    claimText: z.string().trim().min(1).max(2_000),
    sourceExcerpt: z.string().trim().min(1).max(2_000).nullable().default(null),
    confidence: researchConfidenceSchema,
  })
  .strict();

export const researchArticleAnalysisOutputSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    summary: z.string().trim().min(1).max(8_000),
    claims: z.array(researchArticleAnalysisClaimOutputSchema).max(8).default([]),
    caveats: z.array(z.string().trim().min(1).max(1_000)).max(12).default([]),
    relevanceScore: researchScoreSchema,
    confidence: researchConfidenceSchema,
  })
  .strict();

export type ResearchArticleAnalysisOutput = z.infer<typeof researchArticleAnalysisOutputSchema>;

export function buildResearchSourceAnalysis(input: {
  sourceId: ResearchSourceId;
  evidenceId: WebEvidenceId;
  output: unknown;
  analyzedAt: string;
}): ResearchSourceAnalysis {
  const output = researchArticleAnalysisOutputSchema.parse(input.output);

  if (output.sourceId !== input.sourceId) {
    throw new ResearchAnalysisValidationError(
      "research_analysis_source_mismatch",
      `Research analysis referenced '${output.sourceId}' instead of '${input.sourceId}'.`,
    );
  }

  return researchSourceAnalysisSchema.parse({
    sourceId: input.sourceId,
    evidenceId: webEvidenceIdSchema.parse(input.evidenceId),
    summary: output.summary,
    claims: output.claims.map((claim, index) =>
      researchAnalysisClaimSchema.parse({
        claimId: stableResearchId("research_claim", {
          sourceId: input.sourceId,
          evidenceId: input.evidenceId,
          claimText: claim.claimText,
          index,
        }),
        claimText: claim.claimText,
        sourceExcerpt: claim.sourceExcerpt,
        confidence: claim.confidence,
      }),
    ),
    caveats: output.caveats,
    relevanceScore: output.relevanceScore,
    confidence: output.confidence,
    warnings: [],
    analyzedAt: input.analyzedAt,
  });
}

export class ResearchAnalysisValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResearchAnalysisValidationError";
  }
}
