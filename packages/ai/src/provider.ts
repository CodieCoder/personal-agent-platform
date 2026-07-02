import type {
  ProviderHealth,
  ProviderId,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from "@pap/contracts";
import type { z } from "zod";

export type StructuredGenerationResultFor<TOutput> = Omit<StructuredGenerationResult, "output"> & {
  output: TOutput;
};

export type TypedResponseSchemaReference<TSchema extends z.ZodType> = Omit<
  StructuredGenerationRequest["responseSchema"],
  "schema"
> & {
  schema: TSchema;
};

export type TypedStructuredGenerationRequest<TSchema extends z.ZodType> = Omit<
  StructuredGenerationRequest,
  "responseSchema"
> & {
  responseSchema: TypedResponseSchemaReference<TSchema>;
};

export interface AIProvider {
  readonly id: ProviderId;

  health(): Promise<ProviderHealth>;

  generateStructured(request: StructuredGenerationRequest): Promise<StructuredGenerationResult>;
}

export interface StructuredGenerationService {
  generateStructured<TSchema extends z.ZodType>(
    request: TypedStructuredGenerationRequest<TSchema>,
  ): Promise<StructuredGenerationResultFor<z.output<TSchema>>>;
}
