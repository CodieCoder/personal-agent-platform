import type {
  ExecutionId,
  ExtractionMethod,
  ExtractionWarning,
  FetchRedirect,
  FetchStatusCode,
  FetchUrl,
  FetchWarning,
  SearchProviderId,
  SearchRequest,
  SearchResult,
  SearchWarning,
  SourceProfileId,
  WebEvidenceBundle,
  WebEvidenceFailureCategory,
  WebEvidenceId,
  WebEvidenceStatus,
  WebExtractionEvidence,
  WebFetchEvidence,
  WebSearchEvidence,
  WebSelectedUrlSource,
  WorkspaceId,
} from "@pap/contracts";

export type WebEvidenceExecutionLink = {
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
};

export type CreateWebSearchEvidenceInput = WebEvidenceExecutionLink & {
  id?: WebEvidenceId;
  providerId: SearchProviderId;
  query: string;
  request: SearchRequest;
  status: WebEvidenceStatus;
  resultCount: number;
  results: SearchResult[];
  warnings?: SearchWarning[];
  failureCategory?: WebEvidenceFailureCategory | null;
  failureMessage?: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  createdAt?: string;
  expiresAt?: string;
};

export type CreateWebFetchEvidenceInput = WebEvidenceExecutionLink & {
  id?: WebEvidenceId;
  searchEvidenceId?: WebEvidenceId | null;
  selectedUrlSource: WebSelectedUrlSource;
  selectedResultIndex?: number | null;
  requestedUrl: FetchUrl;
  finalUrl?: FetchUrl | null;
  status: WebEvidenceStatus;
  statusCode?: FetchStatusCode | null;
  contentType?: string | null;
  contentLength?: number | null;
  contentBytes?: number | null;
  bodySha256?: string | null;
  redirects?: FetchRedirect[];
  warnings?: FetchWarning[];
  failureCategory?: WebEvidenceFailureCategory | null;
  failureMessage?: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  createdAt?: string;
  expiresAt?: string;
};

export type CreateWebExtractionEvidenceInput = WebEvidenceExecutionLink & {
  id?: WebEvidenceId;
  fetchEvidenceId?: WebEvidenceId | null;
  finalUrl: FetchUrl;
  status: WebEvidenceStatus;
  extractionMethod?: ExtractionMethod | null;
  sourceProfileId?: SourceProfileId | null;
  title?: string | null;
  byline?: string | null;
  siteName?: string | null;
  publishedAt?: string | null;
  canonicalUrl?: FetchUrl | null;
  excerpt?: string | null;
  wordCount?: number | null;
  contentTextSnapshot?: string | null;
  contentTextSha256?: string | null;
  contentChars?: number | null;
  originalContentChars?: number | null;
  warnings?: ExtractionWarning[];
  failureCategory?: WebEvidenceFailureCategory | null;
  failureMessage?: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  createdAt?: string;
  expiresAt?: string;
};

export type GetWebEvidenceByExecutionInput = {
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
};

export interface WebEvidenceRepository {
  createSearch(input: CreateWebSearchEvidenceInput): Promise<WebSearchEvidence>;
  createFetch(input: CreateWebFetchEvidenceInput): Promise<WebFetchEvidence>;
  createExtraction(input: CreateWebExtractionEvidenceInput): Promise<WebExtractionEvidence>;
  getByExecution(input: GetWebEvidenceByExecutionInput): Promise<WebEvidenceBundle>;
}
