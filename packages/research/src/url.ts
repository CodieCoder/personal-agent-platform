import { httpOrHttpsSearchUrlSchema } from "@pap/contracts";
import { compareStrings } from "./ids.js";
import { ResearchPreparationError } from "./errors.js";

export type CanonicalResearchUrl = {
  canonicalUrl: string;
  normalizedHostname: string;
  normalizedUrl: string;
};

const trackingParameterNames = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "srsltid",
]);

export function canonicalizeResearchUrl(url: string): string {
  const canonicalized = safeCanonicalizeResearchUrl(url);

  if (!canonicalized) {
    throw new ResearchPreparationError(
      "research_url_invalid",
      "Research URL must be an absolute HTTP or HTTPS URL without credentials.",
    );
  }

  return canonicalized.canonicalUrl;
}

export function safeCanonicalizeResearchUrl(value: unknown): CanonicalResearchUrl | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedUrl = httpOrHttpsSearchUrlSchema.safeParse(value);

  if (!normalizedUrl.success) {
    return null;
  }

  const parsed = new URL(normalizedUrl.data);

  if (parsed.username !== "" || parsed.password !== "") {
    return null;
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  parsed.hash = "";

  if (parsed.pathname === "") {
    parsed.pathname = "/";
  } else if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  }

  const sortedParameters = Array.from(parsed.searchParams.entries())
    .filter(([key]) => !isTrackingParameter(key))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = compareStrings(leftKey, rightKey);
      return keyComparison === 0 ? compareStrings(leftValue, rightValue) : keyComparison;
    });

  parsed.search = "";

  for (const [key, parameterValue] of sortedParameters) {
    parsed.searchParams.append(key, parameterValue);
  }

  const canonicalUrl = parsed.toString();

  return {
    canonicalUrl,
    normalizedHostname: normalizeResearchHostname(canonicalUrl),
    normalizedUrl: normalizedUrl.data,
  };
}

export function normalizeResearchHostname(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/u, "");
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

function isTrackingParameter(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return normalizedKey.startsWith("utm_") || trackingParameterNames.has(normalizedKey);
}
