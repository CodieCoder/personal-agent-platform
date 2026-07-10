import type {
  CreateResearchSourceFeedbackInput,
  DeleteResearchSourceFeedbackInput,
  GetResearchSourceFeedbackBySourceInput,
  ListResearchSourceFeedbackByReportInput,
  ResearchSourceFeedback,
  UpdateResearchSourceFeedbackInput,
} from "@pap/contracts";

export type {
  CreateResearchSourceFeedbackInput,
  DeleteResearchSourceFeedbackInput,
  GetResearchSourceFeedbackBySourceInput,
  ListResearchSourceFeedbackByReportInput,
  UpdateResearchSourceFeedbackInput,
};

export interface ResearchSourceFeedbackRepository {
  create(input: CreateResearchSourceFeedbackInput): Promise<ResearchSourceFeedback>;
  getBySourceId(
    input: GetResearchSourceFeedbackBySourceInput,
  ): Promise<ResearchSourceFeedback | null>;
  listByReport(input: ListResearchSourceFeedbackByReportInput): Promise<ResearchSourceFeedback[]>;
  update(input: UpdateResearchSourceFeedbackInput): Promise<ResearchSourceFeedback>;
  delete(input: DeleteResearchSourceFeedbackInput): Promise<void>;
}
