import { createServerFn } from "@tanstack/react-start";
import {
  approveSemanticMemoryProposalOperation,
  createManualSemanticMemoryOperation,
  deleteMemoryRecordOperation,
  expireMemoryRecordOperation,
  getMemoryRecordOperation,
  listEpisodicMemoryOperation,
  listProposedSemanticMemoryOperation,
  listSemanticMemoryOperation,
  rejectSemanticMemoryProposalOperation,
  supersedeSemanticMemoryOperation,
  updateSemanticMemoryOperation,
} from "./operations";

export const listSemanticMemory = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withMemoryState((state) => listSemanticMemoryOperation(state, data)),
  );

export const listEpisodicMemory = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withMemoryState((state) => listEpisodicMemoryOperation(state, data)),
  );

export const getMemoryRecord = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => withMemoryState((state) => getMemoryRecordOperation(state, data)));

export const createManualSemanticMemory = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withMemoryState((state) => createManualSemanticMemoryOperation(state, data)),
  );

export const updateSemanticMemory = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withMemoryState((state) => updateSemanticMemoryOperation(state, data)),
  );

export const supersedeSemanticMemory = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withMemoryState((state) => supersedeSemanticMemoryOperation(state, data)),
  );

export const expireMemoryRecord = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withMemoryState((state) => expireMemoryRecordOperation(state, data)),
  );

export const deleteMemoryRecord = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withMemoryState((state) => deleteMemoryRecordOperation(state, data)),
  );

export const listProposedSemanticMemory = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withMemoryState((state) => listProposedSemanticMemoryOperation(state, data)),
  );

export const approveSemanticMemoryProposal = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withMemoryState((state) => approveSemanticMemoryProposalOperation(state, data)),
  );

export const rejectSemanticMemoryProposal = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withMemoryState((state) => rejectSemanticMemoryProposalOperation(state, data)),
  );

async function withMemoryState<T>(
  operation: (state: Awaited<ReturnType<typeof getMemoryOperationState>>) => Promise<T>,
): Promise<T> {
  const state = await getMemoryOperationState();
  return operation(state);
}

async function getMemoryOperationState() {
  const { getWebRuntimeState } = await import("../executions/runtime.server");
  return {
    memoryService: getWebRuntimeState().memoryService,
  };
}
