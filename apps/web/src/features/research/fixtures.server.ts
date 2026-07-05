import "@tanstack/react-start/server-only";

import { AIProviderError, createAIProviderRegistry } from "@pap/ai";
import {
  structuredGenerationResultSchema,
  type AIProviderKind,
  type ProviderHealth,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "@pap/contracts";

export function shouldUseResearchTestFixtures(input: {
  environment: string;
  rawEnv: Record<string, string | undefined>;
}): boolean {
  return (
    input.environment === "test" &&
    input.rawEnv.PAP_RESEARCH_TEST_FIXTURES?.toLowerCase() === "true"
  );
}

export function createResearchFixtureAIProviderRegistry(input: {
  rawEnv: Record<string, string | undefined>;
}) {
  const state = {
    invalidAnalysisFailures: 0,
  };

  return createAIProviderRegistry([
    {
      id: "provider.ollama",
      health: async () => fixtureHealth(input.rawEnv),
      generateStructured: async (request) =>
        fixtureStructuredGeneration(request, input.rawEnv, state),
    },
  ]);
}

function fixtureHealth(rawEnv: Record<string, string | undefined>): ProviderHealth {
  if (rawEnv.PAP_RESEARCH_TEST_FIXTURE_AI_HEALTH === "unavailable") {
    return {
      providerId: "provider.ollama",
      kind: "ollama" satisfies AIProviderKind,
      status: "unavailable",
      checkedAt: fixedTimestamp(),
      message: "Fixture model provider is unavailable.",
      model: "fixture-research-model",
    };
  }

  return {
    providerId: "provider.ollama",
    kind: "ollama" satisfies AIProviderKind,
    status: "healthy",
    checkedAt: fixedTimestamp(),
    message: "Fixture model provider is ready.",
    model: "fixture-research-model",
  };
}

function fixtureStructuredGeneration(
  request: StructuredGenerationRequest,
  rawEnv: Record<string, string | undefined>,
  state: { invalidAnalysisFailures: number },
): StructuredGenerationResult {
  const output =
    request.responseSchema.id === "research.source-ranking.v1"
      ? fixtureRankingOutput(request)
      : fixtureAnalysisOutput(request, rawEnv, state);

  return structuredGenerationResultSchema.parse({
    providerId: request.providerId,
    model: request.model,
    output,
    rawText: null,
    startedAt: fixedTimestamp(),
    completedAt: fixedTimestamp(),
    durationMs: 0,
    promptTokenCount: null,
    completionTokenCount: null,
    totalTokenCount: null,
  });
}

function fixtureRankingOutput(request: StructuredGenerationRequest) {
  const parsed = parsePrompt(request.prompt);
  const sources = Array.isArray(parsed.sources) ? parsed.sources : [];

  return {
    rankings: sources.map((source, index) => ({
      sourceId: String(source.sourceId),
      relevanceScore: index === 0 ? 0.94 : 0.78,
      relevanceLabel: index === 0 ? "high" : "medium",
      reason: "Fixture source contains extracted content relevant to the request.",
      recommendedForSynthesis: true,
    })),
  };
}

function fixtureAnalysisOutput(
  request: StructuredGenerationRequest,
  rawEnv: Record<string, string | undefined>,
  state: { invalidAnalysisFailures: number },
) {
  const parsed = parsePrompt(request.prompt);
  const source =
    parsed.source && typeof parsed.source === "object"
      ? (parsed.source as Record<string, unknown>)
      : {};
  const sourceId = String(source.sourceId ?? "research_source_fixture");
  const mode = rawEnv.PAP_RESEARCH_TEST_FIXTURE_AI_MODE ?? "success";

  if (mode === "analysis_invalid_once" && state.invalidAnalysisFailures === 0) {
    state.invalidAnalysisFailures += 1;
    throw new AIProviderError({
      code: "provider_invalid_response",
      providerId: request.providerId,
      message: "Fixture analysis returned malformed JSON once.",
      details: { schemaId: request.responseSchema.id },
    });
  }

  if (mode === "analysis_invalid_always") {
    throw new AIProviderError({
      code: "provider_invalid_response",
      providerId: request.providerId,
      message: "Fixture analysis returned malformed JSON.",
      details: { schemaId: request.responseSchema.id },
    });
  }

  if (mode === "citation_failure") {
    return {
      sourceId,
      summary: "Fixture analysis returned no source-backed claims.",
      claims: [],
      caveats: ["Fixture citation failure mode removed claims."],
      relevanceScore: 0.4,
      confidence: 0.4,
    };
  }

  return {
    sourceId,
    summary: "Fixture analysis found deterministic local-first research evidence.",
    claims: [
      {
        claimText:
          "Personal Agent Platform uses deterministic search and guarded extraction before model synthesis.",
        sourceExcerpt:
          "uses deterministic search and guarded extraction before any model ranking or synthesis happens",
        confidence: 0.92,
      },
      {
        claimText: "Workspace-scoped executions keep evidence linked to the selected workspace.",
        sourceExcerpt: "Workspace-scoped executions keep evidence linked to the selected workspace",
        confidence: 0.86,
      },
    ],
    caveats: ["Fixture evidence is intentionally narrow and local to automated tests."],
    relevanceScore: 0.9,
    confidence: 0.9,
  };
}

function parsePrompt(prompt: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(prompt) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function fixedTimestamp(): string {
  return "2026-07-04T09:00:00.000Z";
}
