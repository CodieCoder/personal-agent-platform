import type { ExecutionStatus, SearchProviderHealthStatus, SearchResult } from "@pap/contracts";
import type {
  SearchExtractTestDocument,
  SearchExtractTestWarning,
} from "@pap/capability-search-extract-test";
import type { SafeWebError } from "../executions/types";

export type SearchProviderStatusResult =
  | {
      ok: true;
      providerId: string;
      kind: "searxng";
      status: SearchProviderHealthStatus;
      checkedAt: string;
      message?: string;
    }
  | {
      ok: false;
      providerId: string;
      status: "error";
      error: SafeWebError;
    };

export type SearchResultSelection = {
  index: number;
  result: SearchResult;
};

export type SearchTestEvidenceSummary = {
  searchEvidenceId: string;
  fetchEvidenceId?: string;
  extractionEvidenceId?: string;
};

export type SearchTestSearchResult =
  | {
      ok: true;
      executionId: string;
      traceId: string;
      status: "completed";
      query: string;
      results: SearchResult[];
      evidence: Pick<SearchTestEvidenceSummary, "searchEvidenceId">;
      warnings: SearchExtractTestWarning[];
    }
  | {
      ok: false;
      executionId?: string;
      traceId?: string;
      status?: ExecutionStatus;
      error: SafeWebError;
    };

export type SearchTestExtractionResult =
  | {
      ok: true;
      executionId: string;
      traceId: string;
      status: "completed";
      query: string;
      results: SearchResult[];
      selectedResult: SearchResultSelection | null;
      document: SearchExtractTestDocument;
      evidence: SearchTestEvidenceSummary;
      warnings: SearchExtractTestWarning[];
    }
  | {
      ok: false;
      executionId?: string;
      traceId?: string;
      status?: ExecutionStatus;
      error: SafeWebError;
    };
