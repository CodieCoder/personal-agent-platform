import { createServerFn } from "@tanstack/react-start";
import {
  archiveWorkspaceOperation,
  createWorkspaceOperation,
  getWorkspaceOperation,
  listWorkspacesOperation,
} from "./operations";

export const listWorkspaces = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => withWorkspaceState((state) => listWorkspacesOperation(state, data)));

export const getWorkspace = createServerFn({ method: "GET" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => withWorkspaceState((state) => getWorkspaceOperation(state, data)));

export const createWorkspace = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withWorkspaceState((state) => createWorkspaceOperation(state, data)),
  );

export const archiveWorkspace = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) =>
    withWorkspaceState((state) => archiveWorkspaceOperation(state, data)),
  );

async function withWorkspaceState<T>(
  operation: (state: Awaited<ReturnType<typeof getWorkspaceOperationState>>) => Promise<T>,
): Promise<T> {
  const state = await getWorkspaceOperationState();
  return operation(state);
}

async function getWorkspaceOperationState() {
  const { getWebRuntimeState } = await import("../executions/runtime.server");
  return {
    workspaceRepository: getWebRuntimeState().workspaceRepository,
  };
}
