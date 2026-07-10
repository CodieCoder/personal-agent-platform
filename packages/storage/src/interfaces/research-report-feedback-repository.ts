import type {
  GetResearchReportFeedbackInput,
  ResearchReportFeedback,
  UpsertResearchReportFeedbackInput,
} from "@pap/contracts";

export type { GetResearchReportFeedbackInput, UpsertResearchReportFeedbackInput };

export interface ResearchReportFeedbackRepository {
  upsert(input: UpsertResearchReportFeedbackInput): Promise<ResearchReportFeedback>;
  getByReportId(input: GetResearchReportFeedbackInput): Promise<ResearchReportFeedback | null>;
}
