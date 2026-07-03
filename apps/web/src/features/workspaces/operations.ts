import {
  createWorkspaceRequestSchema,
  listWorkspacesRequestSchema,
  workspaceIdSchema,
  z,
} from "@pap/contracts";
import type { WorkspaceRepository } from "@pap/storage";
import type { SafeWebError } from "../executions/types";
import type { WorkspaceListResult, WorkspaceMutationResult, WorkspaceRecordResult } from "./types";

export type WorkspaceOperationState = {
  workspaceRepository: WorkspaceRepository;
};

const workspaceIdInputSchema = z
  .object({
    id: workspaceIdSchema,
  })
  .strict();

export async function listWorkspacesOperation(
  state: WorkspaceOperationState,
  input: unknown,
): Promise<WorkspaceListResult> {
  const parsed = listWorkspacesRequestSchema.safeParse(input ?? {});

  if (!parsed.success) {
    return invalidInputResult("WORKSPACE_LIST_INVALID");
  }

  try {
    return {
      ok: true,
      workspaces: await state.workspaceRepository.list(parsed.data),
    };
  } catch {
    return operationError({
      code: "WORKSPACE_LIST_FAILED",
      message: "Workspaces could not be loaded.",
    });
  }
}

export async function getWorkspaceOperation(
  state: WorkspaceOperationState,
  input: unknown,
): Promise<WorkspaceRecordResult> {
  const parsed = workspaceIdInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("WORKSPACE_ID_INVALID");
  }

  try {
    const workspace = await state.workspaceRepository.getById(parsed.data.id);

    if (!workspace) {
      return {
        ok: true,
        found: false,
      };
    }

    return {
      ok: true,
      found: true,
      workspace,
    };
  } catch {
    return operationError({
      code: "WORKSPACE_GET_FAILED",
      message: "Workspace could not be loaded.",
    });
  }
}

export async function createWorkspaceOperation(
  state: WorkspaceOperationState,
  input: unknown,
): Promise<WorkspaceMutationResult> {
  const parsed = createWorkspaceRequestSchema.safeParse(coerceWorkspaceFormInput(input));

  if (!parsed.success) {
    return invalidInputResult("WORKSPACE_CREATE_INVALID");
  }

  try {
    return {
      ok: true,
      workspace: await state.workspaceRepository.create(parsed.data),
    };
  } catch {
    return operationError({
      code: "WORKSPACE_CREATE_FAILED",
      message: "Workspace could not be created.",
    });
  }
}

export async function archiveWorkspaceOperation(
  state: WorkspaceOperationState,
  input: unknown,
): Promise<WorkspaceRecordResult> {
  const parsed = workspaceIdInputSchema.safeParse(input);

  if (!parsed.success) {
    return invalidInputResult("WORKSPACE_ARCHIVE_INVALID");
  }

  try {
    const existing = await state.workspaceRepository.getById(parsed.data.id);

    if (!existing) {
      return {
        ok: true,
        found: false,
      };
    }

    return {
      ok: true,
      found: true,
      workspace: await state.workspaceRepository.archive(parsed.data),
    };
  } catch {
    return operationError({
      code: "WORKSPACE_ARCHIVE_FAILED",
      message: "Workspace could not be archived.",
    });
  }
}

function invalidInputResult(code: string): { ok: false; error: SafeWebError } {
  return {
    ok: false,
    error: {
      code,
      message: "Workspace request input is not valid.",
    },
  };
}

function operationError(error: SafeWebError): { ok: false; error: SafeWebError } {
  return {
    ok: false,
    error,
  };
}

function coerceWorkspaceFormInput(input: unknown): unknown {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    return {
      name: String(input.get("name") ?? ""),
      description: String(input.get("description") ?? ""),
    };
  }

  return input;
}
