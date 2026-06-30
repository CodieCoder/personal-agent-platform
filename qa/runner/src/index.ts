import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compileGherkin, runSuiteTool, type RunSuiteOutput } from "@qutecoder/qa-intel";

const scenarioName = "runtime-echo";
const port = 3101;
const baseURL = `http://127.0.0.1:${port}`;
const featurePath = resolve("qa/features/runtime-echo.feature");
const artifactDirectory = resolve(".qa-results/artifacts");
const resultsDatabasePath = resolve(".qa-results/results.db");
const resultDirectory = resolve("qa/results");

type QaResult = {
  scenario: string;
  status: "passed" | "failed" | "error";
  featurePath: string;
  artifactDirectory: string;
  resultsDatabasePath: string;
  qaIntel: RunSuiteOutput;
  fixHint?: string;
};

async function main(): Promise<void> {
  const feature = await readFile(featurePath, "utf8");
  const compiled = compileGherkin(feature, { sourceFile: featurePath });

  if (compiled.contracts.length === 0 || compiled.errors.length > 0) {
    const qaIntel: RunSuiteOutput = {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "QA-Intel could not compile the runtime echo feature.",
        details: {
          errors: compiled.errors,
          warnings: compiled.warnings,
        },
      },
    };

    await writeResult({
      scenario: scenarioName,
      status: "error",
      featurePath,
      artifactDirectory,
      resultsDatabasePath,
      qaIntel,
      fixHint: "Update qa/features/runtime-echo.feature to strict QA-Intel Gherkin syntax.",
    });
    process.stdout.write(`${JSON.stringify(qaIntel, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }

  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(resultDirectory, { recursive: true });

  const dataDir = await mkdtemp(join(tmpdir(), "pap-qa-"));
  const server = startWebServer(dataDir);

  try {
    await waitForServer(server);
    const qaIntel = await runSuiteTool({
      suite: {
        name: scenarioName,
        baseUrl: baseURL,
        contracts: compiled.contracts,
      },
      baseUrl: baseURL,
      artifactDir: artifactDirectory,
      resultsDb: resultsDatabasePath,
      config: {
        failFast: true,
        headless: true,
        timeoutMs: 10_000,
      },
    });

    await writeResult({
      scenario: scenarioName,
      status: qaIntel.ok && qaIntel.data?.status === "passed" ? "passed" : "failed",
      featurePath,
      artifactDirectory,
      resultsDatabasePath,
      qaIntel,
      ...(qaIntel.ok && qaIntel.data?.status === "passed"
        ? {}
        : {
            fixHint:
              "Inspect .qa-results artifacts, qa/results/runtime-echo.json, and the QA-Intel failure hints.",
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
      scenario: scenarioName,
      status: "error",
      featurePath,
      artifactDirectory,
      resultsDatabasePath,
      qaIntel,
      fixHint: "Run pnpm test:e2e and inspect the echo form or execution trace rendering.",
    });
    process.stdout.write(`${JSON.stringify(qaIntel, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    await stopWebServer(server);
  }
}

function startWebServer(dataDir: string): ChildProcessWithoutNullStreams {
  const server = spawn("pnpm", ["dev:web"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PAP_ENVIRONMENT: "test",
      PAP_BIND_HOST: "127.0.0.1",
      PAP_PORT: String(port),
      PAP_DATABASE_URL: `file:${join(dataDir, "pap.db")}`,
      PAP_DATA_DIR: dataDir,
      PAP_LOG_LEVEL: "silent",
    },
  });

  server.stdout.on("data", consumeServerOutput);
  server.stderr.on("data", consumeServerOutput);
  return server;
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
    join(resultDirectory, `${scenarioName}.json`),
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
