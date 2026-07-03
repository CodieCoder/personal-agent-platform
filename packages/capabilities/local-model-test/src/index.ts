import type { CapabilityDefinition } from "@pap/contracts";
import { executeLocalModelTest } from "./execute.js";
import { localModelTestManifest } from "./manifest.js";
import { localModelTestInputSchema, localModelTestOutputSchema } from "./schemas.js";

export const localModelTestCapability: CapabilityDefinition = {
  manifest: localModelTestManifest,
  inputSchema: localModelTestInputSchema,
  outputSchema: localModelTestOutputSchema,
  execute: executeLocalModelTest,
};

export { executeLocalModelTest } from "./execute.js";
export { localModelTestManifest } from "./manifest.js";
export {
  buildLocalModelTestPrompt,
  localModelTestPromptTemplateId,
  localModelTestProviderId,
  localModelTestResponseSchemaId,
  localModelTestSystemPrompt,
} from "./prompt.js";
export {
  localModelTestInputSchema,
  localModelTestModelOutputSchema,
  localModelTestOutputSchema,
} from "./schemas.js";
export type {
  LocalModelTestInput,
  LocalModelTestModelOutput,
  LocalModelTestOutput,
} from "./schemas.js";
