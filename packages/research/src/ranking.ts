import {
  researchScoreSchema,
  researchSourceIdSchema,
  z,
  type ResearchSourceId,
} from "@pap/contracts";

export const researchRelevanceLabelSchema = z.enum(["high", "medium", "low", "none"]);

export const researchSourceRankingItemSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    relevanceScore: researchScoreSchema,
    relevanceLabel: researchRelevanceLabelSchema,
    reason: z.string().trim().min(1).max(600),
    recommendedForSynthesis: z.boolean(),
  })
  .strict();

export const researchSourceRankingOutputSchema = z
  .object({
    rankings: z.array(researchSourceRankingItemSchema).min(1).max(15),
  })
  .strict()
  .superRefine((output, context) => {
    const seen = new Set<ResearchSourceId>();

    output.rankings.forEach((ranking, index) => {
      if (seen.has(ranking.sourceId)) {
        context.addIssue({
          code: "custom",
          message: "Research ranking output must not rank the same source twice.",
          path: ["rankings", index, "sourceId"],
        });
      }

      seen.add(ranking.sourceId);
    });
  });

export type ResearchRelevanceLabel = z.infer<typeof researchRelevanceLabelSchema>;
export type ResearchSourceRankingItem = z.infer<typeof researchSourceRankingItemSchema>;
export type ResearchSourceRankingOutput = z.infer<typeof researchSourceRankingOutputSchema>;

export function validateResearchSourceRankingOutput(input: {
  output: unknown;
  sourceIds: readonly ResearchSourceId[];
}): ResearchSourceRankingOutput {
  const parsed = researchSourceRankingOutputSchema.parse(input.output);
  const allowedSourceIds = new Set(input.sourceIds);

  for (const ranking of parsed.rankings) {
    if (!allowedSourceIds.has(ranking.sourceId)) {
      throw new ResearchRankingValidationError(
        "research_ranking_unknown_source",
        `Research ranking referenced unknown source '${ranking.sourceId}'.`,
      );
    }
  }

  return parsed;
}

export class ResearchRankingValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResearchRankingValidationError";
  }
}
