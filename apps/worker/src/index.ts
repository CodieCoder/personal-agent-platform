import { pathToFileURL } from "node:url";
import { serializeError } from "@pap/shared";
import {
  closeWorkerRuntimeState,
  createWorkerRuntimeState,
  type WorkerRuntimeState,
} from "./runtime-bootstrap.js";

export async function startWorker(): Promise<void> {
  const state = createWorkerRuntimeState();
  const capabilityIds = state.runtime.listCapabilities().map((capability) => capability.id);

  state.logger.info(
    {
      capabilityIds,
      environment: state.env.PAP_ENVIRONMENT,
      warningCount: state.warnings.length,
    },
    "Worker initialized.",
  );

  await waitForShutdown(state);
}

async function waitForShutdown(state: WorkerRuntimeState): Promise<void> {
  await new Promise<void>((resolve) => {
    const shutdown = (signal: NodeJS.Signals) => {
      state.logger.info({ signal }, "Worker shutting down.");
      closeWorkerRuntimeState(state);
      resolve();
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

if (isExecutedDirectly()) {
  startWorker().catch((error: unknown) => {
    const serialized = serializeError(error, { includeStack: false, maxCauseDepth: 0 });
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: {
          code: serialized.code ?? "WORKER_START_FAILED",
          message: serialized.message,
        },
      })}\n`,
    );
    process.exitCode = 1;
  });
}

function isExecutedDirectly(): boolean {
  return (
    typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href
  );
}
