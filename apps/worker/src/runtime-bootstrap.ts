import { echoCapability } from "@pap/capability-echo";
import { localModelTestCapability } from "@pap/capability-local-model-test";
import { createOllamaProviderRegistry } from "@pap/ai-ollama";
import { createMemoryService, type MemoryService } from "@pap/memory";
import { createRuntime, type Runtime } from "@pap/runtime";
import {
  createLogger,
  type PapLogger,
  type ServerEnvironment,
  validateEnvironment,
} from "@pap/shared";
import type {
  EpisodicMemoryRepository,
  ExecutionTraceRepository,
  SemanticMemoryRepository,
} from "@pap/storage";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteEpisodicMemoryRepository,
  SqliteExecutionTraceRepository,
  SqliteSemanticMemoryRepository,
  type MigrationResult,
  type SqliteDatabaseConnection,
} from "@pap/storage-sqlite";

export type WorkerRuntimeState = {
  env: Pick<ServerEnvironment, "PAP_ENVIRONMENT">;
  warnings: string[];
  migration: MigrationResult;
  connection: SqliteDatabaseConnection;
  traceRepository: ExecutionTraceRepository;
  semanticMemoryRepository: SemanticMemoryRepository;
  episodicMemoryRepository: EpisodicMemoryRepository;
  memoryService: MemoryService;
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
  const semanticMemoryRepository = new SqliteSemanticMemoryRepository(connection.db);
  const episodicMemoryRepository = new SqliteEpisodicMemoryRepository(connection.db);
  const memoryService = createMemoryService({
    semanticMemoryRepository,
    episodicMemoryRepository,
    executionTraceRepository: traceRepository,
  });
  const logger = createLogger({ level: env.PAP_LOG_LEVEL });
  const aiProviderRegistry = createOllamaProviderRegistry({ env: process.env });
  const runtime = createRuntime({
    traceRepository,
    memoryService,
    capabilities: [echoCapability, localModelTestCapability],
    logger,
    aiProviderRegistry,
  });

  return {
    env: {
      PAP_ENVIRONMENT: env.PAP_ENVIRONMENT,
    },
    warnings,
    migration,
    connection,
    traceRepository,
    semanticMemoryRepository,
    episodicMemoryRepository,
    memoryService,
    runtime,
    logger,
  };
}

export function closeWorkerRuntimeState(state: WorkerRuntimeState): void {
  state.connection.close();
}
