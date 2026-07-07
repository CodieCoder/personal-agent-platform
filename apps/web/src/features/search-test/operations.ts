import {
  fetchUrlSchema,
  platformErrorSchema,
  searchQuerySchema,
  workspaceIdSchema,
  z,
} from "@pap/contracts";
import type { CapabilityExecutionResult, SearchProviderHealth } from "@pap/contracts";
import {
  searchExtractTestOutputSchema,
  type SearchExtractTestOutput,
} from "@pap/capability-search-extract-test";
import type { Runtime } from "@pap/runtime";
import type { SafeWebError } from "../executions/types";
import type {
  SearchProviderStatusResult,
  SearchTestEvidenceSummary,
  SearchTestExtractionResult,
  SearchTestSearchResult,
} from "./types";

export type SearchTestOperationState = {
  runtime: Pick<Runtime, "execute" | "getSearchProviderHealth">;
};

const searchProviderId = "provider.searxng";

const searchTestInputSchema = z
  .object({
    query: searchQuerySchema,
    workspaceId: workspaceIdSchema.optional(),
  })
  .strict();

const extractSearchTestInputSchema = searchTestInputSchema
  .extend({
    selectedUrl: fetchUrlSchema,
  })
  .strict();

export async function getSearchProviderStatusOperation(
  state: SearchTestOperationState,
): Promise<SearchProviderStatusResult> {
  try {
    return providerHealthToResult(await state.runtime.getSearchProviderHealth(searchProviderId));
  } catch (error) {
    return {
      ok: false,
      providerId: searchProviderId,
      status: "error",
      error: toSafeWebError(error, {
        code: "SEARCH_PROVIDER_STATUS_UNAVAILABLE",
        message: "Search provider status could not be checked.",
      }),
    };
  }
}

export async function runSearchTestOperation(
  state: SearchTestOperationState,
  input: unknown,
): Promise<SearchTestSearchResult> {
  const parsedInput = searchTestInputSchema.safeParse(coerceSearchInput(input));

  if (!parsedInput.success) {
    return {
      ok: false,
      error: {
        code: "SEARCH_TEST_INPUT_INVALID",
        message: "Enter a bounded search query before running search.",
      },
    };
  }

  try {
    const result = await state.runtime.execute({
      capabilityId: "capability.search-extract-test",
      input: {
        query: parsedInput.data.query,
        ...(parsedInput.data.workspaceId ? { workspaceId: parsedInput.data.workspaceId } : {}),
      },
      ...(parsedInput.data.workspaceId ? { workspaceId: parsedInput.data.workspaceId } : {}),
      source: "web",
      requestedUi: false,
      context: {
        initiatedBy: "user",
      },
    });

    if (result.status !== "completed") {
      return failedExecutionResult(result, {
        code: "SEARCH_TEST_EXECUTION_FAILED",
        message: "Search execution failed without a safe error payload.",
      });
    }

    const output = parseCapabilityOutput(result);

    if (!output.ok) {
      return invalidOutputResult(result, output.error);
    }

    return {
      ok: true,
      executionId: result.executionId,
      traceId: result.traceId,
      status: "completed",
      query: output.data.query,
      results: output.data.results,
      evidence: {
        searchEvidenceId: output.data.evidence.searchEvidenceId,
      },
      warnings: output.data.warnings,
    };
  } catch (error) {
    return {
      ok: false,
      error: toSafeWebError(error, {
        code: "SEARCH_TEST_UNAVAILABLE",
        message: "Search execution is unavailable.",
      }),
    };
  }
}

export async function extractSearchTestResultOperation(
  state: SearchTestOperationState,
  input: unknown,
): Promise<SearchTestExtractionResult> {
  const parsedInput = extractSearchTestInputSchema.safeParse(coerceExtractInput(input));

  if (!parsedInput.success) {
    return {
      ok: false,
      error: {
        code: "SEARCH_TEST_EXTRACTION_INPUT_INVALID",
        message: "Select a visible search result before requesting extraction.",
      },
    };
  }

  try {
    const result = await state.runtime.execute({
      capabilityId: "capability.search-extract-test",
      input: {
        query: parsedInput.data.query,
        selectedUrl: parsedInput.data.selectedUrl,
        ...(parsedInput.data.workspaceId ? { workspaceId: parsedInput.data.workspaceId } : {}),
      },
      ...(parsedInput.data.workspaceId ? { workspaceId: parsedInput.data.workspaceId } : {}),
      source: "web",
      requestedUi: false,
      context: {
        initiatedBy: "user",
      },
    });

    if (result.status !== "completed") {
      return failedExecutionResult(result, {
        code: "SEARCH_TEST_EXTRACTION_FAILED",
        message: "Extraction failed without a safe error payload.",
      });
    }

    const output = parseCapabilityOutput(result);

    if (!output.ok) {
      return invalidOutputResult(result, output.error);
    }

    if (output.data.document === null) {
      return {
        ok: false,
        executionId: result.executionId,
        traceId: result.traceId,
        status: result.status,
        error: {
          code: "SEARCH_TEST_DOCUMENT_MISSING",
          message: "Extraction completed without a document preview.",
        },
      };
    }

    const evidence = buildEvidenceSummary(output.data.evidence);

    return {
      ok: true,
      executionId: result.executionId,
      traceId: result.traceId,
      status: "completed",
      query: output.data.query,
      results: output.data.results,
      selectedResult: output.data.selectedResult,
      document: output.data.document,
      evidence,
      warnings: output.data.warnings,
    };
  } catch (error) {
    return {
      ok: false,
      error: toSafeWebError(error, {
        code: "SEARCH_TEST_EXTRACTION_UNAVAILABLE",
        message: "Extraction execution is unavailable.",
      }),
    };
  }
}

function providerHealthToResult(health: SearchProviderHealth): SearchProviderStatusResult {
  return {
    ok: true,
    providerId: health.providerId,
    kind: health.kind,
    status: health.status,
    checkedAt: health.checkedAt,
    ...(health.message ? { message: health.message } : {}),
  };
}

function failedExecutionResult<T extends SearchTestSearchResult | SearchTestExtractionResult>(
  result: CapabilityExecutionResult,
  fallback: SafeWebError,
): T {
  return {
    ok: false,
    executionId: result.executionId,
    traceId: result.traceId,
    status: result.status,
    error: result.error
      ? {
          code: result.error.code,
          message: result.error.message,
        }
      : fallback,
  } as T;
}

function parseCapabilityOutput(result: CapabilityExecutionResult):
  | {
      ok: true;
      data: SearchExtractTestOutput;
    }
  | {
      ok: false;
      error: SafeWebError;
    } {
  const output = searchExtractTestOutputSchema.safeParse(result.data);

  if (output.success) {
    return {
      ok: true,
      data: output.data,
    };
  }

  return {
    ok: false,
    error: {
      code: "SEARCH_TEST_OUTPUT_INVALID",
      message: "Search/extraction execution returned an invalid result shape.",
    },
  };
}

function invalidOutputResult<T extends SearchTestSearchResult | SearchTestExtractionResult>(
  result: CapabilityExecutionResult,
  error: SafeWebError,
): T {
  return {
    ok: false,
    executionId: result.executionId,
    traceId: result.traceId,
    status: result.status,
    error,
  } as T;
}

function buildEvidenceSummary(
  evidence: SearchExtractTestOutput["evidence"],
): SearchTestEvidenceSummary {
  const summary: SearchTestEvidenceSummary = {
    searchEvidenceId: evidence.searchEvidenceId,
  };

  if (evidence.fetchEvidenceId !== undefined) {
    summary.fetchEvidenceId = evidence.fetchEvidenceId;
  }

  if (evidence.extractionEvidenceId !== undefined) {
    summary.extractionEvidenceId = evidence.extractionEvidenceId;
  }

  return summary;
}

function toSafeWebError(error: unknown, fallback: SafeWebError): SafeWebError {
  const parsed = parseRuntimePlatformError(error);
  return parsed ?? fallback;
}

function parseRuntimePlatformError(error: unknown): SafeWebError | null {
  if (typeof error !== "object" || error === null || !("platformError" in error)) {
    return null;
  }

  const parsed = platformErrorSchema.safeParse(error.platformError);

  if (!parsed.success) {
    return null;
  }

  return {
    code: parsed.data.code,
    message: parsed.data.message,
  };
}

function coerceSearchInput(input: unknown): unknown {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    return {
      query: String(input.get("query") ?? ""),
      workspaceId: normalizeOptionalFormValue(input.get("workspaceId")),
    };
  }

  return input;
}

function coerceExtractInput(input: unknown): unknown {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    return {
      query: String(input.get("query") ?? ""),
      selectedUrl: String(input.get("selectedUrl") ?? ""),
      workspaceId: normalizeOptionalFormValue(input.get("workspaceId")),
    };
  }

  return input;
}

function normalizeOptionalFormValue(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
