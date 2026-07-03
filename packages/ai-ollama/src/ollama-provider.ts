import {
  providerHealthSchema,
  type ProviderHealth,
  type ProviderId,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "@pap/contracts";
import { AIProviderError, isAIProviderError, type AIProvider } from "@pap/ai";
import type { OllamaConfig } from "./config.js";
import { createDisabledOllamaProviderHealth } from "./health.js";
import { OllamaClient, type OllamaFetch, type OllamaModelTag } from "./ollama-client.js";

export const defaultOllamaProviderId = "provider.ollama" as const;

export type OllamaProviderOptions = {
  config: OllamaConfig;
  providerId?: ProviderId;
  client?: OllamaClient;
  fetch?: OllamaFetch;
  clock?: () => Date;
};

export class OllamaProvider implements AIProvider {
  readonly id: ProviderId;

  private readonly config: OllamaConfig;
  private readonly client: OllamaClient;
  private readonly clock: () => Date;

  constructor(options: OllamaProviderOptions) {
    this.id = options.providerId ?? defaultOllamaProviderId;
    this.config = options.config;
    this.clock = options.clock ?? (() => new Date());
    this.client =
      options.client ??
      new OllamaClient({
        baseUrl: options.config.baseUrl,
        timeoutMs: options.config.timeoutMs,
        keepAlive: options.config.keepAlive,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        clock: this.clock,
      });
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = this.clock().toISOString();

    if (!this.config.enabled) {
      return createDisabledOllamaProviderHealth({
        providerId: this.id,
        checkedAt,
        ...(this.config.defaultModel === null ? {} : { model: this.config.defaultModel }),
      });
    }

    if (this.config.defaultModel === null) {
      return providerHealthSchema.parse({
        providerId: this.id,
        kind: "ollama",
        status: "unavailable",
        checkedAt,
        message: "Ollama default model is not configured.",
      });
    }

    let version: string | undefined;

    try {
      version = (await this.client.getVersion({ providerId: this.id })).version;
    } catch (error) {
      return this.healthFromError(error, {
        checkedAt,
        model: this.config.defaultModel,
        endpointReachable: false,
      });
    }

    try {
      const tags = await this.client.listModels({ providerId: this.id });
      const matchedModelName = findConfiguredModelName(tags.models, this.config.defaultModel);
      const modelPresent = matchedModelName !== undefined;

      return providerHealthSchema.parse({
        providerId: this.id,
        kind: "ollama",
        status: modelPresent ? "healthy" : "degraded",
        checkedAt,
        model: matchedModelName ?? this.config.defaultModel,
        message: modelPresent
          ? "Ollama is reachable and the configured model is available."
          : "Ollama is reachable, but the configured model was not found in local tags.",
        metadata: {
          ollamaVersion: version,
          modelPresent,
          modelCount: tags.models.length,
        },
      });
    } catch (error) {
      return this.healthFromError(error, {
        checkedAt,
        model: this.config.defaultModel,
        endpointReachable: true,
        version,
      });
    }
  }

  async generateStructured(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult> {
    if (request.providerId !== this.id) {
      throw new AIProviderError({
        code: "provider_not_found",
        providerId: request.providerId,
        message: `Ollama provider '${this.id}' cannot fulfill request for '${request.providerId}'.`,
      });
    }

    if (!this.config.enabled) {
      throw new AIProviderError({
        code: "provider_disabled",
        providerId: this.id,
        message: "Ollama provider is disabled by configuration.",
      });
    }

    if (this.config.defaultModel === null) {
      throw new AIProviderError({
        code: "provider_unavailable",
        providerId: this.id,
        retryable: false,
        message: "Ollama default model is not configured.",
      });
    }

    return this.client.generateStructured({
      providerId: this.id,
      model: request.model,
      systemPrompt: request.systemPrompt,
      prompt: request.prompt,
      responseSchema: request.responseSchema,
      timeoutMs: request.timeoutMs,
      keepAlive: request.keepAlive ?? this.config.keepAlive,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    });
  }

  private healthFromError(
    error: unknown,
    input: {
      checkedAt: string;
      model: string;
      endpointReachable: boolean;
      version?: string;
    },
  ): ProviderHealth {
    if (!isAIProviderError(error)) {
      return providerHealthSchema.parse({
        providerId: this.id,
        kind: "ollama",
        status: "unavailable",
        checkedAt: input.checkedAt,
        model: input.model,
        message: "Ollama health check failed.",
      });
    }

    const status = input.endpointReachable ? "degraded" : "unavailable";

    return providerHealthSchema.parse({
      providerId: this.id,
      kind: "ollama",
      status,
      checkedAt: input.checkedAt,
      model: input.model,
      message:
        status === "degraded"
          ? "Ollama is reachable, but provider health could not confirm model availability."
          : "Ollama is unavailable.",
      metadata: {
        errorKind: error.code,
        retryable: error.retryable,
        ...(input.version ? { ollamaVersion: input.version } : {}),
      },
    });
  }
}

function findConfiguredModelName(
  models: OllamaModelTag[],
  configuredModel: string,
): string | undefined {
  return (
    models.find((model) => model.name === configuredModel)?.name ??
    models.find((model) => model.name.toLowerCase() === configuredModel.toLowerCase())?.name
  );
}
