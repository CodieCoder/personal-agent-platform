import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteWorkspaceRepository,
} from "../packages/storage-sqlite/src/index.js";

const usesExternalBaseUrl = process.env.PLAYWRIGHT_BASE_URL !== undefined;

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test.beforeEach(() => {
  test.skip(
    usesExternalBaseUrl,
    "Research fixture checks require the Playwright-managed web server.",
  );
});

test("user submits workspace research, reviews citations and sources, and opens the trace", async ({
  page,
}) => {
  const ids = testIds("research");
  const forbiddenBrowserRequests = captureForbiddenBrowserRequests(page);
  const server = await startResearchFixtureServer({
    port: 3104,
    health: "healthy",
    prefix: "pap-e2e-research-success-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);

    await expect(page.getByRole("heading", { name: "Research" })).toBeVisible();
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    await page.getByLabel("Question").fill("How should PAP run source-backed research?");
    await page.getByLabel("Focus").fill("local-first deterministic evidence");
    await page.getByLabel("Time range").selectOption("week");
    await page.getByLabel("Source limit").fill("1");
    await page.getByLabel("Search results").fill("3");
    await page.getByLabel("Language").fill("en");
    await page.getByLabel("Categories").fill("general");

    await Promise.all([
      page.waitForURL(/\/research\/research_report_/u),
      page.getByRole("button", { name: "Run research" }).click(),
    ]);

    const sourcesPanel = page.locator("section[aria-labelledby='research-sources-title']");

    await expect(page.getByRole("heading", { name: "Report review" })).toBeVisible();
    await expect(page.getByText("completed").first()).toBeVisible();
    await expect(page.getByText("Research found")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cited findings" })).toBeVisible();
    await expect(
      page.getByText("Personal Agent Platform uses deterministic search").first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
    await expect(
      sourcesPanel.getByText("Local AI engineering notes for deterministic agents"),
    ).toBeVisible();
    await expect(sourcesPanel.getByText("analyzed")).toBeVisible();
    await expect(
      sourcesPanel.getByText("pap-fixture.example/articles/local-ai-engineering"),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Citations" })).toBeVisible();
    await expect(
      page
        .locator("section[aria-labelledby='research-citations-title']")
        .getByText("Excerpt:")
        .first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Limitations" })).toBeVisible();
    await expect(page.getByText("coverage_note")).toBeVisible();

    await page.getByRole("link", { name: "Open execution trace" }).click();

    await expect(page.getByRole("heading", { name: "Execution detail" })).toBeVisible();
    await expect(page.getByText("capability.research")).toBeVisible();
    await expect(page.getByText(ids.workspaceAlpha)).toBeVisible();
    await expect(page.getByText("plan queries")).toBeVisible();
    await expect(page.getByText("fetch and extract sources")).toBeVisible();
    await expect(page.getByText("validate citations")).toBeVisible();
    expect(forbiddenBrowserRequests).toEqual([]);
  } finally {
    await stopFixtureServer(server.process);
  }
});

test("partial source failure is visibly distinguishable from completed research", async ({
  page,
}) => {
  const ids = testIds("partial");
  const forbiddenBrowserRequests = captureForbiddenBrowserRequests(page);
  const server = await startResearchFixtureServer({
    port: 3105,
    health: "healthy",
    prefix: "pap-e2e-research-partial-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    await page.getByLabel("Question").fill("How should PAP surface partial research failures?");
    await page.getByLabel("Time range").selectOption("all");
    await page.getByLabel("Focus").fill("");
    await page.getByLabel("Source limit").fill("3");
    await page.getByLabel("Search results").fill("3");

    await Promise.all([
      page.waitForURL(/\/research\/research_report_/u),
      page.getByRole("button", { name: "Run research" }).click(),
    ]);

    await expect(page.getByRole("heading", { name: "Report review" })).toBeVisible();
    await expect(page.getByText("completed_with_warnings").first()).toBeVisible();
    await expect(page.getByText("fetch_failed")).toBeVisible();
    await expect(page.getByText("partial_source_failure")).toBeVisible();
    await expect(page.getByText("source_extraction_failed").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cited findings" })).toBeVisible();
    expect(forbiddenBrowserRequests).toEqual([]);
  } finally {
    await stopFixtureServer(server.process);
  }
});

test("provider failure produces a failed research report with diagnostics", async ({ page }) => {
  const ids = testIds("provider");
  const server = await startResearchFixtureServer({
    port: 3106,
    health: "unavailable",
    prefix: "pap-e2e-research-provider-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);
    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    await page.getByLabel("Question").fill("What happens when research search is unavailable?");

    await Promise.all([
      page.waitForURL(/\/research\/research_report_/u),
      page.getByRole("button", { name: "Run research" }).click(),
    ]);

    await expect(page.getByRole("heading", { name: "Report review" })).toBeVisible();
    await expect(page.getByText("failed").first()).toBeVisible();
    await expect(page.getByText("Search is unavailable")).toBeVisible();
    await expect(page.getByText("search_provider_unavailable")).toBeVisible();
    await expect(page.getByText("No source-backed findings were produced.")).toBeVisible();
  } finally {
    await stopFixtureServer(server.process);
  }
});

test("research report workspace isolation hides reports from other workspaces", async ({
  page,
}) => {
  const ids = testIds("isolation");
  const server = await startResearchFixtureServer({
    port: 3107,
    health: "healthy",
    prefix: "pap-e2e-research-isolation-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    await page.getByLabel("Question").fill("How should workspace isolation protect research?");

    await Promise.all([
      page.waitForURL(/\/research\/research_report_/u),
      page.getByRole("button", { name: "Run research" }).click(),
    ]);

    const reportId = new URL(page.url()).pathname.split("/").pop() ?? "";

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceBeta}`);
    await expect(page.getByRole("heading", { name: "Research" })).toBeVisible();
    await expect(page.getByText("No research reports match this scope.")).toBeVisible();

    await page.goto(
      `${server.baseURL}/research/${encodeURIComponent(reportId)}?workspaceId=${ids.workspaceBeta}`,
    );
    await expect(page.getByRole("heading", { name: "Report not found" })).toBeVisible();
  } finally {
    await stopFixtureServer(server.process);
  }
});

test("pending memory proposal remains proposed after research completes", async ({ page }) => {
  const ids = testIds("memory");
  const server = await startResearchFixtureServer({
    port: 3108,
    health: "healthy",
    prefix: "pap-e2e-research-memory-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    await page.getByLabel("Question").fill("Which research finding should become proposed memory?");
    await page.getByLabel("Source limit").fill("1");
    await page.getByLabel("Search results").fill("3");
    await page.getByLabel("Propose citation-backed memory").check();

    await Promise.all([
      page.waitForURL(/\/research\/research_report_/u),
      page.getByRole("button", { name: "Run research" }).click(),
    ]);

    await expect(page.getByRole("heading", { name: "Memory proposal" })).toBeVisible();
    await expect(page.getByText("pending_review")).toBeVisible();
    await expect(page.getByText("1 pending, 0 active, 0 rejected.")).toBeVisible();

    await page.getByRole("link", { name: "proposed" }).click();

    await expect(page.getByText("semantic / proposed")).toBeVisible();
    await expect(page.getByText("research_report", { exact: true })).toBeVisible();
    await expect(page.getByText("capability.research").first()).toBeVisible();
  } finally {
    await stopFixtureServer(server.process);
  }
});

async function seedWorkspaces(
  ids: ReturnType<typeof testIds>,
  databaseUrl = process.env.PAP_E2E_DATABASE_URL,
): Promise<void> {
  if (!databaseUrl) {
    throw new Error("PAP_E2E_DATABASE_URL is required for research Playwright fixtures.");
  }

  const connection = createSqliteDatabase({ databaseUrl });
  const workspaceRepository = new SqliteWorkspaceRepository(connection.db);

  try {
    await workspaceRepository.create({
      id: ids.workspaceAlpha,
      name: "Research Alpha",
      description: "Visible research workspace.",
    });
    await workspaceRepository.create({
      id: ids.workspaceBeta,
      name: "Research Beta",
      description: "Hidden research workspace.",
    });
  } finally {
    connection.close();
  }
}

function captureForbiddenBrowserRequests(page: Page): string[] {
  const requests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    const isLocalApp = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const isKnownLocalProvider = url.port === "11434" || url.port === "8080";

    if (!isLocalApp || isKnownLocalProvider || url.hostname === "pap-fixture.example") {
      requests.push(request.url());
    }
  });

  return requests;
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

async function startResearchFixtureServer(input: {
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
      PAP_RESEARCH_TEST_FIXTURES: "true",
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
