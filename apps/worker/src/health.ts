import { pathToFileURL } from "node:url";
import { serializeError } from "@pap/shared";
import { closeWorkerRuntimeState, createWorkerRuntimeState } from "./runtime-bootstrap.js";

export type WorkerHealthSuccess = {
  ok: true;
  environment: string;
  databasePath: string;
  migrationsFolder: string;
  capabilityIds: string[];
  warningCount: number;
};

export type WorkerHealthFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type WorkerHealthResult = WorkerHealthSuccess | WorkerHealthFailure;

export function checkWorkerHealth(): WorkerHealthResult {
  const state = createWorkerRuntimeState();

  try {
    state.connection.sqlite.prepare("select 1 as ok").get();

    return {
      ok: true,
      environment: state.env.PAP_ENVIRONMENT,
      databasePath: state.connection.config.databasePath,
      migrationsFolder: state.migration.migrationsFolder,
      capabilityIds: state.runtime.listCapabilities().map((capability) => capability.id),
      warningCount: state.warnings.length,
    };
  } finally {
    closeWorkerRuntimeState(state);
  }
}

export function runWorkerHealth(): number {
  try {
    const result = checkWorkerHealth();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const serialized = serializeError(error, { includeStack: false, maxCauseDepth: 0 });
    const result: WorkerHealthFailure = {
      ok: false,
      error: {
        code: serialized.code ?? "WORKER_HEALTH_FAILED",
        message: serialized.message,
      },
    };

    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    return 1;
  }
}

if (isExecutedDirectly()) {
  process.exitCode = runWorkerHealth();
}

function isExecutedDirectly(): boolean {
  return (
    typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href
  );
}
