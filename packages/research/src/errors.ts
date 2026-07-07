export type ResearchPreparationErrorCode =
  | "research_question_empty_after_normalization"
  | "research_query_plan_empty"
  | "research_url_invalid";

export class ResearchPreparationError extends Error {
  readonly code: ResearchPreparationErrorCode;

  constructor(code: ResearchPreparationErrorCode, message: string) {
    super(message);
    this.name = "ResearchPreparationError";
    this.code = code;
  }
}

export function isResearchPreparationError(error: unknown): error is ResearchPreparationError {
  return error instanceof ResearchPreparationError;
}
