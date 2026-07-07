import type { ExtractionWarning } from "@pap/contracts";

export type TextNormalizationResult = {
  text: string;
  originalLength: number;
  truncated: boolean;
};

export type HtmlNormalizationResult = {
  html: string | null;
  text: string;
  warnings: ExtractionWarning[];
};

const unsafeElementSelector = [
  "script",
  "iframe",
  "frame",
  "frameset",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "object",
  "embed",
].join(",");

export function sanitizeDocument(document: Document): ExtractionWarning[] {
  const removedElements = removeUnsafeElements(document);
  const removedAttributes = removeUnsafeAttributes(document);
  const warnings: ExtractionWarning[] = [];

  if (removedElements > 0 || removedAttributes > 0) {
    warnings.push({
      code: "extraction_html_sanitized",
      message: "Extraction removed unsafe HTML elements or event-handler attributes.",
      count: removedElements + removedAttributes,
    });
  }

  return warnings;
}

export function normalizeTextContent(
  value: string,
  maxContentChars: number,
): TextNormalizationResult {
  const normalized = value.replace(/\s+/gu, " ").trim();

  if (normalized.length <= maxContentChars) {
    return {
      text: normalized,
      originalLength: normalized.length,
      truncated: false,
    };
  }

  return {
    text: normalized.slice(0, maxContentChars).trimEnd(),
    originalLength: normalized.length,
    truncated: true,
  };
}

export function normalizeHtmlFragment(
  document: Document,
  maxContentChars: number,
): HtmlNormalizationResult {
  const warnings = sanitizeDocument(document);
  const body = document.body;
  const text = normalizeTextContent(body?.textContent ?? "", maxContentChars);
  const rawHtml = body?.innerHTML.trim() ?? "";
  const html =
    rawHtml.length > 0 && rawHtml.length <= Math.min(maxContentChars * 2, 250_000) ? rawHtml : null;

  if (text.truncated || (rawHtml.length > 0 && html === null)) {
    warnings.push({
      code: "extraction_content_truncated",
      message: "Extraction content exceeded configured bounds and was truncated.",
      count: text.originalLength,
    });
  }

  return {
    html,
    text: text.text,
    warnings,
  };
}

export function countWords(value: string): number {
  const matches = value.trim().match(/\S+/gu);
  return matches?.length ?? 0;
}

export function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function removeUnsafeElements(document: Document): number {
  const elements = Array.from(document.querySelectorAll(unsafeElementSelector));

  for (const element of elements) {
    element.remove();
  }

  return elements.length;
}

function removeUnsafeAttributes(document: Document): number {
  let removed = 0;

  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();

      if (
        name.startsWith("on") ||
        ((name === "href" || name === "src") && value.startsWith("javascript:"))
      ) {
        element.removeAttribute(attribute.name);
        removed += 1;
      }
    }
  }

  return removed;
}
