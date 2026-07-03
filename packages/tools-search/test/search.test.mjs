import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";
import {
  SearchProviderError,
  createSearchProviderRegistry,
  createSearchService,
  isSearchProviderError,
  selectSearchProvider,
} from "../dist/index.js";

const fixedNow = "2026-07-02T09:00:00.000Z";

function createProvider({
  id = "provider.searxng",
  responseOverrides = {},
  healthOverrides = {},
} = {}) {
  const requests = [];
  const provider = {
    id,
    requests,
    async health() {
      return {
        providerId: id,
        kind: "searxng",
        status: "healthy",
        checkedAt: fixedNow,
        ...healthOverrides,
      };
    },
    async search(request) {
      requests.push(request);
      return {
        providerId: id,
        query: request.query,
        page: request.page ?? 1,
        pageSize: request.pageSize,
        results: [
          {
            title: "Example",
            url: "https://example.com/",
            displayUrl: "example.com",
            snippet: "A result.",
            publishedAt: null,
            engine: "duckduckgo",
            category: "general",
            score: null,
          },
        ],
        startedAt: fixedNow,
        completedAt: "2026-07-02T09:00:00.250Z",
        durationMs: 250,
        safety: {
          safesearch: request.safesearch,
          language: request.language,
          categories: request.categories,
          timeRange: request.timeRange,
          resultCount: 1,
          omittedResultCount: 0,
          normalizedUrlCount: 1,
        },
        warnings: [],
        ...responseOverrides,
      };
    },
  };

  return provider;
}

test("search provider registry registers, lists, and selects providers", () => {
  const provider = createProvider();
  const registry = createSearchProviderRegistry([provider]);

  assert.equal(registry.has(provider.id), true);
  assert.equal(registry.get(provider.id), provider);
  assert.deepEqual(registry.list(), [provider]);
  assert.equal(selectSearchProvider(registry, provider.id), provider);
});

test("search provider registry throws typed errors for duplicate and unknown providers", () => {
  const provider = createProvider();
  const registry = createSearchProviderRegistry([provider]);

  assert.throws(
    () => registry.register(provider),
    (error) =>
      error instanceof SearchProviderError &&
      error.code === "search_provider_duplicate" &&
      error.providerId === provider.id,
  );
  assert.throws(
    () => registry.get("provider.missing"),
    (error) =>
      isSearchProviderError(error) &&
      error.code === "search_provider_not_found" &&
      error.providerId === "provider.missing",
  );
});

test("search service validates requests, selects default provider, and validates responses", async () => {
  const provider = createProvider();
  const service = createSearchService(createSearchProviderRegistry([provider]), {
    defaultProviderId: provider.id,
  });
  const result = await service.search({
    query: "  local search  ",
    pageSize: 1,
    language: "en",
    safesearch: 1,
    categories: ["general"],
    timeRange: "day",
  });

  assert.equal(result.providerId, provider.id);
  assert.equal(result.query, "local search");
  assert.equal(result.results.length, 1);
  assert.equal(provider.requests[0].providerId, null);
  assert.equal(provider.requests[0].pageSize, 1);

  await assert.rejects(
    () => service.search({ query: "" }),
    (error) => error instanceof z.ZodError,
  );
});

test("search service supports explicit provider selection and typed missing-default errors", async () => {
  const provider = createProvider({ id: "provider.alt" });
  const service = createSearchService(createSearchProviderRegistry([provider]));
  const selected = await service.search({
    query: "selected",
    providerId: provider.id,
  });

  assert.equal(selected.providerId, provider.id);
  await assert.rejects(
    () => service.search({ query: "missing default" }),
    (error) =>
      error instanceof SearchProviderError &&
      error.code === "search_provider_not_found" &&
      error.providerId === undefined,
  );
});

test("search service normalizes invalid provider responses into safe typed errors", async () => {
  const provider = createProvider({
    responseOverrides: {
      durationMs: -1,
    },
  });
  const service = createSearchService(createSearchProviderRegistry([provider]), {
    defaultProviderId: provider.id,
  });

  await assert.rejects(
    () => service.search({ query: "invalid response" }),
    (error) =>
      error instanceof SearchProviderError &&
      error.code === "search_provider_invalid_response" &&
      error.providerId === provider.id,
  );
});

test("search service exposes provider health and validates health shape", async () => {
  const provider = createProvider();
  const service = createSearchService(createSearchProviderRegistry([provider]));
  const health = await service.getProviderHealth(provider.id);
  const allHealth = await service.listProviderHealth();

  assert.equal(health.status, "healthy");
  assert.deepEqual(allHealth, [health]);

  const invalidHealthProvider = createProvider({
    id: "provider.invalid",
    healthOverrides: { kind: "remote" },
  });
  const invalidHealthService = createSearchService(
    createSearchProviderRegistry([invalidHealthProvider]),
  );

  await assert.rejects(
    () => invalidHealthService.getProviderHealth(invalidHealthProvider.id),
    (error) =>
      error instanceof SearchProviderError &&
      error.code === "search_provider_invalid_response" &&
      error.providerId === invalidHealthProvider.id,
  );
});
