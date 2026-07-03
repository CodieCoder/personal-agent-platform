import {
  createSemanticMemoryRequestSchema,
  episodicMemoryQuerySchema,
  memoryIdSchema,
  semanticMemoryQuerySchema,
  updateSemanticMemoryRequestSchema,
  z,
} from "@pap/contracts";
import type {
  CreateManualSemanticMemoryInput,
  DeleteMemoryRecordInput,
  ExpireMemoryRecordInput,
  MemoryService,
  SupersedeSemanticMemoryInput,
} from "@pap/memory";
import type { SafeWebError } from "../executions/types";
import type {
  EpisodicMemoryListResult,
  MemoryMutationResult,
  MemoryRecordResult,
  SemanticMemoryListResult,
  SemanticMemoryMutationResult,
  SupersedeSemanticMemoryResult,
} from "./types";

export type MemoryOperationState = {
  memoryService: MemoryService;
};

const memoryIdInputSchema = z
  .object({
    id: memoryIdSchema,
  })
  .strict();

const typedMemoryIdInputSchema = memoryIdInputSchema
  .extend({
    type: z.enum(["semantic", "episodic"]).optional(),
  })
  .strict();

const supersedeSemanticMemoryInputSchema = z
  .object({
    id: memoryIdSchema,
    replacement: createSemanticMemoryRequestSchema,
  })
  .strict();

export async function listSemanticMemoryOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<SemanticMemoryListResult> {
  const parsed = semanticMemoryQuerySchema.safeParse(input ?? {});

  if (!parsed.success) {
    return invalidInputResult("MEMORY_SEMANTIC_QUERY_INVALID");
  }

  try {
    return {
      ok: true,
      records: await state.memoryService.listSemanticMemory(parsed.data),
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_SEMANTIC_LIST_FAILED",
      message: "Semantic memory could not be loaded.",
    });
  }
}

export async function listEpisodicMemoryOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<EpisodicMemoryListResult> {
  const parsed = episodicMemoryQuerySchema.safeParse(input ?? {});

  if (!parsed.success) {
    return invalidInputResult("MEMORY_EPISODIC_QUERY_INVALID");
  }

  try {
    return {
      ok: true,
      records: await state.memoryService.listEpisodicMemory(parsed.data),
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_EPISODIC_LIST_FAILED",
      message: "Episodic memory could not be loaded.",
    });
  }
}

export async function getMemoryRecordOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<MemoryRecordResult> {
  const parsed = memoryIdInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("MEMORY_ID_INVALID");
  }

  try {
    const memory = await state.memoryService.getMemoryRecord(parsed.data.id);

    if (!memory) {
      return {
        ok: true,
        found: false,
      };
    }

    return {
      ok: true,
      found: true,
      memory,
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_GET_FAILED",
      message: "Memory record could not be loaded.",
    });
  }
}

export async function createManualSemanticMemoryOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<SemanticMemoryMutationResult> {
  const parsed = createSemanticMemoryRequestSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("MEMORY_SEMANTIC_CREATE_INVALID");
  }

  try {
    return {
      ok: true,
      memory: await state.memoryService.createSemanticMemory(
        compactObject(parsed.data) as CreateManualSemanticMemoryInput,
      ),
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_SEMANTIC_CREATE_FAILED",
      message: "Semantic memory could not be created.",
    });
  }
}

export async function updateSemanticMemoryOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<SemanticMemoryMutationResult> {
  const parsed = updateSemanticMemoryRequestSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("MEMORY_SEMANTIC_UPDATE_INVALID");
  }

  try {
    return {
      ok: true,
      memory: await state.memoryService.updateSemanticMemory(parsed.data),
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_SEMANTIC_UPDATE_FAILED",
      message: "Semantic memory could not be updated.",
    });
  }
}

export async function supersedeSemanticMemoryOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<SupersedeSemanticMemoryResult> {
  const parsed = supersedeSemanticMemoryInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("MEMORY_SEMANTIC_SUPERSEDE_INVALID");
  }

  try {
    const result = await state.memoryService.supersedeSemanticMemory({
      id: parsed.data.id,
      replacement: compactObject(parsed.data.replacement),
    } as SupersedeSemanticMemoryInput);

    return {
      ok: true,
      previous: result.previous,
      replacement: result.replacement,
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_SEMANTIC_SUPERSEDE_FAILED",
      message: "Semantic memory could not be superseded.",
    });
  }
}

export async function expireMemoryRecordOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<MemoryMutationResult> {
  const parsed = typedMemoryIdInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("MEMORY_EXPIRE_INVALID");
  }

  try {
    return {
      ok: true,
      memory: await state.memoryService.expireMemoryRecord(
        compactObject(parsed.data) as ExpireMemoryRecordInput,
      ),
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_EXPIRE_FAILED",
      message: "Memory record could not be expired.",
    });
  }
}

export async function deleteMemoryRecordOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<MemoryMutationResult> {
  const parsed = typedMemoryIdInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("MEMORY_DELETE_INVALID");
  }

  try {
    return {
      ok: true,
      memory: await state.memoryService.deleteMemoryRecord(
        compactObject(parsed.data) as DeleteMemoryRecordInput,
      ),
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_DELETE_FAILED",
      message: "Memory record could not be deleted.",
    });
  }
}

export async function listProposedSemanticMemoryOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<SemanticMemoryListResult> {
  const parsed = semanticMemoryQuerySchema.safeParse({
    ...(typeof input === "object" && input !== null ? input : {}),
    status: "proposed",
  });

  if (!parsed.success) {
    return invalidInputResult("MEMORY_PROPOSED_QUERY_INVALID");
  }

  try {
    return {
      ok: true,
      records: await state.memoryService.listSemanticMemory(parsed.data),
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_PROPOSED_LIST_FAILED",
      message: "Proposed semantic memory could not be loaded.",
    });
  }
}

export async function approveSemanticMemoryProposalOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<SemanticMemoryMutationResult> {
  const parsed = memoryIdInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("MEMORY_PROPOSAL_APPROVE_INVALID");
  }

  try {
    return {
      ok: true,
      memory: await state.memoryService.approveSemanticMemoryProposal(parsed.data.id),
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_PROPOSAL_APPROVE_FAILED",
      message: "Semantic memory proposal could not be approved.",
    });
  }
}

export async function rejectSemanticMemoryProposalOperation(
  state: MemoryOperationState,
  input: unknown,
): Promise<SemanticMemoryMutationResult> {
  const parsed = memoryIdInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("MEMORY_PROPOSAL_REJECT_INVALID");
  }

  try {
    return {
      ok: true,
      memory: await state.memoryService.rejectSemanticMemoryProposal(parsed.data.id),
    };
  } catch (error) {
    return operationError(error, {
      code: "MEMORY_PROPOSAL_REJECT_FAILED",
      message: "Semantic memory proposal could not be rejected.",
    });
  }
}

function invalidInputResult(code: string): { ok: false; error: SafeWebError } {
  return {
    ok: false,
    error: {
      code,
      message: "Memory request input is not valid.",
    },
  };
}

function operationError(
  error: unknown,
  fallback: SafeWebError,
): { ok: false; error: SafeWebError } {
  const platformError = parsePlatformErrorCarrier(error);

  if (platformError) {
    return {
      ok: false,
      error: platformError,
    };
  }

  return {
    ok: false,
    error: fallback,
  };
}

function parsePlatformErrorCarrier(error: unknown): SafeWebError | null {
  if (typeof error !== "object" || error === null || !("platformError" in error)) {
    return null;
  }

  const platformError = error.platformError;

  if (
    typeof platformError !== "object" ||
    platformError === null ||
    !("code" in platformError) ||
    !("message" in platformError)
  ) {
    return null;
  }

  if (typeof platformError.code !== "string" || typeof platformError.message !== "string") {
    return null;
  }

  return {
    code: platformError.code,
    message: platformError.message,
  };
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }

  return output;
}
