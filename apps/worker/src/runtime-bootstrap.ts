import { createOllamaProviderRegistry } from "@pap/ai-ollama";
import { echoCapability } from "@pap/capability-echo";
import { localModelTestCapability } from "@pap/capability-local-model-test";
import { searchExtractTestCapability } from "@pap/capability-search-extract-test";
import { createMemoryService, type MemoryService } from "@pap/memory";
import { createRuntime, type Runtime } from "@pap/runtime";
import {
  createLogger,
  loadRepositoryEnvironment,
  type PapLogger,
  type ServerEnvironment,
  validateEnvironment,
} from "@pap/shared";
import { createSourceProfileService } from "@pap/source-profiles";
import type {
  EpisodicMemoryRepository,
  ExecutionTraceRepository,
  SemanticMemoryRepository,
  SourceProfileRepository,
  WebEvidenceRepository,
} from "@pap/storage";
import {
  createSqliteDatabase,
  type MigrationResult,
  runMigrations,
  type SqliteDatabaseConnection,
  SqliteEpisodicMemoryRepository,
  SqliteExecutionTraceRepository,
  SqliteSemanticMemoryRepository,
  SqliteSourceProfileRepository,
  SqliteWebEvidenceRepository,
} from "@pap/storage-sqlite";
import {
  createSearxngSearchProviderRegistry,
  defaultSearxngProviderId,
} from "@pap/tools-search-searxng";
import { createGuardedFetchClient, createUrlSafetyPolicy } from "@pap/tools-web";

export type WorkerRuntimeState = {
  env: Pick<ServerEnvironment, "PAP_ENVIRONMENT">;
  warnings: string[];
  migration: MigrationResult;
  connection: SqliteDatabaseConnection;
  traceRepository: ExecutionTraceRepository;
  semanticMemoryRepository: SemanticMemoryRepository;
  episodicMemoryRepository: EpisodicMemoryRepository;
  sourceProfileRepository: SourceProfileRepository;
  webEvidenceRepository: WebEvidenceRepository;
  memoryService: MemoryService;
  runtime: Runtime;
  logger: PapLogger;
};

export function createWorkerRuntimeState(): WorkerRuntimeState {
  const runtimeEnv = loadRepositoryEnvironment();
  const { env, warnings } = validateEnvironment(runtimeEnv);
  const databaseConfig = {
    databaseUrl: env.PAP_DATABASE_URL,
    dataDir: env.PAP_DATA_DIR,
  };
  const migration = runMigrations(databaseConfig);
  const connection = createSqliteDatabase(databaseConfig);
  const traceRepository = new SqliteExecutionTraceRepository(connection.db);
  const semanticMemoryRepository = new SqliteSemanticMemoryRepository(connection.db);
  const episodicMemoryRepository = new SqliteEpisodicMemoryRepository(connection.db);
  const sourceProfileRepository = new SqliteSourceProfileRepository(connection.db);
  const webEvidenceRepository = new SqliteWebEvidenceRepository(connection.db);
  const memoryService = createMemoryService({
    semanticMemoryRepository,
    episodicMemoryRepository,
    executionTraceRepository: traceRepository,
  });
  const logger = createLogger({ level: env.PAP_LOG_LEVEL });
  const aiProviderRegistry = createOllamaProviderRegistry({ env: runtimeEnv });
  const searchProviderRegistry = createSearxngSearchProviderRegistry({ env: runtimeEnv });
  const urlSafetyPolicy = createUrlSafetyPolicy();
  const guardedFetchClient = createGuardedFetchClient({ policy: urlSafetyPolicy });
  const sourceProfileService = createSourceProfileService({
    repository: sourceProfileRepository,
  });
  const runtime = createRuntime({
    traceRepository,
    memoryService,
    capabilities: [echoCapability, localModelTestCapability, searchExtractTestCapability],
    logger,
    aiProviderRegistry,
    searchProviderRegistry,
    defaultSearchProviderId: defaultSearxngProviderId,
    urlSafetyPolicy,
    guardedFetchClient,
    sourceProfileService,
    webEvidenceRepository,
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
    sourceProfileRepository,
    webEvidenceRepository,
    memoryService,
    runtime,
    logger,
  };
}

export function closeWorkerRuntimeState(state: WorkerRuntimeState): void {
  state.connection.close();
}
