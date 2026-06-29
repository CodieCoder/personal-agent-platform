import { isoDateTimeSchema, z } from "@pap/contracts";

export function normalizeEchoMessage(message: string): string {
  return message.trim().replace(/\s+/gu, " ");
}

export const echoInputSchema = z
  .object({
    message: z
      .string()
      .transform(normalizeEchoMessage)
      .pipe(z.string().min(1, "Echo message cannot be empty.")),
  })
  .strict();

export const echoOutputSchema = z
  .object({
    message: z.string().min(1),
    echoedAt: isoDateTimeSchema,
  })
  .strict();

export type EchoInput = z.infer<typeof echoInputSchema>;
export type EchoOutput = z.infer<typeof echoOutputSchema>;
