import { createSearchProviderRegistry, type SearchProviderRegistry } from "@pap/tools-search";
import { resolveSearxngConfig, type SearxngConfig } from "./config.js";
import { defaultSearxngProviderId, SearxngProvider } from "./searxng-provider.js";

export type CreateSearxngSearchProviderRegistryOptions = {
  env?: Record<string, string | undefined>;
  providerId?: string;
};

export function resolveRuntimeSearxngConfig(
  env: Record<string, string | undefined> = process.env,
): SearxngConfig {
  return resolveSearxngConfig(env);
}

export function createSearxngSearchProviderRegistry(
  options: CreateSearxngSearchProviderRegistryOptions = {},
): SearchProviderRegistry {
  return createSearchProviderRegistry([
    new SearxngProvider({
      providerId: options.providerId ?? defaultSearxngProviderId,
      config: resolveRuntimeSearxngConfig(options.env),
    }),
  ]);
}
