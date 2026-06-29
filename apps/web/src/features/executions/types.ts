import type { ExecutionStatus, ExecutionTrace } from "@pap/contracts";

export type SafeWebError = {
  code: string;
  message: string;
};

export type WebStatusResult =
  | {
      ok: true;
      environment: string;
      runtime: "ready";
      capabilityIds: string[];
      warningCount: number;
    }
  | {
      ok: false;
      runtime: "unavailable";
      error: SafeWebError;
    };

export type EchoExecutionResult =
  | {
      ok: true;
      executionId: string;
      traceId: string;
      status: "completed";
      message: string;
      echoedAt: string;
    }
  | {
      ok: false;
      executionId?: string;
      traceId?: string;
      status?: ExecutionStatus;
      error: SafeWebError;
    };

export type RecentExecutionSummary = {
  id: string;
  capabilityId: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  stepCount: number;
};

export type RecentExecutionsResult =
  | {
      ok: true;
      executions: RecentExecutionSummary[];
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type ExecutionTraceResult =
  | {
      ok: true;
      found: true;
      trace: ExecutionTrace;
    }
  | {
      ok: true;
      found: false;
    }
  | {
      ok: false;
      error: SafeWebError;
    };
