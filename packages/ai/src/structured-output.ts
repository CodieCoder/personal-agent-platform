import {
  structuredGenerationRequestSchema,
  structuredGenerationResultSchema,
  type StructuredGenerationResult,
} from "@pap/contracts";
import type { z } from "zod";
import { AIProviderError } from "./errors.js";
import type {
  StructuredGenerationResultFor,
  StructuredGenerationService,
  TypedResponseSchemaReference,
  TypedStructuredGenerationRequest,
} from "./provider.js";
import type { AIProviderRegistry } from "./registry.js";
import { selectAIProviderForRequest } from "./registry.js";

export function validateStructuredGenerationResult<TSchema extends z.ZodType>(
  result: StructuredGenerationResult,
  responseSchema: TypedResponseSchemaReference<TSchema>,
): StructuredGenerationResultFor<z.output<TSchema>> {
  const parsed = responseSchema.schema.safeParse(result.output);

  if (!parsed.success) {
    throw new AIProviderError({
      code: "provider_schema_invalid",
      providerId: result.providerId,
      message: "Provider output did not match the requested response schema.",
      details: {
        schemaId: responseSchema.id,
        issues: parsed.error.issues,
      },
    });
  }

  return {
    ...result,
    output: parsed.data,
  };
}

export function createStructuredGenerationService(
  registry: AIProviderRegistry,
): StructuredGenerationService {
  return {
    async generateStructured<TSchema extends z.ZodType>(
      request: TypedStructuredGenerationRequest<TSchema>,
    ): Promise<StructuredGenerationResultFor<z.output<TSchema>>> {
      const parsedRequest = structuredGenerationRequestSchema.parse(request);
      const provider = selectAIProviderForRequest(registry, parsedRequest);
      const result = await provider.generateStructured(parsedRequest);
      const parsedResult = structuredGenerationResultSchema.safeParse(result);

      if (!parsedResult.success) {
        throw new AIProviderError({
          code: "provider_invalid_response",
          providerId: parsedRequest.providerId,
          message: "Provider result did not match the structured generation result contract.",
          details: {
            issues: parsedResult.error.issues,
          },
        });
      }

      return validateStructuredGenerationResult(parsedResult.data, request.responseSchema);
    },
  };
}
