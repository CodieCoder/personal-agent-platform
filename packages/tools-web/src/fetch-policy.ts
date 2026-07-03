import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { fetchUrlSchema, type FetchUrl } from "@pap/contracts";
import { FetchClientError } from "./errors.js";

export type UrlPolicyPhase = "request" | "redirect";

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type UrlResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export type UrlPolicyContext = {
  phase?: UrlPolicyPhase;
  fromUrl?: FetchUrl;
};

export interface UrlSafetyPolicy {
  validateUrl(url: string, context?: UrlPolicyContext): Promise<FetchUrl>;
}

export type CreateUrlSafetyPolicyOptions = {
  resolveHostname?: UrlResolver;
};

export function createUrlSafetyPolicy(options: CreateUrlSafetyPolicyOptions = {}): UrlSafetyPolicy {
  const resolveHostname = options.resolveHostname ?? defaultResolveHostname;

  return {
    async validateUrl(value, context = {}) {
      const phase = context.phase ?? "request";
      const parsedUrl = parsePolicyUrl(value, phase);
      const url = new URL(parsedUrl);
      const hostname = normalizeHostname(url.hostname);

      if (isLocalHostname(hostname)) {
        throw blockedUrlError(parsedUrl, phase, "local_hostname");
      }

      if (isIP(hostname) !== 0) {
        const blockReason = classifyBlockedAddress(hostname);

        if (blockReason !== null) {
          throw blockedUrlError(parsedUrl, phase, blockReason);
        }

        return parsedUrl;
      }

      let addresses: ResolvedAddress[];

      try {
        addresses = await resolveHostname(hostname);
      } catch (error) {
        throw new FetchClientError({
          code: "fetch_network_error",
          url: parsedUrl,
          retryable: true,
          message: "Fetch URL hostname could not be resolved.",
          details: { reason: "dns_resolution_failed" },
          cause: error,
        });
      }

      if (addresses.length === 0) {
        throw new FetchClientError({
          code: "fetch_network_error",
          url: parsedUrl,
          retryable: true,
          message: "Fetch URL hostname did not resolve to an address.",
          details: { reason: "dns_no_addresses" },
        });
      }

      for (const address of addresses) {
        const blockReason = classifyBlockedAddress(address.address);

        if (blockReason !== null) {
          throw blockedUrlError(parsedUrl, phase, blockReason);
        }
      }

      return parsedUrl;
    },
  };
}

export async function defaultResolveHostname(hostname: string): Promise<ResolvedAddress[]> {
  const normalizedHostname = normalizeHostname(hostname);
  const directAddressFamily = isIP(normalizedHostname);

  if (directAddressFamily === 4 || directAddressFamily === 6) {
    return [{ address: normalizedHostname, family: directAddressFamily }];
  }

  const records = await lookup(normalizedHostname, {
    all: true,
    verbatim: true,
  });

  return records.map((record) => ({
    address: record.address,
    family: record.family === 4 ? 4 : 6,
  }));
}

export function classifyBlockedAddress(address: string): string | null {
  const normalized = normalizeHostname(address);
  const ipv4Mapped = parseIpv4MappedIpv6(normalized);

  if (ipv4Mapped !== null) {
    return classifyBlockedIpv4(ipv4Mapped);
  }

  const family = isIP(normalized);

  if (family === 4) {
    return classifyBlockedIpv4(normalized);
  }

  if (family === 6) {
    return classifyBlockedIpv6(normalized);
  }

  return "unresolved_address";
}

function parsePolicyUrl(value: string, phase: UrlPolicyPhase): FetchUrl {
  const parsed = fetchUrlSchema.safeParse(value);

  if (!parsed.success) {
    throw new FetchClientError({
      code: phase === "redirect" ? "fetch_redirect_blocked" : "fetch_url_invalid",
      message:
        phase === "redirect"
          ? "Redirect target URL is invalid or unsupported."
          : "Fetch URL is invalid or unsupported.",
      details: { reason: "url_parse_failed" },
    });
  }

  return parsed.data;
}

function blockedUrlError(url: FetchUrl, phase: UrlPolicyPhase, reason: string): FetchClientError {
  return new FetchClientError({
    code: phase === "redirect" ? "fetch_redirect_blocked" : "fetch_url_blocked",
    url,
    message:
      phase === "redirect"
        ? "Redirect target is blocked by URL safety policy."
        : "Fetch URL is blocked by URL safety policy.",
    details: { reason },
  });
}

function normalizeHostname(hostname: string): string {
  const lower = hostname.trim().toLowerCase();
  return lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    (!hostname.includes(".") && isIP(hostname) === 0)
  );
}

function classifyBlockedIpv4(address: string): string | null {
  const octets = address.split(".").map((part) => Number.parseInt(part, 10));

  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return "invalid_ipv4_address";
  }

  const [first = 0, second = 0] = octets;

  if (first === 0) {
    return "ipv4_unspecified";
  }

  if (first === 10) {
    return "ipv4_rfc1918_10_8";
  }

  if (first === 127) {
    return "ipv4_loopback";
  }

  if (first === 169 && second === 254) {
    return "ipv4_link_local";
  }

  if (first === 172 && second >= 16 && second <= 31) {
    return "ipv4_rfc1918_172_16_12";
  }

  if (first === 192 && second === 168) {
    return "ipv4_rfc1918_192_168_16";
  }

  if (first === 100 && second >= 64 && second <= 127) {
    return "ipv4_carrier_grade_nat";
  }

  if (first === 198 && (second === 18 || second === 19)) {
    return "ipv4_benchmark_network";
  }

  if (first >= 224) {
    return "ipv4_reserved_or_multicast";
  }

  return null;
}

function classifyBlockedIpv6(address: string): string | null {
  const normalized = address.toLowerCase();

  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") {
    return "ipv6_unspecified";
  }

  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return "ipv6_loopback";
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return "ipv6_unique_local";
  }

  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return "ipv6_link_local";
  }

  if (normalized.startsWith("ff")) {
    return "ipv6_multicast";
  }

  return null;
}

function parseIpv4MappedIpv6(address: string): string | null {
  const prefix = "::ffff:";

  if (!address.startsWith(prefix)) {
    const hextets = expandIpv6Hextets(address);

    if (hextets === null || !isIpv4MappedHextets(hextets)) {
      return null;
    }

    return ipv4FromMappedHextets(hextets);
  }

  const mapped = address.slice(prefix.length);

  if (isIP(mapped) === 4) {
    return mapped;
  }

  const hextets = expandIpv6Hextets(address);

  if (hextets === null || !isIpv4MappedHextets(hextets)) {
    return null;
  }

  return ipv4FromMappedHextets(hextets);
}

function expandIpv6Hextets(address: string): number[] | null {
  if (isIP(address) !== 6) {
    return null;
  }

  const dottedIpv4 = parseTrailingIpv4(address);
  const ipv6Part = dottedIpv4 === null ? address : address.slice(0, dottedIpv4.prefixEndIndex);
  const halves = ipv6Part.split("::");

  if (halves.length > 2) {
    return null;
  }

  const left = parseHextets(halves[0] ?? "");
  const right = parseHextets(halves[1] ?? "");

  if (left === null || right === null) {
    return null;
  }

  const explicitRight = dottedIpv4 === null ? right : [...right, ...dottedIpv4.hextets];
  const explicitLength = left.length + explicitRight.length;

  if (halves.length === 1) {
    return explicitLength === 8 ? [...left, ...explicitRight] : null;
  }

  const zeroFillLength = 8 - explicitLength;

  if (zeroFillLength < 1) {
    return null;
  }

  return [...left, ...Array.from({ length: zeroFillLength }, () => 0), ...explicitRight];
}

function parseTrailingIpv4(
  address: string,
): { prefixEndIndex: number; hextets: [number, number] } | null {
  if (!address.includes(".")) {
    return null;
  }

  const lastColonIndex = address.lastIndexOf(":");

  if (lastColonIndex < 0) {
    return null;
  }

  const ipv4 = address.slice(lastColonIndex + 1);

  if (isIP(ipv4) !== 4) {
    return null;
  }

  return {
    prefixEndIndex: lastColonIndex,
    hextets: ipv4ToHextets(ipv4),
  };
}

function parseHextets(value: string): number[] | null {
  if (value === "") {
    return [];
  }

  return value.split(":").map((part) => {
    if (!/^[0-9a-f]{1,4}$/u.test(part)) {
      return Number.NaN;
    }

    return Number.parseInt(part, 16);
  });
}

function isIpv4MappedHextets(hextets: number[]): boolean {
  return (
    hextets.length === 8 && hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff
  );
}

function ipv4FromMappedHextets(hextets: number[]): string {
  const [third = 0, fourth = 0] = hextets.slice(6);
  return `${third >> 8}.${third & 0xff}.${fourth >> 8}.${fourth & 0xff}`;
}

function ipv4ToHextets(address: string): [number, number] {
  const [first = 0, second = 0, third = 0, fourth = 0] = address
    .split(".")
    .map((part) => Number.parseInt(part, 10));

  return [(first << 8) | second, (third << 8) | fourth];
}
