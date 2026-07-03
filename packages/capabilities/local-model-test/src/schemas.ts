import { modelNameSchema, providerIdSchema, workspaceIdSchema, z } from "@pap/contracts";

export const localModelTestInputSchema = z
  .object({
    prompt: z.string().trim().min(1, "Prompt cannot be empty.").max(4_000),
    workspaceId: workspaceIdSchema.nullable().optional(),
    model: modelNameSchema.nullable().optional(),
  })
  .strict();

export const localModelTestModelOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(600),
    keyPoints: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const localModelTestOutputSchema = localModelTestModelOutputSchema
  .extend({
    provider: providerIdSchema,
    model: modelNameSchema,
  })
  .strict();

export type LocalModelTestInput = z.infer<typeof localModelTestInputSchema>;
export type LocalModelTestModelOutput = z.infer<typeof localModelTestModelOutputSchema>;
export type LocalModelTestOutput = z.infer<typeof localModelTestOutputSchema>;
