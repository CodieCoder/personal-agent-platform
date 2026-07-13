import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteEpisodicMemoryRepository,
  SqliteExecutionTraceRepository,
  SqliteResearchReportFeedbackRepository,
  SqliteResearchReportRepository,
  SqliteResearchSourceFeedbackRepository,
  SqliteResearchSourceRepository,
  SqliteSemanticMemoryRepository,
  SqliteWebEvidenceRepository,
  SqliteWorkspaceRepository,
} from "../../../packages/storage-sqlite/src/index.js";
import { createMemoryService } from "../../../packages/memory/src/index.js";
import { compileGherkin, runSuiteTool, type RunSuiteOutput } from "@qutecoder/qa-intel";
import { resolveProviderMode, shouldRunFeature, type QaProviderMode } from "./config.js";

const suiteName = "pap-behavior";
const port = 3101;
const baseURL = `http://127.0.0.1:${port}`;
const featureDirectory = resolve("qa/features");
const artifactDirectory = resolve(".qa-results/artifacts");
const resultsDatabasePath = resolve(".qa-results/results.db");
const resultDirectory = resolve("qa/results");

type QaAppEnvironment = "local" | "test" | "self_hosted" | "production";

type QaRunEnvironment = {
  providerMode: QaProviderMode;
  appEnvironment: QaAppEnvironment;
  baseURL: string;
  isolatedDatabaseUrl: string;
  isolatedDataDir: string;
  stepTimeoutMs: number;
};

type QaResult = {
  scenario: string;
  status: "passed" | "failed" | "error";
  featurePaths: string[];
  artifactDirectory: string;
  resultsDatabasePath: string;
  environment?: QaRunEnvironment;
  qaIntel: RunSuiteOutput;
  fixHint?: string;
};

async function main(): Promise<void> {
  const providerMode = resolveProviderMode(process.env.PAP_QA_PROVIDER_MODE);
  const appEnvironment = resolveAppEnvironment({
    rawValue: process.env.PAP_QA_APP_ENVIRONMENT,
    providerMode,
  });
  const stepTimeoutMs = resolveStepTimeoutMs({
    rawValue: process.env.PAP_QA_TIMEOUT_MS,
    providerMode,
  });
  const featurePaths = await listFeaturePaths(providerMode);
  const compiledContracts = [];
  const compileDiagnostics = [];

  for (const featurePath of featurePaths) {
    const feature = await readFile(featurePath, "utf8");
    const compiled = compileGherkin(feature, { sourceFile: featurePath });
    compiledContracts.push(...compiled.contracts);

    if (compiled.errors.length > 0 || compiled.warnings.length > 0) {
      compileDiagnostics.push({
        featurePath,
        errors: compiled.errors,
        warnings: compiled.warnings,
      });
    }
  }

  if (compiledContracts.length === 0 || compileDiagnostics.some((item) => item.errors.length > 0)) {
    const qaIntel: RunSuiteOutput = {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "QA-Intel could not compile one or more feature files.",
        details: {
          diagnostics: compileDiagnostics,
        },
      },
    };

    await writeResult({
      scenario: suiteName,
      status: "error",
      featurePaths,
      artifactDirectory,
      resultsDatabasePath,
      qaIntel,
      fixHint: "Update qa/features/*.feature to strict QA-Intel Gherkin syntax.",
    });
    process.stdout.write(`${JSON.stringify(qaIntel, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }

  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(resultDirectory, { recursive: true });

  const dataDir = await mkdtemp(join(tmpdir(), "pap-qa-"));
  const databaseUrl = `file:${join(dataDir, "pap.db")}`;
  const runEnvironment: QaRunEnvironment = {
    providerMode,
    appEnvironment,
    baseURL,
    isolatedDatabaseUrl: databaseUrl,
    isolatedDataDir: dataDir,
    stepTimeoutMs,
  };
  const server = startWebServer({ dataDir, databaseUrl, providerMode, appEnvironment });

  try {
    await waitForServer(server);
    await seedQaFixtures(databaseUrl);

    const qaIntel = await runSuiteTool({
      suite: {
        name: suiteName,
        baseUrl: baseURL,
        contracts: compiledContracts,
      },
      baseUrl: baseURL,
      artifactDir: artifactDirectory,
      resultsDb: resultsDatabasePath,
      config: {
        failFast: true,
        headless: true,
        timeoutMs: stepTimeoutMs,
      },
    });

    await writeResult({
      scenario: suiteName,
      status: qaIntel.ok && qaIntel.data?.status === "passed" ? "passed" : "failed",
      featurePaths,
      artifactDirectory,
      resultsDatabasePath,
      environment: runEnvironment,
      qaIntel,
      ...(qaIntel.ok && qaIntel.data?.status === "passed"
        ? {}
        : {
            fixHint:
              "Inspect .qa-results artifacts, qa/results/pap-behavior.json, and QA-Intel diagnostics.",
          }),
    });
    process.stdout.write(`${JSON.stringify(qaIntel, null, 2)}\n`);

    if (!qaIntel.ok) {
      process.exitCode = 2;
    } else if (qaIntel.data?.status !== "passed") {
      process.exitCode = 1;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const qaIntel: RunSuiteOutput = {
      ok: false,
      error: {
        code: "EXECUTION_FAILED",
        message: errorMessage,
      },
    };

    await writeResult({
      scenario: suiteName,
      status: "error",
      featurePaths,
      artifactDirectory,
      resultsDatabasePath,
      environment: runEnvironment,
      qaIntel,
      fixHint: "Run pnpm test:e2e and inspect the execution history or Memory Explorer screens.",
    });
    process.stdout.write(`${JSON.stringify(qaIntel, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    await stopWebServer(server);
  }
}

async function listFeaturePaths(providerMode: QaProviderMode): Promise<string[]> {
  const entries = await readdir(featureDirectory);

  return entries
    .filter((entry) => entry.endsWith(".feature"))
    .filter((entry) => shouldRunFeature({ entry, providerMode }))
    .sort()
    .map((entry) => join(featureDirectory, entry));
}

function startWebServer(input: {
  dataDir: string;
  databaseUrl: string;
  providerMode: QaProviderMode;
  appEnvironment: QaAppEnvironment;
}): ChildProcessWithoutNullStreams {
  const server = spawn("pnpm", ["dev:web"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: input.providerMode === "fixture" ? "test" : "development",
      PAP_ENVIRONMENT: input.appEnvironment,
      PAP_BIND_HOST: "127.0.0.1",
      PAP_PORT: String(port),
      PAP_DATABASE_URL: input.databaseUrl,
      PAP_DATA_DIR: input.dataDir,
      PAP_LOG_LEVEL: "silent",
      ...(input.providerMode === "fixture"
        ? {
            OLLAMA_ENABLED: "false",
            PAP_RESEARCH_TEST_FIXTURES: "true",
            PAP_SEARCH_TEST_FIXTURES: "true",
          }
        : {
            PAP_RESEARCH_TEST_FIXTURES: "false",
            PAP_SEARCH_TEST_FIXTURES: "false",
          }),
    },
  });

  server.stdout.on("data", consumeServerOutput);
  server.stderr.on("data", consumeServerOutput);
  return server;
}

function resolveAppEnvironment(input: {
  rawValue: string | undefined;
  providerMode: QaProviderMode;
}): QaAppEnvironment {
  if (input.rawValue === undefined || input.rawValue.trim() === "") {
    return input.providerMode === "fixture" ? "test" : "local";
  }

  const normalized = input.rawValue.trim().toLowerCase();

  if (
    normalized === "local" ||
    normalized === "test" ||
    normalized === "self_hosted" ||
    normalized === "production"
  ) {
    return normalized;
  }

  throw new Error(
    "PAP_QA_APP_ENVIRONMENT must be 'local', 'test', 'self_hosted', or 'production'.",
  );
}

function resolveStepTimeoutMs(input: {
  rawValue: string | undefined;
  providerMode: QaProviderMode;
}): number {
  if (input.rawValue === undefined || input.rawValue.trim() === "") {
    return input.providerMode === "live" ? 180_000 : 20_000;
  }

  const parsed = Number(input.rawValue);

  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 600_000) {
    throw new Error("PAP_QA_TIMEOUT_MS must be an integer between 1000 and 600000.");
  }

  return parsed;
}

async function seedQaFixtures(databaseUrl: string): Promise<void> {
  runMigrations({ databaseUrl });

  const connection = createSqliteDatabase({ databaseUrl });
  const traceRepository = new SqliteExecutionTraceRepository(connection.db);
  const workspaceRepository = new SqliteWorkspaceRepository(connection.db);
  const semanticMemoryRepository = new SqliteSemanticMemoryRepository(connection.db);
  const episodicMemoryRepository = new SqliteEpisodicMemoryRepository(connection.db);
  const researchReportRepository = new SqliteResearchReportRepository(connection.db);
  const researchSourceRepository = new SqliteResearchSourceRepository(connection.db);
  const researchReportFeedbackRepository = new SqliteResearchReportFeedbackRepository(
    connection.db,
  );
  const researchSourceFeedbackRepository = new SqliteResearchSourceFeedbackRepository(
    connection.db,
  );
  const webEvidenceRepository = new SqliteWebEvidenceRepository(connection.db);
  const memoryService = createMemoryService({
    semanticMemoryRepository,
    episodicMemoryRepository,
    executionTraceRepository: traceRepository,
  });

  try {
    await workspaceRepository.create({
      id: "workspace_qa_alpha",
      name: "QA Alpha",
      description: "QA-Intel visible workspace.",
      createdAt: "2026-07-01T08:00:00.000Z",
    });
    await workspaceRepository.create({
      id: "workspace_qa_beta",
      name: "QA Beta",
      description: "QA-Intel isolation workspace.",
      createdAt: "2026-07-01T08:05:00.000Z",
    });
    await seedTrace(traceRepository, {
      id: "exec_qa_history_visible",
      workspaceId: "workspace_qa_alpha",
      startedAt: "2026-07-01T12:00:00.000Z",
      completedAt: "2026-07-01T12:01:00.000Z",
    });
    await seedTrace(traceRepository, {
      id: "exec_qa_history_hidden",
      workspaceId: "workspace_qa_beta",
      startedAt: "2026-07-01T13:00:00.000Z",
      completedAt: "2026-07-01T13:01:00.000Z",
    });
    await memoryService.createExecutionEpisode({
      id: "memory_qa_episode",
      scope: "workspace",
      workspaceId: "workspace_qa_alpha",
      capabilityId: "capability.echo",
      executionId: "exec_qa_history_visible",
      eventType: "qa.execution_linked",
      summary: "QA-Intel execution-linked episode.",
      outcome: "completed",
      confidence: 1,
      sensitivity: "low",
      sourceType: "execution",
      sourceRef: "exec_qa_history_visible",
      sourceCapabilityId: "capability.echo",
      evidenceRefs: [{ executionId: "exec_qa_history_visible" }],
    });
    await seedQaResearchFixtures({
      memoryService,
      researchReportFeedbackRepository,
      researchReportRepository,
      researchSourceFeedbackRepository,
      researchSourceRepository,
      traceRepository,
      webEvidenceRepository,
    });
  } finally {
    connection.close();
  }
}

async function seedQaResearchFixtures(input: {
  memoryService: ReturnType<typeof createMemoryService>;
  researchReportFeedbackRepository: SqliteResearchReportFeedbackRepository;
  researchReportRepository: SqliteResearchReportRepository;
  researchSourceFeedbackRepository: SqliteResearchSourceFeedbackRepository;
  researchSourceRepository: SqliteResearchSourceRepository;
  traceRepository: SqliteExecutionTraceRepository;
  webEvidenceRepository: SqliteWebEvidenceRepository;
}): Promise<void> {
  const warning = await seedResearchReport(input, {
    completedAt: "2026-07-02T10:05:00.000Z",
    executionId: "exec_qa_research_warning",
    findingClaim: "QA cited finding stays linked to source evidence.",
    findingId: "research_finding_qa_warning",
    findingTitle: "QA cited finding",
    limitationCode: "qa_warning_limitation",
    limitationMessage: "QA warning limitation remains visible for review.",
    question: "QA warning research report",
    reportId: "research_report_qa_warning",
    sourceId: "research_source_qa_primary",
    sourceTitle: "QA primary source",
    startedAt: "2026-07-02T10:00:00.000Z",
    warningMessage: "QA partial source failure remains visible.",
    workspaceId: "workspace_qa_alpha",
  });

  await input.researchReportFeedbackRepository.upsert({
    reportId: warning.report.id,
    workspaceId: "workspace_qa_alpha",
    rating: "useful",
    useful: true,
    reason: "The warning report is clear.",
    notes: "Seeded QA report feedback remains visible.",
  });
  await input.researchSourceFeedbackRepository.create({
    reportId: warning.report.id,
    sourceId: warning.source.id,
    workspaceId: "workspace_qa_alpha",
    rating: "useful",
    helpful: true,
    reason: "The source supports the cited finding.",
    notes: "Seeded QA source feedback remains visible.",
  });

  await input.memoryService.proposeSemanticMemory({
    id: "memory_qa_research_proposal",
    scope: "workspace",
    workspaceId: "workspace_qa_alpha",
    subject: "qa.research.memory",
    predicate: "supports",
    value: "QA cited research can become reviewed semantic memory.",
    sourceType: "research_report",
    sourceRef: warning.report.id,
    sourceExecutionId: warning.report.executionId,
    sourceCapabilityId: "capability.research",
    evidenceRefs: [{ reportId: warning.report.id, sourceId: warning.source.id }],
    confidence: 0.91,
    sensitivity: "low",
  });
  await input.memoryService.createSemanticMemory({
    id: "memory_qa_research_active_conflict",
    scope: "workspace",
    workspaceId: "workspace_qa_alpha",
    subject: "qa.research.memory",
    predicate: "supports",
    value: "Existing active QA research memory for conflict display.",
    sourceType: "manual",
    sourceRef: "qa-seed",
    evidenceRefs: [{ reportId: warning.report.id }],
    confidence: 0.72,
    sensitivity: "low",
  });

  await seedResearchReport(input, {
    completedAt: "2026-07-02T11:05:00.000Z",
    executionId: "exec_qa_research_feedback",
    findingClaim: "QA feedback finding stays unchanged.",
    findingId: "research_finding_qa_feedback",
    findingTitle: "QA feedback finding",
    limitationCode: "qa_feedback_limitation",
    limitationMessage: "QA feedback limitation remains visible.",
    question: "QA feedback research report",
    reportId: "research_report_qa_feedback",
    sourceId: "research_source_qa_feedback_primary",
    sourceTitle: "QA feedback source",
    startedAt: "2026-07-02T11:00:00.000Z",
    workspaceId: "workspace_qa_alpha",
  });

  await seedResearchReport(input, {
    completedAt: "2026-07-02T12:05:00.000Z",
    executionId: "exec_qa_research_export",
    findingClaim: "QA export finding keeps citations, sources, and limitations together.",
    findingId: "research_finding_qa_export",
    findingTitle: "QA export finding",
    limitationCode: "qa_export_limitation",
    limitationMessage: "QA export limitation remains visible for review.",
    question: "QA export-ready research report",
    reportId: "research_report_qa_export",
    sourceId: "research_source_qa_export_primary",
    sourceTitle: "QA export source",
    startedAt: "2026-07-02T12:00:00.000Z",
    workspaceId: "workspace_qa_alpha",
  });

  const beta = await seedResearchReport(input, {
    completedAt: "2026-07-02T13:05:00.000Z",
    executionId: "exec_qa_research_beta",
    findingClaim: "QA beta warning report must stay isolated.",
    findingId: "research_finding_qa_beta",
    findingTitle: "QA beta finding",
    limitationCode: "qa_beta_limitation",
    limitationMessage: "QA beta limitation should remain hidden from alpha.",
    question: "QA beta warning research report",
    reportId: "research_report_qa_beta_warning",
    sourceId: "research_source_qa_beta_primary",
    sourceTitle: "QA beta source",
    startedAt: "2026-07-02T13:00:00.000Z",
    warningMessage: "QA beta warning should not leak into alpha.",
    workspaceId: "workspace_qa_beta",
  });
  await input.memoryService.proposeSemanticMemory({
    id: "memory_qa_research_beta_proposal",
    scope: "workspace",
    workspaceId: "workspace_qa_beta",
    subject: "qa.research.beta",
    predicate: "hidden",
    value: "Beta proposal must remain scoped to beta.",
    sourceType: "research_report",
    sourceRef: beta.report.id,
    sourceExecutionId: beta.report.executionId,
    sourceCapabilityId: "capability.research",
    evidenceRefs: [{ reportId: beta.report.id, sourceId: beta.source.id }],
    confidence: 0.88,
    sensitivity: "low",
  });
}

async function seedResearchReport(
  input: {
    researchReportRepository: SqliteResearchReportRepository;
    researchSourceRepository: SqliteResearchSourceRepository;
    traceRepository: SqliteExecutionTraceRepository;
    webEvidenceRepository: SqliteWebEvidenceRepository;
  },
  fixture: {
    completedAt: string;
    executionId: string;
    findingClaim: string;
    findingId: string;
    findingTitle: string;
    limitationCode: string;
    limitationMessage: string;
    question: string;
    reportId: string;
    sourceId: string;
    sourceTitle: string;
    startedAt: string;
    warningMessage?: string;
    workspaceId: string;
  },
) {
  const citationId = `${fixture.reportId}_citation`;
  const evidenceId = `${fixture.sourceId}_evidence`;
  const sourceUrl = `https://pap-fixture.example/articles/${fixture.sourceId}`;

  await seedResearchTrace(input.traceRepository, {
    id: fixture.executionId,
    workspaceId: fixture.workspaceId,
    startedAt: fixture.startedAt,
    completedAt: fixture.completedAt,
  });

  await input.researchReportRepository.create({
    id: fixture.reportId,
    executionId: fixture.executionId,
    workspaceId: fixture.workspaceId,
    question: fixture.question,
    summary: {
      text: `${fixture.question} summary for QA-Intel review.`,
      keyPoints: [fixture.findingClaim],
    },
    status: "running",
    createdAt: fixture.startedAt,
  });

  await input.webEvidenceRepository.createExtraction({
    id: evidenceId,
    executionId: fixture.executionId,
    workspaceId: fixture.workspaceId,
    finalUrl: sourceUrl,
    status: "completed",
    extractionMethod: "readability",
    title: fixture.sourceTitle,
    excerpt: `${fixture.sourceTitle} excerpt for QA review.`,
    wordCount: 120,
    contentTextSnapshot: `${fixture.sourceTitle} supports: ${fixture.findingClaim}`,
    contentTextSha256: "0".repeat(64),
    contentChars: 120,
    originalContentChars: 120,
    startedAt: fixture.startedAt,
    completedAt: fixture.completedAt,
    durationMs: 100,
    createdAt: fixture.startedAt,
  });

  const source = await input.researchSourceRepository.create({
    id: fixture.sourceId,
    reportId: fixture.reportId,
    executionId: fixture.executionId,
    workspaceId: fixture.workspaceId,
    evidenceId,
    url: sourceUrl,
    finalUrl: sourceUrl,
    title: fixture.sourceTitle,
    selectionRank: 1,
    relevanceScore: 0.9,
    status: "analyzed",
    createdAt: fixture.startedAt,
    updatedAt: fixture.completedAt,
  });

  const report = await input.researchReportRepository.replaceContent({
    id: fixture.reportId,
    workspaceId: fixture.workspaceId,
    summary: {
      text: `${fixture.question} summary for QA-Intel review.`,
      keyPoints: [fixture.findingClaim],
    },
    findings: [
      {
        id: fixture.findingId,
        title: fixture.findingTitle,
        claimText: fixture.findingClaim,
        citationIds: [citationId],
        confidence: 0.9,
        kind: "sourced_fact",
      },
    ],
    citations: [
      {
        citationId,
        sourceId: fixture.sourceId,
        sourceTitle: fixture.sourceTitle,
        sourceUrl,
        evidenceId,
        claimText: fixture.findingClaim,
        sourceExcerpt: `${fixture.sourceTitle} excerpt for QA review.`,
      },
    ],
    limitations: [
      {
        code: fixture.limitationCode,
        message: fixture.limitationMessage,
      },
    ],
    warnings: fixture.warningMessage
      ? [
          {
            code: "partial_source_failure",
            message: fixture.warningMessage,
          },
        ]
      : [],
    status: fixture.warningMessage ? "completed_with_warnings" : "completed",
    completedAt: fixture.completedAt,
  });

  return { report, source };
}

async function seedResearchTrace(
  traceRepository: SqliteExecutionTraceRepository,
  input: {
    id: string;
    workspaceId: string;
    startedAt: string;
    completedAt: string;
  },
): Promise<void> {
  await traceRepository.create({
    id: input.id,
    capabilityId: "capability.research",
    workspaceId: input.workspaceId,
    startedAt: input.startedAt,
  });
  await traceRepository.appendStep({
    id: `${input.id}_plan`,
    executionId: input.id,
    sequence: 0,
    kind: "workflow",
    name: "plan queries",
    status: "completed",
    summary: "Seeded QA-Intel research planning.",
    startedAt: input.startedAt,
    completedAt: input.startedAt,
  });
  await traceRepository.appendStep({
    id: `${input.id}_review`,
    executionId: input.id,
    sequence: 1,
    kind: "workflow",
    name: "persist research report",
    status: "completed",
    summary: "Seeded QA-Intel research report persistence.",
    startedAt: input.completedAt,
    completedAt: input.completedAt,
  });
  await traceRepository.markCompleted({
    executionId: input.id,
    completedAt: input.completedAt,
  });
}

async function seedTrace(
  traceRepository: SqliteExecutionTraceRepository,
  input: {
    id: string;
    workspaceId: string;
    startedAt: string;
    completedAt: string;
  },
): Promise<void> {
  await traceRepository.create({
    id: input.id,
    capabilityId: "capability.echo",
    workspaceId: input.workspaceId,
    startedAt: input.startedAt,
  });
  await traceRepository.appendStep({
    id: `${input.id}_validate`,
    executionId: input.id,
    sequence: 0,
    kind: "validation",
    name: "validate input",
    status: "completed",
    summary: "Seeded QA-Intel trace input validation.",
    startedAt: input.startedAt,
    completedAt: input.startedAt,
  });
  await traceRepository.appendStep({
    id: `${input.id}_finalize`,
    executionId: input.id,
    sequence: 1,
    kind: "workflow",
    name: "finalize execution",
    status: "completed",
    summary: "Seeded QA-Intel trace finalization.",
    startedAt: input.completedAt,
    completedAt: input.completedAt,
  });
  await traceRepository.markCompleted({
    executionId: input.id,
    completedAt: input.completedAt,
  });
}

async function waitForServer(server: ChildProcessWithoutNullStreams): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = 120_000;
  let serverExit:
    | {
        code: number | null;
        signal: NodeJS.Signals | null;
      }
    | undefined;

  server.once("exit", (code, signal) => {
    serverExit = { code, signal };
  });

  while (Date.now() - startedAt < timeoutMs) {
    if (serverExit) {
      throw new Error(
        `Web server exited before becoming healthy: code=${serverExit.code ?? "null"} signal=${
          serverExit.signal ?? "null"
        }.`,
      );
    }

    try {
      const response = await fetch(baseURL);

      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${baseURL}.`);
}

async function stopWebServer(server: ChildProcessWithoutNullStreams): Promise<void> {
  if (server.exitCode === null && !server.killed) {
    server.kill("SIGTERM");
    await Promise.race([
      waitForProcessExit(server),
      sleep(5_000).then(() => {
        if (server.exitCode === null && !server.killed) {
          server.kill("SIGKILL");
        }
      }),
    ]);
  }
}

async function writeResult(result: QaResult): Promise<void> {
  await writeFile(
    join(resultDirectory, `${suiteName}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
  );
}

function consumeServerOutput(chunk: Buffer): void {
  if (process.env.PAP_QA_VERBOSE === "true") {
    process.stderr.write(chunk);
  }
}

async function waitForProcessExit(server: ChildProcessWithoutNullStreams): Promise<void> {
  if (server.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    server.once("exit", () => resolve());
  });
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

await main();
process.exit(process.exitCode ?? 0);
