import {
  searchProviderHealthSchema,
  searchRequestSchema,
  searchResponseSchema,
  type SearchProviderHealth,
  type SearchProviderId,
} from "@pap/contracts";
import type { z } from "zod";
import { SearchProviderError } from "./errors.js";
import type { SearchService } from "./provider.js";
import type { SearchProviderRegistry } from "./registry.js";
import { selectSearchProvider } from "./registry.js";

export type CreateSearchServiceOptions = {
  defaultProviderId?: SearchProviderId;
};

export function createSearchService(
  registry: SearchProviderRegistry,
  options: CreateSearchServiceOptions = {},
): SearchService {
  return {
    async search(request) {
      const parsedRequest = searchRequestSchema.parse(request);
      const providerId = parsedRequest.providerId ?? options.defaultProviderId;

      if (providerId === undefined) {
        throw new SearchProviderError({
          code: "search_provider_not_found",
          message: "No default search provider is configured.",
        });
      }

      const provider = selectSearchProvider(registry, providerId);
      const response = await provider.search(parsedRequest);
      const parsedResponse = searchResponseSchema.safeParse(response);

      if (!parsedResponse.success) {
        throw new SearchProviderError({
          code: "search_provider_invalid_response",
          providerId,
          message: "Search provider response did not match the search response contract.",
          details: {
            issues: summarizeZodIssues(parsedResponse.error),
          },
        });
      }

      return parsedResponse.data;
    },

    async getProviderHealth(providerId) {
      const health = await selectSearchProvider(registry, providerId).health();
      return parseProviderHealth(health, providerId);
    },

    async listProviderHealth() {
      return Promise.all(
        registry.list().map(async (provider) => {
          const health = await provider.health();
          return parseProviderHealth(health, provider.id);
        }),
      );
    },
  };
}

function parseProviderHealth(
  health: SearchProviderHealth,
  providerId: SearchProviderId,
): SearchProviderHealth {
  const parsed = searchProviderHealthSchema.safeParse(health);

  if (!parsed.success) {
    throw new SearchProviderError({
      code: "search_provider_invalid_response",
      providerId,
      message: "Search provider health did not match the health contract.",
      details: {
        issues: summarizeZodIssues(parsed.error),
      },
    });
  }

  return parsed.data;
}

function summarizeZodIssues(error: z.ZodError): Record<string, unknown>[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
