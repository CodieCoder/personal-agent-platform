import assert from "node:assert/strict";
import { test } from "vitest";
import {
  ArticleExtractionError,
  createReadabilityExtractor,
  isArticleExtractionError,
} from "../dist/index.js";

const readableHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Fixture Article</title>
    <link rel="canonical" href="/articles/fixture" />
    <meta property="og:site_name" content="Fixture Times" />
    <meta name="author" content="Ada Example" />
    <meta property="article:published_time" content="2026-07-03T09:00:00.000Z" />
    <meta name="description" content="A deterministic extraction fixture." />
  </head>
  <body>
    <script>window.evil = true;</script>
    <iframe src="https://tracker.example/embed"></iframe>
    <form action="/submit"><input name="secret" value="token" /></form>
    <article onclick="steal()">
      <h1>Fixture Article</h1>
      <p>
        Personal agent systems need deterministic extraction before any analysis begins. This
        fixture includes enough human-readable article prose to let Readability identify the main
        content without fetching remote resources or executing browser scripts.
      </p>
      <p>
        The normalized result should keep useful article text, preserve safe paragraph markup, and
        remove scripts, frames, forms, and event handler attributes from the final HTML snapshot.
      </p>
    </article>
  </body>
</html>`;

test("generic Readability extraction normalizes supplied HTML without retaining unsafe content", async () => {
  const extractor = createReadabilityExtractor({
    clock: () => new Date("2026-07-03T09:30:00.000Z"),
  });

  const document = await extractor.extract({
    finalUrl: "https://fixture.example/articles/fixture",
    html: readableHtml,
    contentType: "text/html",
  });

  assert.equal(document.method, "readability");
  assert.equal(document.title, "Fixture Article");
  assert.equal(document.byline, "Ada Example");
  assert.equal(document.siteName, "Fixture Times");
  assert.equal(document.canonicalUrl, "https://fixture.example/articles/fixture");
  assert.equal(document.wordCount > 30, true);
  assert.match(document.contentText, /deterministic extraction/u);
  assert.equal(document.contentHtml?.includes("<script"), false);
  assert.equal(document.contentHtml?.includes("<iframe"), false);
  assert.equal(document.contentHtml?.includes("<form"), false);
  assert.equal(document.contentHtml?.includes("onclick"), false);
  assert.equal(
    document.warnings.some((warning) => warning.code === "extraction_html_sanitized"),
    true,
  );
});

test("plain text responses can use bounded plain_text fallback", async () => {
  const extractor = createReadabilityExtractor({
    clock: () => new Date("2026-07-03T10:00:00.000Z"),
    defaultPlainTextMinWordCount: 4,
  });

  const longText = `Plain text extraction remains useful when the server returns a valid text response. ${"bounded ".repeat(220)}`;

  const document = await extractor.extract({
    finalUrl: "https://fixture.example/plain.txt",
    text: longText,
    contentType: "text/plain",
    maxContentChars: 1_000,
  });

  assert.equal(document.method, "plain_text");
  assert.equal(document.contentHtml, null);
  assert.equal(document.contentText.length <= 1_000, true);
  assert.match(document.contentText, /^Plain text extraction remains/u);
  assert.equal(
    document.warnings.some((warning) => warning.code === "extraction_content_truncated"),
    true,
  );
});

test("HTML extraction falls back to sanitized visible text when Readability output is too narrow", async () => {
  const extractor = createReadabilityExtractor({
    clock: () => new Date("2026-07-03T10:30:00.000Z"),
    defaultReadabilityMinWordCount: 1_000,
    defaultPlainTextMinWordCount: 20,
  });

  const document = await extractor.extract({
    finalUrl: "https://fixture.example/articles/fixture",
    html: readableHtml,
    contentType: "text/html",
  });

  assert.equal(document.method, "plain_text");
  assert.equal(document.title, "Fixture Article");
  assert.equal(document.canonicalUrl, "https://fixture.example/articles/fixture");
  assert.match(document.contentText, /Personal agent systems need deterministic extraction/u);
  assert.equal(
    document.warnings.some((warning) => warning.code === "extraction_plain_text_fallback"),
    true,
  );
});

test("empty or low-quality content returns a typed extraction failure with warnings", async () => {
  const extractor = createReadabilityExtractor({
    defaultReadabilityMinWordCount: 20,
  });

  await assert.rejects(
    () =>
      extractor.extract({
        finalUrl: "https://fixture.example/empty",
        html: "<html><body><article>Too short.</article></body></html>",
        contentType: "text/html",
      }),
    (error) => {
      assert.equal(error instanceof ArticleExtractionError, true);
      assert.equal(isArticleExtractionError(error), true);
      assert.equal(error.code, "extraction_content_too_short");
      assert.equal(
        error.warnings.some((warning) => warning.code === "extraction_low_quality"),
        true,
      );
      return true;
    },
  );
});
