import "@tanstack/react-start/server-only";

import { createOllamaProviderRegistry } from "@pap/ai-ollama";
import { echoCapability } from "@pap/capability-echo";
import { localModelTestCapability } from "@pap/capability-local-model-test";
import { createResearchCapability } from "@pap/capability-research";
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
  ResearchReportFeedbackRepository,
  ResearchReportRepository,
  ResearchSourceFeedbackRepository,
  ResearchSourceRepository,
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
  SqliteResearchReportFeedbackRepository,
  SqliteResearchReportRepository,
  SqliteResearchSourceFeedbackRepository,
  SqliteResearchSourceRepository,
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
import {
  createResearchFixtureAIProviderRegistry,
  shouldUseResearchTestFixtures,
} from "../research/fixtures.server";

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
  researchReportRepository: ResearchReportRepository;
  researchSourceRepository: ResearchSourceRepository;
  researchSourceFeedbackRepository: ResearchSourceFeedbackRepository;
  researchReportFeedbackRepository: ResearchReportFeedbackRepository;
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
  const researchReportRepository = new SqliteResearchReportRepository(connection.db);
  const researchSourceRepository = new SqliteResearchSourceRepository(connection.db);
  const researchSourceFeedbackRepository = new SqliteResearchSourceFeedbackRepository(
    connection.db,
  );
  const researchReportFeedbackRepository = new SqliteResearchReportFeedbackRepository(
    connection.db,
  );
  const memoryService = createMemoryService({
    semanticMemoryRepository,
    episodicMemoryRepository,
    executionTraceRepository: traceRepository,
  });
  const logger = createLogger({ level: env.PAP_LOG_LEVEL });
  const useResearchTestFixtures = shouldUseResearchTestFixtures({
    environment: env.PAP_ENVIRONMENT,
    rawEnv: runtimeEnv,
  });
  const aiProviderRegistry = useResearchTestFixtures
    ? createResearchFixtureAIProviderRegistry({ rawEnv: runtimeEnv })
    : createOllamaProviderRegistry({ env: runtimeEnv });
  const useSearchTestFixtures =
    shouldUseSearchTestFixtures({
      environment: env.PAP_ENVIRONMENT,
      rawEnv: runtimeEnv,
    }) || useResearchTestFixtures;
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
    capabilities: [
      echoCapability,
      localModelTestCapability,
      createResearchCapability({
        reportRepository: researchReportRepository,
        sourceRepository: researchSourceRepository,
        memoryService,
      }),
      createSearchExtractTestCapability(),
    ],
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
    researchReportRepository,
    researchSourceRepository,
    researchSourceFeedbackRepository,
    researchReportFeedbackRepository,
    memoryService,
    runtime,
  };

  return runtimeState;
}
