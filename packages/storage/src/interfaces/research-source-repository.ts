import type {
  ExecutionId,
  ResearchCitationId,
  ResearchReportId,
  ResearchSelectedSource,
  ResearchSourceAnalysis,
  ResearchSourceId,
  ResearchSourceStatus,
  WebEvidenceId,
  WorkspaceId,
} from "@pap/contracts";

export type CreateResearchSourceInput = {
  id?: ResearchSourceId;
  reportId: ResearchReportId;
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
  evidenceId?: WebEvidenceId | null;
  url: string;
  finalUrl?: string | null;
  title?: string | null;
  publishedAt?: string | null;
  selectionRank?: number | null;
  relevanceScore?: number | null;
  analysis?: ResearchSourceAnalysis | null;
  citationIds?: ResearchCitationId[];
  status?: ResearchSourceStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type GetResearchSourceByIdInput = {
  id: ResearchSourceId;
  workspaceId: WorkspaceId | null;
};

export type ListResearchSourcesByReportInput = {
  reportId: ResearchReportId;
  workspaceId: WorkspaceId | null;
};

export type ListResearchSourcesByExecutionInput = {
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
};

export type UpdateResearchSourceStatusInput = GetResearchSourceByIdInput & {
  status: ResearchSourceStatus;
  updatedAt?: string;
};

export type UpdateResearchSourceAnalysisInput = GetResearchSourceByIdInput & {
  analysis: ResearchSourceAnalysis;
  citationIds?: ResearchCitationId[];
  status?: ResearchSourceStatus;
  updatedAt?: string;
};

export interface ResearchSourceRepository {
  create(input: CreateResearchSourceInput): Promise<ResearchSelectedSource>;
  getById(input: GetResearchSourceByIdInput): Promise<ResearchSelectedSource | null>;
  listByReport(input: ListResearchSourcesByReportInput): Promise<ResearchSelectedSource[]>;
  listByExecution(input: ListResearchSourcesByExecutionInput): Promise<ResearchSelectedSource[]>;
  updateStatus(input: UpdateResearchSourceStatusInput): Promise<ResearchSelectedSource>;
  updateAnalysis(input: UpdateResearchSourceAnalysisInput): Promise<ResearchSelectedSource>;
}
