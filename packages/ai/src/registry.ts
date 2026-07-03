import type { ProviderId, StructuredGenerationRequest } from "@pap/contracts";
import { AIProviderError } from "./errors.js";
import type { AIProvider } from "./provider.js";

export interface AIProviderRegistry {
  register(provider: AIProvider): AIProvider;
  get(providerId: ProviderId): AIProvider;
  has(providerId: ProviderId): boolean;
  list(): AIProvider[];
}

export function createAIProviderRegistry(providers: Iterable<AIProvider> = []): AIProviderRegistry {
  const providerById = new Map<ProviderId, AIProvider>();

  const registry: AIProviderRegistry = {
    register(provider) {
      if (providerById.has(provider.id)) {
        throw new AIProviderError({
          code: "provider_duplicate",
          providerId: provider.id,
          message: `AI provider '${provider.id}' is already registered.`,
        });
      }

      providerById.set(provider.id, provider);
      return provider;
    },

    get(providerId) {
      const provider = providerById.get(providerId);

      if (provider === undefined) {
        throw new AIProviderError({
          code: "provider_not_found",
          providerId,
          message: `AI provider '${providerId}' is not registered.`,
        });
      }

      return provider;
    },

    has(providerId) {
      return providerById.has(providerId);
    },

    list() {
      return [...providerById.values()];
    },
  };

  for (const provider of providers) {
    registry.register(provider);
  }

  return registry;
}

export function selectAIProvider(registry: AIProviderRegistry, providerId: ProviderId): AIProvider {
  return registry.get(providerId);
}

export function selectAIProviderForRequest(
  registry: AIProviderRegistry,
  request: Pick<StructuredGenerationRequest, "providerId">,
): AIProvider {
  return selectAIProvider(registry, request.providerId);
}
