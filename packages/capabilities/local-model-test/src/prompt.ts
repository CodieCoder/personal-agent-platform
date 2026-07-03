export const localModelTestProviderId = "provider.ollama" as const;
export const localModelTestPromptTemplateId = "prompt.local-model-test.v1" as const;
export const localModelTestResponseSchemaId =
  "capability.local-model-test.model-output.v1" as const;

export const localModelTestSystemPrompt = [
  "You are running a Personal Agent Platform local-model test.",
  "Return only valid JSON matching the requested schema.",
  "Do not browse, call tools, use memory, infer private context, or add extra keys.",
].join(" ");

export function buildLocalModelTestPrompt(prompt: string): string {
  return [
    "Analyze only the submitted prompt text below.",
    "Return a JSON object with:",
    "- summary: one concise summary sentence.",
    "- keyPoints: 1 to 5 short key points.",
    "- confidence: a number from 0 to 1 for how confidently the prompt can be summarized.",
    "",
    "Submitted prompt:",
    quotePrompt(prompt),
  ].join("\n");
}

function quotePrompt(prompt: string): string {
  return `"""${prompt}"""`;
}
