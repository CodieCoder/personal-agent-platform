import type { CapabilityDefinition } from "@pap/contracts";
import { createSearchExtractTestExecute, type SearchExtractTestOptions } from "./execute.js";
import { searchExtractTestManifest } from "./manifest.js";
import { searchExtractTestInputSchema, searchExtractTestOutputSchema } from "./schemas.js";

export function createSearchExtractTestCapability(
  options: SearchExtractTestOptions = {},
): CapabilityDefinition {
  return {
    manifest: searchExtractTestManifest,
    inputSchema: searchExtractTestInputSchema,
    outputSchema: searchExtractTestOutputSchema,
    execute: createSearchExtractTestExecute(options),
  };
}

export const searchExtractTestCapability = createSearchExtractTestCapability();

export { SearchExtractTestSafeError } from "./errors.js";
export type { SearchExtractTestOptions } from "./execute.js";
export { createSearchExtractTestExecute, executeSearchExtractTest } from "./execute.js";
export { searchExtractTestManifest } from "./manifest.js";
export type {
  SearchExtractTestDocument,
  SearchExtractTestInput,
  SearchExtractTestOutput,
  SearchExtractTestWarning,
} from "./schemas.js";
export {
  searchExtractTestDocumentSchema,
  searchExtractTestInputSchema,
  searchExtractTestOutputSchema,
  searchExtractTestWarningSchema,
} from "./schemas.js";
