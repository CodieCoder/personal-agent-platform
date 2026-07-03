import type { Workspace } from "@pap/contracts";
import type { SafeWebError } from "../executions/types";

export type WorkspaceListResult =
  | {
      ok: true;
      workspaces: Workspace[];
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type WorkspaceRecordResult =
  | {
      ok: true;
      found: true;
      workspace: Workspace;
    }
  | {
      ok: true;
      found: false;
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type WorkspaceMutationResult =
  | {
      ok: true;
      workspace: Workspace;
    }
  | {
      ok: false;
      error: SafeWebError;
    };
