import { echoCapability } from "@pap/capability-echo";
import { createRuntime, type Runtime } from "@pap/runtime";
import {
  createLogger,
  type PapLogger,
  type ServerEnvironment,
  validateEnvironment,
} from "@pap/shared";
import type { ExecutionTraceRepository } from "@pap/storage";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteExecutionTraceRepository,
  type MigrationResult,
  type SqliteDatabaseConnection,
} from "@pap/storage-sqlite";

export type WorkerRuntimeState = {
  env: Pick<ServerEnvironment, "PAP_ENVIRONMENT">;
  warnings: string[];
  migration: MigrationResult;
  connection: SqliteDatabaseConnection;
  traceRepository: ExecutionTraceRepository;
  runtime: Runtime;
  logger: PapLogger;
};

export function createWorkerRuntimeState(): WorkerRuntimeState {
  const { env, warnings } = validateEnvironment();
  const databaseConfig = {
    databaseUrl: env.PAP_DATABASE_URL,
    dataDir: env.PAP_DATA_DIR,
  };
  const migration = runMigrations(databaseConfig);
  const connection = createSqliteDatabase(databaseConfig);
  const traceRepository = new SqliteExecutionTraceRepository(connection.db);
  const logger = createLogger({ level: env.PAP_LOG_LEVEL });
  const runtime = createRuntime({
    traceRepository,
    capabilities: [echoCapability],
    logger,
  });

  return {
    env: {
      PAP_ENVIRONMENT: env.PAP_ENVIRONMENT,
    },
    warnings,
    migration,
    connection,
    traceRepository,
    runtime,
    logger,
  };
}

export function closeWorkerRuntimeState(state: WorkerRuntimeState): void {
  state.connection.close();
}
