import "@tanstack/react-start/server-only";

import { createOllamaProviderRegistry } from "@pap/ai-ollama";
import { echoCapability } from "@pap/capability-echo";
import { createMemoryService, type MemoryService } from "@pap/memory";
import { createRuntime, type Runtime } from "@pap/runtime";
import {
  createLogger,
  getBrowserSafeEnvironment,
  type ServerEnvironment,
  validateEnvironment,
} from "@pap/shared";
import type {
  EpisodicMemoryRepository,
  ExecutionTraceRepository,
  SemanticMemoryRepository,
  WorkspaceRepository,
} from "@pap/storage";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteEpisodicMemoryRepository,
  SqliteExecutionTraceRepository,
  SqliteSemanticMemoryRepository,
  SqliteWorkspaceRepository,
  type MigrationResult,
  type SqliteDatabaseConnection,
} from "@pap/storage-sqlite";

export type WebRuntimeState = {
  env: Pick<ServerEnvironment, "PAP_ENVIRONMENT">;
  warnings: string[];
  migration: MigrationResult;
  connection: SqliteDatabaseConnection;
  traceRepository: ExecutionTraceRepository;
  workspaceRepository: WorkspaceRepository;
  semanticMemoryRepository: SemanticMemoryRepository;
  episodicMemoryRepository: EpisodicMemoryRepository;
  memoryService: MemoryService;
  runtime: Runtime;
};

let runtimeState: WebRuntimeState | undefined;

export function getWebRuntimeState(): WebRuntimeState {
  if (runtimeState) {
    return runtimeState;
  }

  const { env, warnings } = validateEnvironment();
  const databaseConfig = {
    databaseUrl: env.PAP_DATABASE_URL,
    dataDir: env.PAP_DATA_DIR,
  };
  const migration = runMigrations(databaseConfig);
  const connection = createSqliteDatabase(databaseConfig);
  const traceRepository = new SqliteExecutionTraceRepository(connection.db);
  const workspaceRepository = new SqliteWorkspaceRepository(connection.db);
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
    capabilities: [echoCapability],
    logger,
    aiProviderRegistry,
  });

  runtimeState = {
    env: getBrowserSafeEnvironment(env),
    warnings,
    migration,
    connection,
    traceRepository,
    workspaceRepository,
    semanticMemoryRepository,
    episodicMemoryRepository,
    memoryService,
    runtime,
  };

  return runtimeState;
}
