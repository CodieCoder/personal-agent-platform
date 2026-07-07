import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteEpisodicMemoryRepository,
  SqliteExecutionTraceRepository,
  SqliteSemanticMemoryRepository,
  SqliteWorkspaceRepository,
} from "../../../packages/storage-sqlite/src/index.js";
import { createMemoryService } from "../../../packages/memory/src/index.js";
import { compileGherkin, runSuiteTool, type RunSuiteOutput } from "@qutecoder/qa-intel";

const suiteName = "pap-behavior";
const port = 3101;
const baseURL = `http://127.0.0.1:${port}`;
const featureDirectory = resolve("qa/features");
const artifactDirectory = resolve(".qa-results/artifacts");
const resultsDatabasePath = resolve(".qa-results/results.db");
const resultDirectory = resolve("qa/results");

type QaProviderMode = "live" | "fixture";
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

function shouldRunFeature(input: { entry: string; providerMode: QaProviderMode }): boolean {
  if (input.entry.endsWith(".fixture.feature")) {
    return input.providerMode === "fixture";
  }

  if (input.entry.endsWith(".live.feature")) {
    return input.providerMode === "live";
  }

  return true;
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

function resolveProviderMode(value: string | undefined): QaProviderMode {
  if (value === undefined || value.trim() === "") {
    return "live";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "live" || normalized === "fixture") {
    return normalized;
  }

  throw new Error("PAP_QA_PROVIDER_MODE must be 'live' or 'fixture'.");
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
  } finally {
    connection.close();
  }
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
