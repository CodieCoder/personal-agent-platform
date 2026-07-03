import assert from "node:assert/strict";
import { test } from "vitest";
import {
  classifyBlockedAddress,
  createUrlSafetyPolicy,
  isFetchClientError,
} from "../dist/index.js";

test("URL safety policy normalizes public HTTP and HTTPS URLs", async () => {
  const policy = createUrlSafetyPolicy({
    resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
  });

  assert.equal(
    await policy.validateUrl("https://Example.com/a path?q=1"),
    "https://example.com/a%20path?q=1",
  );
  assert.equal(await policy.validateUrl("http://example.com/"), "http://example.com/");
});

test("URL safety policy rejects unsupported schemes and credentials", async () => {
  const policy = createUrlSafetyPolicy({
    resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
  });

  await assert.rejects(
    () => policy.validateUrl("ftp://example.com/file"),
    (error) => isFetchError(error, "fetch_url_invalid"),
  );
  await assert.rejects(
    () => policy.validateUrl("https://user:pass@example.com/"),
    (error) => isFetchError(error, "fetch_url_invalid"),
  );
  await assert.rejects(
    () => policy.validateUrl("ftp://example.com/file", { phase: "redirect" }),
    (error) => isFetchError(error, "fetch_redirect_blocked"),
  );
});

test("URL safety policy rejects local hostnames before DNS resolution", async () => {
  let resolveCount = 0;
  const policy = createUrlSafetyPolicy({
    resolveHostname: async () => {
      resolveCount += 1;
      return [{ address: "93.184.216.34", family: 4 }];
    },
  });

  for (const url of [
    "http://localhost/",
    "http://app.localhost/",
    "http://printer.local/",
    "http://intranet/",
  ]) {
    await assert.rejects(
      () => policy.validateUrl(url),
      (error) => isFetchError(error, "fetch_url_blocked"),
    );
  }

  assert.equal(resolveCount, 0);
});

test("URL safety policy rejects loopback, link-local, RFC1918, and private-network addresses", async () => {
  const blockedAddresses = [
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:7f00:1",
    "::ffff:192.168.1.10",
    "::ffff:c0a8:10a",
  ];

  for (const address of blockedAddresses) {
    const policy = createUrlSafetyPolicy({
      resolveHostname: async () => [
        {
          address,
          family: address.includes(":") ? 6 : 4,
        },
      ],
    });

    await assert.rejects(
      () => policy.validateUrl("https://example.com/"),
      (error) => isFetchError(error, "fetch_url_blocked"),
    );
    assert.notEqual(classifyBlockedAddress(address), null);
  }
});

test("URL safety policy reclassifies direct IP literals without using injected DNS", async () => {
  let resolveCount = 0;
  const policy = createUrlSafetyPolicy({
    resolveHostname: async () => {
      resolveCount += 1;
      return [{ address: "93.184.216.34", family: 4 }];
    },
  });

  await assert.rejects(
    () => policy.validateUrl("http://127.0.0.1/"),
    (error) => isFetchError(error, "fetch_url_blocked"),
  );
  await assert.rejects(
    () => policy.validateUrl("http://[::1]/", { phase: "redirect" }),
    (error) => isFetchError(error, "fetch_redirect_blocked"),
  );
  await assert.rejects(
    () => policy.validateUrl("http://[::ffff:127.0.0.1]/"),
    (error) => isFetchError(error, "fetch_url_blocked"),
  );
  await assert.rejects(
    () => policy.validateUrl("http://[::ffff:c0a8:10a]/", { phase: "redirect" }),
    (error) => isFetchError(error, "fetch_redirect_blocked"),
  );
  assert.equal(resolveCount, 0);
});

test("URL safety policy maps DNS failures to safe network errors", async () => {
  const policy = createUrlSafetyPolicy({
    resolveHostname: async () => {
      throw Object.assign(new Error("no such host"), { code: "ENOTFOUND" });
    },
  });

  await assert.rejects(
    () => policy.validateUrl("https://example.com/"),
    (error) => isFetchError(error, "fetch_network_error") && error.retryable === true,
  );
});

function isFetchError(error, code) {
  return isFetchClientError(error) && error.code === code;
}
