import { createAIProviderRegistry, type AIProviderRegistry } from "@pap/ai";
import { resolveOllamaConfig, type OllamaConfig } from "./config.js";
import { defaultOllamaProviderId, OllamaProvider } from "./ollama-provider.js";

export type CreateOllamaProviderRegistryOptions = {
  env?: Record<string, string | undefined>;
  providerId?: string;
};

export function resolveRuntimeOllamaConfig(
  env: Record<string, string | undefined> = process.env,
): OllamaConfig {
  return resolveOllamaConfig({
    OLLAMA_ENABLED: "false",
    ...env,
  });
}

export function createOllamaProviderRegistry(
  options: CreateOllamaProviderRegistryOptions = {},
): AIProviderRegistry {
  return createAIProviderRegistry([
    new OllamaProvider({
      providerId: options.providerId ?? defaultOllamaProviderId,
      config: resolveRuntimeOllamaConfig(options.env),
    }),
  ]);
}
