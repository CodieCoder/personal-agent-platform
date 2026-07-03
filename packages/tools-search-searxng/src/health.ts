import {
  searchProviderHealthSchema,
  type SearchProviderHealth,
  type SearchProviderId,
} from "@pap/contracts";

export type DisabledSearxngHealthInput = {
  providerId?: SearchProviderId;
  checkedAt?: string;
};

export function createDisabledSearxngProviderHealth(
  input: DisabledSearxngHealthInput = {},
): SearchProviderHealth {
  const health = {
    providerId: input.providerId ?? "provider.searxng",
    kind: "searxng",
    status: "disabled",
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    message: "SearXNG search provider is disabled by configuration.",
  };

  return searchProviderHealthSchema.parse(health);
}
