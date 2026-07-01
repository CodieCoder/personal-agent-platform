import type { JsonValue } from "@pap/contracts";

export type ParsedField<TValue> =
  | {
      ok: true;
      value: TValue;
    }
  | {
      ok: false;
      error: string;
    };

export function parseJsonOrString(input: string): JsonValue {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return "";
  }

  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    return trimmed;
  }
}

export function parseJsonArrayField(input: string): ParsedField<JsonValue[]> {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return {
      ok: true,
      value: [],
    };
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (Array.isArray(parsed)) {
      return {
        ok: true,
        value: parsed as JsonValue[],
      };
    }

    return {
      ok: false,
      error: "Expected a JSON array.",
    };
  } catch {
    return {
      ok: false,
      error: "Expected valid JSON.",
    };
  }
}

export function jsonFieldValue(value: JsonValue | JsonValue[] | undefined): string {
  if (value === undefined) {
    return "";
  }

  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function optionalTextValue(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

export function optionalNumberValue(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();

  if (text.length === 0) {
    return undefined;
  }

  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}
