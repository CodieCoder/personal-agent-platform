import type { CapabilityExecutionContext } from "@pap/contracts";
import { nowIso } from "@pap/shared";
import { echoInputSchema, echoOutputSchema, type EchoOutput } from "./schemas.js";

export async function executeEcho(
  input: unknown,
  context: CapabilityExecutionContext,
): Promise<EchoOutput> {
  const parsedInput = echoInputSchema.parse(input);

  await context.trace.addStep({
    kind: "workflow",
    name: "echo.normalize",
    status: "completed",
    summary: "Normalized input whitespace and returned the message.",
  });

  return echoOutputSchema.parse({
    message: parsedInput.message,
    echoedAt: nowIso(),
  });
}
