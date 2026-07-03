import type { SearchProviderId, SearchRequest } from "@pap/contracts";
import { SearchProviderError } from "./errors.js";
import type { SearchProvider } from "./provider.js";

export interface SearchProviderRegistry {
  register(provider: SearchProvider): SearchProvider;
  get(providerId: SearchProviderId): SearchProvider;
  has(providerId: SearchProviderId): boolean;
  list(): SearchProvider[];
}

export function createSearchProviderRegistry(
  providers: Iterable<SearchProvider> = [],
): SearchProviderRegistry {
  const providerById = new Map<SearchProviderId, SearchProvider>();

  const registry: SearchProviderRegistry = {
    register(provider) {
      if (providerById.has(provider.id)) {
        throw new SearchProviderError({
          code: "search_provider_duplicate",
          providerId: provider.id,
          message: `Search provider '${provider.id}' is already registered.`,
        });
      }

      providerById.set(provider.id, provider);
      return provider;
    },

    get(providerId) {
      const provider = providerById.get(providerId);

      if (provider === undefined) {
        throw new SearchProviderError({
          code: "search_provider_not_found",
          providerId,
          message: `Search provider '${providerId}' is not registered.`,
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

export function selectSearchProvider(
  registry: SearchProviderRegistry,
  providerId: SearchProviderId,
): SearchProvider {
  return registry.get(providerId);
}

export function selectSearchProviderForRequest(
  registry: SearchProviderRegistry,
  request: Pick<SearchRequest, "providerId">,
  defaultProviderId: SearchProviderId,
): SearchProvider {
  return selectSearchProvider(registry, request.providerId ?? defaultProviderId);
}
