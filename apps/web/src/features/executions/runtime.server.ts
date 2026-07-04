import "@tanstack/react-start/server-only";

import { createOllamaProviderRegistry } from "@pap/ai-ollama";
import { echoCapability } from "@pap/capability-echo";
import { localModelTestCapability } from "@pap/capability-local-model-test";
import { createSearchExtractTestCapability } from "@pap/capability-search-extract-test";
import { createMemoryService, type MemoryService } from "@pap/memory";
import { createRuntime, type Runtime } from "@pap/runtime";
import {
  createLogger,
  getBrowserSafeEnvironment,
  loadRepositoryEnvironment,
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
  WorkspaceRepository,
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
  SqliteWorkspaceRepository,
} from "@pap/storage-sqlite";
import {
  createSearxngSearchProviderRegistry,
  defaultSearxngProviderId,
} from "@pap/tools-search-searxng";
import { createGuardedFetchClient, createUrlSafetyPolicy } from "@pap/tools-web";
import {
  createSearchTestFixtureGuardedFetchClient,
  createSearchTestFixtureSearchProviderRegistry,
  createSearchTestFixtureUrlSafetyPolicy,
  shouldUseSearchTestFixtures,
} from "../search-test/fixtures.server";

export type WebRuntimeState = {
  env: Pick<ServerEnvironment, "PAP_ENVIRONMENT">;
  warnings: string[];
  migration: MigrationResult;
  connection: SqliteDatabaseConnection;
  traceRepository: ExecutionTraceRepository;
  workspaceRepository: WorkspaceRepository;
  semanticMemoryRepository: SemanticMemoryRepository;
  episodicMemoryRepository: EpisodicMemoryRepository;
  sourceProfileRepository: SourceProfileRepository;
  webEvidenceRepository: WebEvidenceRepository;
  memoryService: MemoryService;
  runtime: Runtime;
};

let runtimeState: WebRuntimeState | undefined;

export function getWebRuntimeState(): WebRuntimeState {
  if (runtimeState) {
    return runtimeState;
  }

  const runtimeEnv = loadRepositoryEnvironment();
  const { env, warnings } = validateEnvironment(runtimeEnv);
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
  const sourceProfileRepository = new SqliteSourceProfileRepository(connection.db);
  const webEvidenceRepository = new SqliteWebEvidenceRepository(connection.db);
  const memoryService = createMemoryService({
    semanticMemoryRepository,
    episodicMemoryRepository,
    executionTraceRepository: traceRepository,
  });
  const logger = createLogger({ level: env.PAP_LOG_LEVEL });
  const aiProviderRegistry = createOllamaProviderRegistry({ env: runtimeEnv });
  const useSearchTestFixtures = shouldUseSearchTestFixtures({
    environment: env.PAP_ENVIRONMENT,
    rawEnv: runtimeEnv,
  });
  const searchProviderRegistry = useSearchTestFixtures
    ? createSearchTestFixtureSearchProviderRegistry({ rawEnv: runtimeEnv })
    : createSearxngSearchProviderRegistry({ env: runtimeEnv });
  const urlSafetyPolicy = useSearchTestFixtures
    ? createSearchTestFixtureUrlSafetyPolicy()
    : createUrlSafetyPolicy();
  const guardedFetchClient = useSearchTestFixtures
    ? createSearchTestFixtureGuardedFetchClient({ policy: urlSafetyPolicy })
    : createGuardedFetchClient({ policy: urlSafetyPolicy });
  const sourceProfileService = createSourceProfileService({
    repository: sourceProfileRepository,
  });
  const runtime = createRuntime({
    traceRepository,
    memoryService,
    capabilities: [echoCapability, localModelTestCapability, createSearchExtractTestCapability()],
    logger,
    aiProviderRegistry,
    searchProviderRegistry,
    defaultSearchProviderId: defaultSearxngProviderId,
    urlSafetyPolicy,
    guardedFetchClient,
    sourceProfileService,
    webEvidenceRepository,
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
    sourceProfileRepository,
    webEvidenceRepository,
    memoryService,
    runtime,
  };

  return runtimeState;
}
