import {
  structuredGenerationResultSchema,
  type ProviderId,
  type ResponseSchemaReference,
  type StructuredGenerationResult,
} from "@pap/contracts";
import { AIProviderError, isAIProviderError } from "@pap/ai";
import { z } from "zod";

export type OllamaFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type OllamaClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  keepAlive: string;
  fetch?: OllamaFetch;
  clock?: () => Date;
};

export type OllamaStructuredGenerateInput<TSchema extends z.ZodType = z.ZodType> = {
  providerId: ProviderId;
  model: string;
  systemPrompt: string | null;
  prompt: string;
  responseSchema: Omit<ResponseSchemaReference, "schema"> & {
    schema: TSchema;
  };
  timeoutMs: number;
  keepAlive: string | null;
  temperature: number | null;
  maxTokens: number | null;
};

export type OllamaVersion = {
  version: string;
};

export type OllamaModelTag = {
  name: string;
};

export type OllamaModelTags = {
  models: OllamaModelTag[];
};

const ollamaGenerateResponseSchema = z
  .object({
    model: z.string().trim().min(1).optional(),
    response: z.string(),
    done: z.literal(true),
    prompt_eval_count: z.number().int().nonnegative().optional(),
    eval_count: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const ollamaVersionSchema = z
  .object({
    version: z.string().trim().min(1),
  })
  .passthrough();

const ollamaTagsSchema = z
  .object({
    models: z.array(
      z
        .object({
          name: z.string().trim().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly keepAlive: string;
  private readonly fetchTransport: OllamaFetch;
  private readonly clock: () => Date;

  constructor(options: OllamaClientOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs;
    this.keepAlive = options.keepAlive;
    this.fetchTransport = options.fetch ?? fetch;
    this.clock = options.clock ?? (() => new Date());
  }

  async generateStructured<TSchema extends z.ZodType>(
    input: OllamaStructuredGenerateInput<TSchema>,
  ): Promise<StructuredGenerationResult & { output: z.output<TSchema> }> {
    const startedAt = this.clock().toISOString();
    const body = {
      model: input.model,
      prompt: appendJsonOnlyInstruction(input.prompt),
      ...(input.systemPrompt === null ? {} : { system: input.systemPrompt }),
      stream: false,
      format: toJsonSchemaFormat(input.responseSchema.schema, input.providerId),
      keep_alive: input.keepAlive ?? this.keepAlive,
      options: {
        ...(input.temperature === null ? {} : { temperature: input.temperature }),
        ...(input.maxTokens === null ? {} : { num_predict: input.maxTokens }),
      },
    };

    const response = await this.requestJson({
      providerId: input.providerId,
      path: "/api/generate",
      method: "POST",
      body,
      timeoutMs: input.timeoutMs,
    });
    const parsedResponse = parseOllamaResponse(
      ollamaGenerateResponseSchema,
      response,
      input.providerId,
      "Ollama generate response did not match the expected non-streaming shape.",
    );
    const output = parseModelJsonOutput(parsedResponse.response, input);
    const promptTokenCount = parsedResponse.prompt_eval_count ?? null;
    const completionTokenCount = parsedResponse.eval_count ?? null;
    const completedAt = this.clock().toISOString();
    const totalTokenCount =
      promptTokenCount === null || completionTokenCount === null
        ? null
        : promptTokenCount + completionTokenCount;
    const result = structuredGenerationResultSchema.parse({
      providerId: input.providerId,
      model: parsedResponse.model ?? input.model,
      output,
      rawText: parsedResponse.response,
      startedAt,
      completedAt,
      durationMs: durationBetween(startedAt, completedAt),
      promptTokenCount,
      completionTokenCount,
      totalTokenCount,
    });

    return {
      ...result,
      output,
    };
  }

  async getVersion(input: { providerId: ProviderId; timeoutMs?: number }): Promise<OllamaVersion> {
    const response = await this.requestJson({
      providerId: input.providerId,
      path: "/api/version",
      method: "GET",
      timeoutMs: input.timeoutMs ?? this.timeoutMs,
    });

    return parseOllamaResponse(
      ollamaVersionSchema,
      response,
      input.providerId,
      "Ollama version response did not match the expected shape.",
    );
  }

  async listModels(input: {
    providerId: ProviderId;
    timeoutMs?: number;
  }): Promise<OllamaModelTags> {
    const response = await this.requestJson({
      providerId: input.providerId,
      path: "/api/tags",
      method: "GET",
      timeoutMs: input.timeoutMs ?? this.timeoutMs,
    });

    return parseOllamaResponse(
      ollamaTagsSchema,
      response,
      input.providerId,
      "Ollama model tags response did not match the expected shape.",
    );
  }

  private async requestJson(input: {
    providerId: ProviderId;
    path: string;
    method: "GET" | "POST";
    body?: unknown;
    timeoutMs: number;
  }): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await this.fetchTransport(buildUrl(this.baseUrl, input.path), {
        method: input.method,
        signal: controller.signal,
        ...(input.body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input.body),
            }),
      });

      if (!response.ok) {
        throw httpProviderError(input.providerId, response.status);
      }

      try {
        return await response.json();
      } catch (error) {
        throw new AIProviderError({
          code: "provider_invalid_response",
          providerId: input.providerId,
          message: "Ollama returned a non-JSON response.",
          details: { responseKind: "http_json" },
          cause: error,
        });
      }
    } catch (error) {
      if (isAIProviderError(error)) {
        throw error;
      }

      throw normalizeTransportError(error, input.providerId, controller.signal.aborted);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function appendJsonOnlyInstruction(prompt: string): string {
  return `${prompt}\n\nReturn only valid JSON matching the supplied response schema.`;
}

function buildUrl(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString();
}

function toJsonSchemaFormat(schema: z.ZodType, providerId: ProviderId): Record<string, unknown> {
  try {
    const jsonSchema = z.toJSONSchema(schema);

    if (typeof jsonSchema !== "object" || jsonSchema === null || Array.isArray(jsonSchema)) {
      throw new Error("Zod produced a non-object JSON Schema.");
    }

    return jsonSchema as Record<string, unknown>;
  } catch (error) {
    throw new AIProviderError({
      code: "provider_schema_invalid",
      providerId,
      message: "Response schema could not be converted to JSON Schema for Ollama.",
      cause: error,
    });
  }
}

function parseModelJsonOutput<TSchema extends z.ZodType>(
  rawText: string,
  input: OllamaStructuredGenerateInput<TSchema>,
): z.output<TSchema> {
  let jsonOutput: unknown;

  try {
    jsonOutput = JSON.parse(rawText) as unknown;
  } catch (error) {
    throw new AIProviderError({
      code: "provider_invalid_response",
      providerId: input.providerId,
      message: "Ollama returned malformed JSON model output.",
      details: { schemaId: input.responseSchema.id },
      cause: error,
    });
  }

  const parsed = input.responseSchema.schema.safeParse(jsonOutput);

  if (!parsed.success) {
    throw new AIProviderError({
      code: "provider_schema_invalid",
      providerId: input.providerId,
      message: "Ollama model output did not match the requested response schema.",
      details: {
        schemaId: input.responseSchema.id,
        issues: summarizeZodIssues(parsed.error),
      },
    });
  }

  return parsed.data;
}

function parseOllamaResponse<TSchema extends z.ZodType>(
  schema: TSchema,
  response: unknown,
  providerId: ProviderId,
  message: string,
): z.output<TSchema> {
  const parsed = schema.safeParse(response);

  if (!parsed.success) {
    throw new AIProviderError({
      code: "provider_invalid_response",
      providerId,
      message,
      details: { issues: summarizeZodIssues(parsed.error) },
    });
  }

  return parsed.data;
}

function httpProviderError(providerId: ProviderId, httpStatus: number): AIProviderError {
  if (httpStatus === 429 || httpStatus === 503) {
    return new AIProviderError({
      code: "provider_overloaded",
      providerId,
      retryable: true,
      message: "Ollama is currently overloaded.",
      details: { httpStatus },
    });
  }

  if (httpStatus === 404) {
    return new AIProviderError({
      code: "provider_unavailable",
      providerId,
      message: "Ollama could not find the requested model or endpoint.",
      details: { httpStatus },
    });
  }

  return new AIProviderError({
    code: "provider_http_error",
    providerId,
    retryable: httpStatus >= 500,
    message: "Ollama returned an HTTP error.",
    details: { httpStatus },
  });
}

function normalizeTransportError(
  error: unknown,
  providerId: ProviderId,
  aborted: boolean,
): AIProviderError {
  if (aborted || getErrorName(error) === "AbortError" || getErrorCode(error) === "ETIMEDOUT") {
    return new AIProviderError({
      code: "provider_timeout",
      providerId,
      retryable: true,
      message: "Ollama request timed out.",
    });
  }

  return new AIProviderError({
    code: "provider_unavailable",
    providerId,
    retryable: true,
    message: "Ollama is unavailable.",
  });
}

function getErrorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return undefined;
  }

  return typeof error.name === "string" ? error.name : undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error) {
    return getErrorCode(error.cause);
  }

  return undefined;
}

function durationBetween(startedAt: string, completedAt: string): number {
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}

function summarizeZodIssues(error: z.ZodError): Record<string, unknown>[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}
