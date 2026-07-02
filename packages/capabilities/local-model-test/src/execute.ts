import {
  structuredGenerationResultSchema,
  type CapabilityExecutionContext,
  type ProviderHealth,
} from "@pap/contracts";
import { LocalModelTestSafeError, type LocalModelTestErrorInput } from "./errors.js";
import {
  buildLocalModelTestPrompt,
  localModelTestPromptTemplateId,
  localModelTestProviderId,
  localModelTestResponseSchemaId,
  localModelTestSystemPrompt,
} from "./prompt.js";
import {
  localModelTestInputSchema,
  localModelTestModelOutputSchema,
  localModelTestOutputSchema,
  type LocalModelTestOutput,
} from "./schemas.js";

const generationTimeoutMs = 60_000;
const generationMaxTokens = 512;

export async function executeLocalModelTest(
  input: unknown,
  context: CapabilityExecutionContext,
): Promise<LocalModelTestOutput> {
  const parsedInput = localModelTestInputSchema.parse(input);

  await context.trace.addStep({
    kind: "workflow",
    name: "resolve provider",
    status: "completed",
    summary: "Resolved the configured local model provider.",
    metadata:
      parsedInput.model === null || parsedInput.model === undefined
        ? { providerId: localModelTestProviderId }
        : { providerId: localModelTestProviderId, requestedModel: parsedInput.model },
  });

  const health = await context.llm.getProviderHealth(localModelTestProviderId);
  const model = resolveModel(parsedInput.model ?? null, health);
  const prompt = buildLocalModelTestPrompt(parsedInput.prompt);

  await context.trace.addStep({
    kind: "workflow",
    name: "build prompt",
    status: "completed",
    summary: "Built the fixed local-model-test prompt.",
    metadata: {
      promptTemplateId: localModelTestPromptTemplateId,
      responseSchemaId: localModelTestResponseSchemaId,
      promptLength: prompt.length,
    },
  });

  const generation = structuredGenerationResultSchema.parse(
    await context.llm.generateStructured({
      providerId: localModelTestProviderId,
      model,
      systemPrompt: localModelTestSystemPrompt,
      prompt,
      responseSchema: {
        id: localModelTestResponseSchemaId,
        description: "Local model test structured summary output.",
        schema: localModelTestModelOutputSchema,
      },
      temperature: 0,
      maxTokens: generationMaxTokens,
      timeoutMs: generationTimeoutMs,
      keepAlive: null,
      metadata: {
        capabilityId: context.capability.id,
        promptTemplateId: localModelTestPromptTemplateId,
      },
    }),
  );
  const modelOutput = localModelTestModelOutputSchema.parse(generation.output);

  return localModelTestOutputSchema.parse({
    ...modelOutput,
    provider: generation.providerId,
    model: generation.model,
  });
}

function resolveModel(requestedModel: string | null, health: ProviderHealth): string {
  if (health.status !== "healthy" || health.model === undefined) {
    throwLocalModelTestError({
      code: "AI_PROVIDER_UNAVAILABLE",
      message: "Local model provider is not ready. Check Ollama and the configured model.",
      category: "llm",
      retryable: health.status !== "disabled",
      details: {
        providerId: health.providerId,
        healthStatus: health.status,
        ...(health.model ? { model: health.model } : {}),
      },
    });
  }

  if (requestedModel !== null && requestedModel !== health.model) {
    throwLocalModelTestError({
      code: "CAPABILITY_INPUT_INVALID",
      message: "Requested model is not allowlisted for local model test.",
      category: "validation",
      details: {
        providerId: health.providerId,
        requestedModel,
        allowlistedModel: health.model,
      },
    });
  }

  return requestedModel ?? health.model;
}

function throwLocalModelTestError(input: LocalModelTestErrorInput): never {
  throw new LocalModelTestSafeError(input);
}
