import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createGuardedFetchClient,
  createUrlSafetyPolicy,
  isFetchClientError,
} from "../dist/index.js";

test("guarded fetch client fetches bounded HTML and plain text responses", async () => {
  const htmlClient = createTestClient({
    fetch: async () =>
      new Response("<h1>Hello</h1>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-length": "14",
        },
      }),
    clock: createClock(["2026-07-03T09:00:00.000Z", "2026-07-03T09:00:00.125Z"]),
  });
  const htmlResult = await htmlClient.fetch({
    url: "https://example.com/start",
    maxBytes: 100,
  });

  assert.equal(htmlResult.finalUrl, "https://example.com/start");
  assert.equal(htmlResult.contentType, "text/html");
  assert.equal(htmlResult.html, "<h1>Hello</h1>");
  assert.equal(htmlResult.text, null);
  assert.equal(htmlResult.metadata.contentBytes, 14);
  assert.equal(htmlResult.durationMs, 125);

  const textClient = createTestClient({
    fetch: async () =>
      new Response("Plain", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": "5",
        },
      }),
  });
  const textResult = await textClient.fetch({ url: "https://example.com/plain" });

  assert.equal(textResult.contentType, "text/plain");
  assert.equal(textResult.html, null);
  assert.equal(textResult.text, "Plain");
});

test("guarded fetch client manually follows redirects after policy revalidation", async () => {
  const calls = [];
  const client = createTestClient({
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });

      if (String(url).endsWith("/start")) {
        return new Response("", {
          status: 302,
          headers: { location: "/final" },
        });
      }

      return new Response("Final", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": "5",
        },
      });
    },
  });
  const result = await client.fetch({ url: "https://example.com/start" });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(calls[0].init.signal instanceof AbortSignal, true);
  assert.equal(result.finalUrl, "https://example.com/final");
  assert.equal(result.redirects.length, 1);
  assert.deepEqual(result.redirects[0], {
    fromUrl: "https://example.com/start",
    toUrl: "https://example.com/final",
    statusCode: 302,
  });
  assert.equal(result.warnings[0].code, "fetch_redirect_followed");
});

test("guarded fetch client blocks unsafe redirects before following them", async () => {
  const calls = [];
  const client = createTestClient({
    fetch: async (url) => {
      calls.push(String(url));
      return new Response("", {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      });
    },
  });

  await assert.rejects(
    () => client.fetch({ url: "https://example.com/start" }),
    (error) => isFetchError(error, "fetch_redirect_blocked"),
  );
  assert.equal(calls.length, 1);
});

test("guarded fetch client enforces redirect limits", async () => {
  const client = createTestClient({
    fetch: async (url) =>
      new Response("", {
        status: 302,
        headers: {
          location: String(url).endsWith("/start") ? "/one" : "/two",
        },
      }),
  });

  await assert.rejects(
    () => client.fetch({ url: "https://example.com/start", maxRedirects: 1 }),
    (error) => isFetchError(error, "fetch_redirect_limit"),
  );
});

test("guarded fetch client maps HTTP, unsupported content-type, and invalid response errors", async () => {
  const httpClient = createTestClient({
    fetch: async () =>
      new Response("missing", {
        status: 503,
        headers: { "content-type": "text/plain" },
      }),
  });

  await assert.rejects(
    () => httpClient.fetch({ url: "https://example.com/" }),
    (error) => isFetchError(error, "fetch_http_error") && error.retryable === true,
  );

  for (const contentType of [
    "application/pdf",
    "image/png",
    "application/zip",
    "video/mp4",
    "application/octet-stream",
  ]) {
    const binaryClient = createTestClient({
      fetch: async () =>
        new Response("binary", {
          status: 200,
          headers: { "content-type": contentType },
        }),
    });

    await assert.rejects(
      () => binaryClient.fetch({ url: "https://example.com/file" }),
      (error) => isFetchError(error, "fetch_content_type_unsupported"),
    );
  }

  const invalidClient = createTestClient({
    fetch: async () => ({ status: 200 }),
  });

  await assert.rejects(
    () => invalidClient.fetch({ url: "https://example.com/" }),
    (error) => isFetchError(error, "fetch_invalid_response"),
  );
});

test("guarded fetch client rejects oversized bodies from headers and streams", async () => {
  const headerClient = createTestClient({
    fetch: async () =>
      new Response("tiny", {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-length": "1000",
        },
      }),
  });

  await assert.rejects(
    () => headerClient.fetch({ url: "https://example.com/large", maxBytes: 10 }),
    (error) => isFetchError(error, "fetch_response_too_large"),
  );

  const streamClient = createTestClient({
    fetch: async () =>
      new Response("abcdef", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
  });

  await assert.rejects(
    () => streamClient.fetch({ url: "https://example.com/stream", maxBytes: 3 }),
    (error) => isFetchError(error, "fetch_response_too_large"),
  );
});

test("guarded fetch client maps timeout and network failures safely", async () => {
  const timeoutClient = createTestClient({
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  });

  await assert.rejects(
    () => timeoutClient.fetch({ url: "https://example.com/slow", timeoutMs: 100 }),
    (error) => isFetchError(error, "fetch_timeout") && error.retryable === true,
  );

  const networkClient = createTestClient({
    fetch: async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("connect failed"), { code: "ECONNRESET" }),
      });
    },
  });

  await assert.rejects(
    () => networkClient.fetch({ url: "https://example.com/" }),
    (error) => isFetchError(error, "fetch_network_error") && error.retryable === true,
  );
});

test("guarded fetch client applies accepted content-type configuration", async () => {
  const client = createTestClient({
    fetch: async () =>
      new Response("<h1>Hello</h1>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
  });

  await assert.rejects(
    () =>
      client.fetch({
        url: "https://example.com/",
        acceptedContentTypes: ["text/plain"],
      }),
    (error) => isFetchError(error, "fetch_content_type_unsupported"),
  );
});

function createTestClient({ fetch, clock } = {}) {
  return createGuardedFetchClient({
    fetch,
    clock,
    policy: createUrlSafetyPolicy({
      resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
    }),
  });
}

function createClock(timestamps) {
  const queue = [...timestamps];

  return () => new Date(queue.shift() ?? timestamps.at(-1));
}

function isFetchError(error, code) {
  return isFetchClientError(error) && error.code === code;
}
