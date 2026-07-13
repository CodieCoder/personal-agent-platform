export type QaProviderMode = "live" | "fixture";

export function resolveProviderMode(value: string | undefined): QaProviderMode {
  if (value === undefined || value.trim() === "") {
    return "live";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "live" || normalized === "fixture") {
    return normalized;
  }

  throw new Error("PAP_QA_PROVIDER_MODE must be 'live' or 'fixture'.");
}

export function shouldRunFeature(input: { entry: string; providerMode: QaProviderMode }): boolean {
  if (input.entry.endsWith(".fixture.feature")) {
    return input.providerMode === "fixture";
  }

  if (input.entry.endsWith(".live.feature")) {
    return input.providerMode === "live";
  }

  return true;
}
