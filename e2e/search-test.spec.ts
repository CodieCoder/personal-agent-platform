import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteWorkspaceRepository,
} from "../packages/storage-sqlite/src/index.js";

const usesExternalBaseUrl = process.env.PLAYWRIGHT_BASE_URL !== undefined;

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  test.skip(
    usesExternalBaseUrl,
    "Search extraction fixture checks require the Playwright-managed web server.",
  );
  setFixtureHealth("healthy");
});

test("user searches, selects a result, extracts content, and opens trace evidence", async ({
  page,
}) => {
  const ids = testIds("search");
  await seedWorkspaces(ids);
  const forbiddenBrowserRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());

    if (url.hostname === "pap-fixture.example" || request.url().includes(":8080/search")) {
      forbiddenBrowserRequests.push(request.url());
    }
  });

  await page.goto(`/search-test?workspaceId=${ids.workspaceAlpha}`);

  await expect(page.getByRole("heading", { name: "Search extraction test" })).toBeVisible();
  await expect(page.locator('[data-search-test-ready="true"]')).toBeVisible();
  await expect(page.getByText("provider.searxng").first()).toBeVisible();
  await expect(page.getByText("healthy").first()).toBeVisible();

  await page.getByLabel("Query").fill("local AI engineering");
  await page.getByRole("button", { name: "Run search" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Search completed" })).toBeVisible();
  await expect(
    page.getByText("Local AI engineering notes for deterministic agents").first(),
  ).toBeVisible();
  await expect(page.getByText("pap-fixture.example/articles/local-ai-engineering")).toBeVisible();
  await expect(page.getByText("fixture").first()).toBeVisible();

  await page
    .getByRole("listitem")
    .filter({ hasText: "Local AI engineering notes" })
    .getByRole("button", { name: /Select result Local AI engineering/u })
    .click();
  await expect(page.getByRole("button", { name: "Extract selected result" })).toBeEnabled();

  await page.getByRole("button", { name: "Extract selected result" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Extraction completed" })).toBeVisible();
  await expect(page.getByText("readability").first()).toBeVisible();
  await expect(page.getByText("extraction_profile_not_found")).toBeVisible();
  await expect(page.getByText("Personal Agent Platform uses deterministic search")).toBeVisible();

  await page.getByRole("link", { name: "Open extraction execution detail" }).click();

  await expect(page.getByRole("heading", { name: "Execution detail" })).toBeVisible();
  await expect(page.getByText("completed").first()).toBeVisible();
  await expect(page.getByText(ids.workspaceAlpha)).toBeVisible();
  await expect(page.getByText("search web")).toBeVisible();
  await expect(page.getByText("fetch URL")).toBeVisible();
  await expect(page.getByText("extract readable content")).toBeVisible();
  await expect(page.getByText("persist web evidence")).toBeVisible();
  await expect(page.getByText("search evidence id")).toBeVisible();

  const extractionExecutionId = page.url().match(/\/executions\/([^?]+)/u)?.[1] ?? "";
  await page.goto(
    `/executions?workspaceId=${ids.workspaceBeta}&capabilityId=capability.search-extract-test&status=completed&page=1&pageSize=10`,
  );
  await expect(page.getByRole("heading", { name: "Execution history" })).toBeVisible();
  await expect(page.getByText(extractionExecutionId)).not.toBeVisible();
  await expect(page.getByText("No executions match these filters.")).toBeVisible();
  expect(forbiddenBrowserRequests).toEqual([]);
});

test("provider unavailable state is actionable and keeps a failed execution trace", async ({
  page,
}) => {
  const ids = testIds("provider");
  const server = await startFixtureServer({
    port: 3102,
    health: "unavailable",
    prefix: "pap-e2e-search-unavailable-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);
    await page.goto(`${server.baseURL}/search-test?workspaceId=${ids.workspaceAlpha}`);

    await expect(page.locator('[data-search-test-ready="true"]')).toBeVisible();
    await expect(page.getByText("unavailable").first()).toBeVisible();
    await expect(page.getByText("Start local SearXNG")).toBeVisible();

    await page.getByLabel("Query").fill("local AI engineering");
    await page.getByRole("button", { name: "Run search" }).click();

    await expect(page.getByRole("alert")).toContainText("WEB_SEARCH_FAILED");
    await expect(page.getByText("Check the local SearXNG service")).toBeVisible();

    await page.getByRole("link", { name: "Open failed execution detail" }).click();

    await expect(page.getByRole("heading", { name: "Execution detail" })).toBeVisible();
    await expect(page.getByText("failed").first()).toBeVisible();
    await expect(page.getByText("search provider health check")).toBeVisible();
    await expect(page.getByText("health status")).toBeVisible();
    await expect(page.getByText("unavailable").first()).toBeVisible();
  } finally {
    await stopFixtureServer(server.process);
  }
});

test("unsafe local-network result selection fails through the server-side URL policy", async ({
  page,
}) => {
  const ids = testIds("unsafe");
  await seedWorkspaces(ids);

  await page.goto(`/search-test?workspaceId=${ids.workspaceAlpha}`);
  await expect(page.locator('[data-search-test-ready="true"]')).toBeVisible();
  await page.getByLabel("Query").fill("local AI engineering");
  await page.getByRole("button", { name: "Run search" }).click();
  await expect(page.getByText("Blocked local-network control panel")).toBeVisible();

  await page
    .getByRole("listitem")
    .filter({ hasText: "Blocked local-network control panel" })
    .getByRole("button", { name: /Select result Blocked local-network/u })
    .click();
  await page.getByRole("button", { name: "Extract selected result" }).click();

  await expect(page.getByRole("alert")).toContainText("WEB_FETCH_FAILED");
  await expect(page.getByText("server-side fetch policy")).toBeVisible();

  await page.getByRole("link", { name: "Open failed execution detail" }).click();

  await expect(page.getByRole("heading", { name: "Execution detail" })).toBeVisible();
  await expect(page.getByText("validate URL policy")).toBeVisible();
  await expect(page.getByText("fetch_url_blocked")).toBeVisible();
  await expect(page.getByText("persist web evidence")).toBeVisible();
});

async function seedWorkspaces(
  ids: ReturnType<typeof testIds>,
  databaseUrl = process.env.PAP_E2E_DATABASE_URL,
): Promise<void> {
  if (!databaseUrl) {
    throw new Error("PAP_E2E_DATABASE_URL is required for search-test Playwright fixtures.");
  }

  const connection = createSqliteDatabase({ databaseUrl });
  const workspaceRepository = new SqliteWorkspaceRepository(connection.db);

  try {
    await workspaceRepository.create({
      id: ids.workspaceAlpha,
      name: "Search Alpha",
      description: "Visible search extraction workspace.",
    });
    await workspaceRepository.create({
      id: ids.workspaceBeta,
      name: "Search Beta",
      description: "Hidden search extraction workspace.",
    });
  } finally {
    connection.close();
  }
}

function setFixtureHealth(health: "healthy" | "unavailable"): void {
  const controlFile = process.env.PAP_SEARCH_TEST_FIXTURE_CONTROL_FILE;

  if (!controlFile) {
    throw new Error("PAP_SEARCH_TEST_FIXTURE_CONTROL_FILE is required for search fixture tests.");
  }

  writeFileSync(controlFile, `${JSON.stringify({ health })}\n`);
}

function testIds(label: string) {
  const safeSuffix = `${label}_${test.info().parallelIndex}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`.toLowerCase();

  return {
    workspaceAlpha: `workspace_${safeSuffix}_alpha`,
    workspaceBeta: `workspace_${safeSuffix}_beta`,
  };
}

async function startFixtureServer(input: {
  port: number;
  health: "healthy" | "unavailable";
  prefix: string;
}): Promise<{
  process: ChildProcessWithoutNullStreams;
  baseURL: string;
  databaseUrl: string;
}> {
  const dataDir = mkdtempSync(join(tmpdir(), input.prefix));
  const databaseUrl = `file:${join(dataDir, "pap.db")}`;
  const baseURL = `http://127.0.0.1:${input.port}`;

  runMigrations({ databaseUrl });

  const server = spawn("pnpm", ["dev:web"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PAP_ENVIRONMENT: "test",
      PAP_BIND_HOST: "127.0.0.1",
      PAP_PORT: String(input.port),
      PAP_DATABASE_URL: databaseUrl,
      PAP_DATA_DIR: dataDir,
      PAP_LOG_LEVEL: "silent",
      OLLAMA_ENABLED: "false",
      PAP_SEARCH_TEST_FIXTURES: "true",
      PAP_SEARCH_TEST_FIXTURE_HEALTH: input.health,
    },
  });

  server.stdout.on("data", consumeServerOutput);
  server.stderr.on("data", consumeServerOutput);
  await waitForFixtureServer(server, baseURL);

  return {
    process: server,
    baseURL,
    databaseUrl,
  };
}

async function waitForFixtureServer(
  server: ChildProcessWithoutNullStreams,
  baseURL: string,
): Promise<void> {
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
        `Fixture web server exited before becoming healthy: code=${
          serverExit.code ?? "null"
        } signal=${serverExit.signal ?? "null"}.`,
      );
    }

    try {
      const response = await fetch(baseURL);

      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${baseURL}.`);
}

async function stopFixtureServer(server: ChildProcessWithoutNullStreams): Promise<void> {
  if (server.exitCode === null && !server.killed) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => server.once("exit", () => resolve())),
      sleep(5_000).then(() => {
        if (server.exitCode === null && !server.killed) {
          server.kill("SIGKILL");
        }
      }),
    ]);
  }
}

function consumeServerOutput(chunk: Buffer): void {
  if (process.env.PAP_E2E_VERBOSE === "true") {
    process.stderr.write(chunk);
  }
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
