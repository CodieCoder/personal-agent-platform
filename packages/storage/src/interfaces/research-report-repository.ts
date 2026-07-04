import type {
  ExecutionId,
  ResearchCitation,
  ResearchFinding,
  ResearchLimitation,
  ResearchReport,
  ResearchReportId,
  ResearchReportListPage,
  ResearchReportStatus,
  ResearchReportSummary,
  ResearchWarning,
  WorkspaceId,
} from "@pap/contracts";

export type CreateResearchReportInput = {
  id?: ResearchReportId;
  executionId: ExecutionId;
  workspaceId: WorkspaceId | null;
  question: string;
  summary: ResearchReportSummary;
  findings?: ResearchFinding[];
  citations?: ResearchCitation[];
  limitations?: ResearchLimitation[];
  warnings?: ResearchWarning[];
  status?: ResearchReportStatus;
  createdAt?: string;
  completedAt?: string | null;
};

export type GetResearchReportByIdInput = {
  id: ResearchReportId;
  workspaceId: WorkspaceId | null;
};

export type ListResearchReportsInput = {
  workspaceId: WorkspaceId | null;
  executionId?: ExecutionId;
  status?: ResearchReportStatus;
  page?: number;
  pageSize?: number;
};

export type UpdateResearchReportStatusInput = GetResearchReportByIdInput & {
  status: ResearchReportStatus;
  completedAt?: string | null;
  updatedAt?: string;
};

export type ReplaceResearchReportContentInput = GetResearchReportByIdInput & {
  summary: ResearchReportSummary;
  findings: ResearchFinding[];
  citations: ResearchCitation[];
  limitations: ResearchLimitation[];
  warnings: ResearchWarning[];
  status?: ResearchReportStatus;
  completedAt?: string | null;
  updatedAt?: string;
};

export interface ResearchReportRepository {
  create(input: CreateResearchReportInput): Promise<ResearchReport>;
  getById(input: GetResearchReportByIdInput): Promise<ResearchReport | null>;
  list(input: ListResearchReportsInput): Promise<ResearchReportListPage>;
  updateStatus(input: UpdateResearchReportStatusInput): Promise<ResearchReport>;
  replaceContent(input: ReplaceResearchReportContentInput): Promise<ResearchReport>;
}
