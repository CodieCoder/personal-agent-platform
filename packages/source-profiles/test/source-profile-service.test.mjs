import assert from "node:assert/strict";
import { test } from "vitest";
import { createSourceProfileService } from "../dist/index.js";

const profileHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Fallback Title</title>
    <meta property="og:site_name" content="Profile Times" />
    <meta property="article:published_time" content="2026-07-03T09:00:00.000Z" />
  </head>
  <body>
    <main class="article">
      <h1 class="headline">Profiled Article</h1>
      <span class="byline">By Profile Writer</span>
      <time class="published">2026-07-03T09:00:00.000Z</time>
      <a class="canonical" href="/profiled"></a>
      <section class="body" onmouseover="steal()">
        <p>
          Selector extraction should choose this domain-specific article body before generic
          readability fallback runs. The text here is intentionally long enough to satisfy the
          extraction quality threshold while remaining deterministic for unit tests.
        </p>
        <p>
          Unsafe event handler attributes and form elements should be removed from the normalized
          article HTML while preserving the useful article paragraphs for later inspection.
        </p>
        <form><input value="secret" /></form>
      </section>
    </main>
  </body>
</html>`;

const fallbackHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Fallback Article</title>
  </head>
  <body>
    <article>
      <h1>Fallback Article</h1>
      <p>
        Invalid selectors should not prevent generic extraction from running. This fixture gives
        Readability enough clear article text to recover a normalized result after the source
        profile attempt records a warning.
      </p>
      <p>
        The fallback result keeps the final extraction method honest by reporting readability,
        while still carrying the selector warning that explains why the profile was skipped.
      </p>
    </article>
  </body>
</html>`;

test("source-profile service matches active profiles by normalized hostname", async () => {
  const repository = new MemorySourceProfileRepository([createProfile()]);
  const service = createSourceProfileService({ repository });

  const profile = await service.findActiveProfileForUrl("https://News.Example.com/path");

  assert.equal(profile?.id, "source_profile_news");
  assert.equal(repository.lastDomain, "news.example.com");
});

test("source-profile selectors run before generic Readability fallback", async () => {
  const service = createSourceProfileService({
    repository: new MemorySourceProfileRepository([createProfile()]),
    clock: () => new Date("2026-07-03T10:00:00.000Z"),
  });

  const document = await service.extract({
    finalUrl: "https://news.example.com/profiled",
    html: profileHtml,
    contentType: "text/html",
  });

  assert.equal(document.method, "source_profile");
  assert.equal(document.metadata.sourceProfileId, "source_profile_news");
  assert.equal(document.title, "Profiled Article");
  assert.equal(document.byline, "By Profile Writer");
  assert.equal(document.canonicalUrl, "https://news.example.com/profiled");
  assert.match(document.contentText, /Selector extraction should choose/u);
  assert.equal(document.contentHtml?.includes("onmouseover"), false);
  assert.equal(document.contentHtml?.includes("<form"), false);
});

test("invalid source-profile selectors produce warnings and fall back to Readability", async () => {
  const service = createSourceProfileService({
    repository: new MemorySourceProfileRepository([
      createProfile({
        articleContainerSelector: null,
        contentSelector: "article[",
      }),
    ]),
    clock: () => new Date("2026-07-03T10:00:00.000Z"),
  });

  const document = await service.extract({
    finalUrl: "https://news.example.com/fallback",
    html: fallbackHtml,
    contentType: "text/html",
  });

  assert.equal(document.method, "readability");
  assert.equal(
    document.warnings.some((warning) => warning.code === "extraction_selector_invalid"),
    true,
  );
  assert.match(document.contentText, /Invalid selectors should not prevent/u);
});

test("malformed XHTML profile parsing warns and falls back without leaking parser errors", async () => {
  const service = createSourceProfileService({
    repository: new MemorySourceProfileRepository([createProfile({ contentSelector: "article" })]),
    readabilityExtractor: {
      async extract(request) {
        const contentText = "Fallback extractor recovered from malformed XHTML text content.";

        return {
          title: null,
          byline: null,
          siteName: null,
          publishedAt: null,
          language: null,
          canonicalUrl: request.finalUrl,
          excerpt: contentText,
          contentText,
          contentHtml: null,
          wordCount: 8,
          method: "plain_text",
          warnings: [],
          metadata: {
            requestedUrl: request.requestedUrl,
            finalUrl: request.finalUrl,
            sourceProfileId: request.sourceProfileId,
            contentType: request.contentType,
            contentChars: contentText.length,
            originalContentChars: request.html?.length ?? 0,
            maxContentChars: request.maxContentChars ?? 50_000,
            extractedAt: "2026-07-03T10:00:00.000Z",
          },
        };
      },
    },
    clock: () => new Date("2026-07-03T10:00:00.000Z"),
  });

  const document = await service.extract({
    finalUrl: "https://news.example.com/malformed",
    html: "<html><body><article>Malformed XHTML content",
    contentType: "application/xhtml+xml",
  });

  assert.equal(document.method, "plain_text");
  assert.equal(
    document.warnings.some((warning) => warning.code === "extraction_profile_invalid"),
    true,
  );
  assert.match(document.contentText, /Fallback extractor recovered/u);
});

test("text-only input can fall back to bounded plain text when profile extraction is not applicable", async () => {
  const service = createSourceProfileService({
    repository: new MemorySourceProfileRepository([createProfile()]),
    clock: () => new Date("2026-07-03T10:00:00.000Z"),
  });

  const document = await service.extract({
    finalUrl: "https://news.example.com/plain",
    text: "Plain text fallback remains valid when profile extraction cannot run against supplied HTML.",
    contentType: "text/plain",
    minWordCount: 4,
  });

  assert.equal(document.method, "plain_text");
  assert.equal(
    document.warnings.some((warning) => warning.code === "extraction_profile_invalid"),
    true,
  );
});

function createProfile(overrides = {}) {
  return {
    id: "source_profile_news",
    domain: "news.example.com",
    name: "News Example",
    status: "active",
    articleContainerSelector: "main.article",
    titleSelector: ".headline",
    bylineSelector: ".byline",
    publishedAtSelector: ".published",
    contentSelector: ".body",
    canonicalUrlSelector: ".canonical",
    notes: null,
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

class MemorySourceProfileRepository {
  lastDomain = null;

  constructor(profiles) {
    this.profiles = profiles;
  }

  async create() {
    throw new Error("Not implemented for this unit test.");
  }

  async getById(id) {
    return this.profiles.find((profile) => profile.id === id) ?? null;
  }

  async getActiveByDomain(domain) {
    this.lastDomain = domain;
    return (
      this.profiles.find((profile) => profile.domain === domain && profile.status === "active") ??
      null
    );
  }

  async list() {
    return this.profiles.filter((profile) => profile.status === "active");
  }

  async update() {
    throw new Error("Not implemented for this unit test.");
  }

  async archive() {
    throw new Error("Not implemented for this unit test.");
  }
}
