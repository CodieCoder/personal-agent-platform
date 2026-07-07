import type {
  MemoryStatus,
  ResearchReport,
  ResearchReportDashboardSummary,
  ResearchReportHistoryPage,
  ResearchReportListPage,
  ResearchReportStatus,
  WorkspaceId,
} from "@pap/contracts";
import type { SafeWebError } from "../executions/types";
import type { ResearchMemoryProposalStatus } from "@pap/capability-research";

export type ResearchRunResult =
  | {
      ok: true;
      executionId: string;
      traceId: string;
      reportId: string;
      workspaceId: WorkspaceId | null;
      status: ResearchReportStatus;
      memoryProposalStatus: ResearchMemoryProposalStatus;
    }
  | {
      ok: false;
      executionId?: string;
      traceId?: string;
      reportId?: string;
      workspaceId?: WorkspaceId | null;
      status?: ResearchReportStatus;
      error: SafeWebError;
    };

export type ResearchReportListResult =
  | {
      ok: true;
      page: ResearchReportListPage;
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type ResearchReportHistoryResult =
  | {
      ok: true;
      page: ResearchReportHistoryPage;
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type ResearchReportDashboardResult =
  | {
      ok: true;
      summary: ResearchReportDashboardSummary;
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type ResearchReportResult =
  | {
      ok: true;
      found: false;
    }
  | {
      ok: true;
      found: true;
      report: ResearchReport;
      memory: ResearchMemoryStatusSummary;
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type ResearchMemoryStatusSummary = {
  status: "none" | "pending_review" | "active" | "rejected" | "mixed";
  total: number;
  proposed: number;
  active: number;
  rejected: number;
  records: {
    id: string;
    status: MemoryStatus;
  }[];
};
