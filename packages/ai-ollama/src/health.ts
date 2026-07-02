import { providerHealthSchema, type ProviderHealth, type ProviderId } from "@pap/contracts";

export type DisabledOllamaHealthInput = {
  providerId?: ProviderId;
  checkedAt?: string;
  model?: string;
};

export function createDisabledOllamaProviderHealth(
  input: DisabledOllamaHealthInput = {},
): ProviderHealth {
  const health = {
    providerId: input.providerId ?? "provider.ollama",
    kind: "ollama",
    status: "unavailable",
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    message: "Ollama provider is disabled by configuration.",
    ...(input.model === undefined ? {} : { model: input.model }),
  };

  return providerHealthSchema.parse(health);
}
