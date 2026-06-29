import type { CapabilityDefinition } from "@pap/contracts";
import { executeEcho } from "./execute.js";
import { echoManifest } from "./manifest.js";
import { echoInputSchema, echoOutputSchema } from "./schemas.js";

export const echoCapability: CapabilityDefinition = {
  manifest: echoManifest,
  inputSchema: echoInputSchema,
  outputSchema: echoOutputSchema,
  execute: executeEcho,
};

export { executeEcho } from "./execute.js";
export { echoManifest } from "./manifest.js";
export { echoInputSchema, echoOutputSchema, normalizeEchoMessage } from "./schemas.js";
export type { EchoInput, EchoOutput } from "./schemas.js";
