import { expect, test } from "@playwright/test";
import {
  createSqliteDatabase,
  SqliteEpisodicMemoryRepository,
  SqliteExecutionTraceRepository,
  SqliteSemanticMemoryRepository,
  SqliteWorkspaceRepository,
} from "../packages/storage-sqlite/src/index.js";
import { createMemoryService } from "../packages/memory/src/index.js";

test("user runs echo in a selected workspace and sees the persisted trace", async ({ page }) => {
  const ids = testIds("echo");
  await seed((fixture) =>
    fixture.workspaceRepository.create({
      id: ids.workspaceAlpha,
      name: "Echo Alpha",
      description: "Echo execution workspace.",
    }),
  );

  await page.goto(`/?workspaceId=${ids.workspaceAlpha}`);

  await expect(page.getByRole("heading", { name: "Echo runtime" })).toBeVisible();
  await expect(page.locator('[data-runtime-ready="true"]')).toBeVisible();

  await page.getByLabel("Message").fill("Hello Personal Agent");
  await page.getByRole("button", { name: "Run echo" }).click();

  const resultStatus = page.getByRole("status").filter({ hasText: "Completed" });
  await expect(resultStatus.getByText("Hello Personal Agent")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open execution detail" })).toBeVisible();

  await page.getByRole("link", { name: "Open execution detail" }).click();

  await expect(page.getByRole("heading", { name: "Execution detail" })).toBeVisible();
  await expect(page.getByText("completed").first()).toBeVisible();
  await expect(page.getByText(ids.workspaceAlpha)).toBeVisible();
  await expect(page.getByText("validate input")).toBeVisible();
  await expect(page.getByText("echo.normalize")).toBeVisible();
  await expect(page.getByText("finalize execution")).toBeVisible();
});

test("user filters execution history and opens a trace from filtered results", async ({ page }) => {
  const ids = testIds("history");
  await seed(async (fixture) => {
    await fixture.workspaceRepository.create({
      id: ids.workspaceAlpha,
      name: "History Alpha",
      description: "Visible execution workspace.",
    });
    await fixture.workspaceRepository.create({
      id: ids.workspaceBeta,
      name: "History Beta",
      description: "Hidden execution workspace.",
    });
    await seedTrace(fixture, {
      id: ids.executionNew,
      capabilityId: "capability.echo",
      workspaceId: ids.workspaceAlpha,
      status: "completed",
      startedAt: "2026-07-01T12:00:00.000Z",
      completedAt: "2026-07-01T12:01:00.000Z",
    });
    await seedTrace(fixture, {
      id: ids.executionOld,
      capabilityId: "capability.echo",
      workspaceId: ids.workspaceAlpha,
      status: "completed",
      startedAt: "2026-07-01T10:00:00.000Z",
      completedAt: "2026-07-01T10:01:00.000Z",
    });
    await seedTrace(fixture, {
      id: ids.executionFailed,
      capabilityId: "capability.echo",
      workspaceId: ids.workspaceAlpha,
      status: "failed",
      startedAt: "2026-07-01T11:00:00.000Z",
      completedAt: "2026-07-01T11:01:00.000Z",
    });
    await seedTrace(fixture, {
      id: ids.executionOtherWorkspace,
      capabilityId: "capability.echo",
      workspaceId: ids.workspaceBeta,
      status: "completed",
      startedAt: "2026-07-01T13:00:00.000Z",
      completedAt: "2026-07-01T13:01:00.000Z",
    });
    await seedTrace(fixture, {
      id: ids.executionOtherCapability,
      capabilityId: "capability.other",
      workspaceId: ids.workspaceAlpha,
      status: "completed",
      startedAt: "2026-07-01T14:00:00.000Z",
      completedAt: "2026-07-01T14:01:00.000Z",
    });
  });

  await page.goto(
    `/executions?workspaceId=${ids.workspaceAlpha}&capabilityId=capability.echo&status=completed&from=2026-07-01&to=2026-07-01&page=1&pageSize=1`,
  );

  await expect(page.getByRole("heading", { name: "Execution history" })).toBeVisible();
  await expect(page.getByText(ids.executionNew)).toBeVisible();
  await expect(page.getByText(ids.executionOld)).not.toBeVisible();
  await expect(page.getByText(ids.executionOtherWorkspace)).not.toBeVisible();
  await expect(page.getByText(ids.executionOtherCapability)).not.toBeVisible();

  await page.locator("a").filter({ hasText: ids.executionNew }).click();
  await expect(page.getByRole("heading", { name: "Execution detail" })).toBeVisible();
  await expect(page.getByText(ids.workspaceAlpha)).toBeVisible();
  await expect(page.getByText("seed trace step")).toBeVisible();

  await page.goBack();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/workspaceId=/);
  await expect(page).toHaveURL(/capabilityId=capability\.echo/);
  await expect(page).toHaveURL(/status=completed/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(ids.executionOld)).toBeVisible();
  await expect(page.getByText(ids.executionOtherWorkspace)).not.toBeVisible();
});

test("user browses semantic memory by workspace and sees safe create errors", async ({ page }) => {
  const ids = testIds("semantic");
  await seed(async (fixture) => {
    await fixture.workspaceRepository.create({
      id: ids.workspaceAlpha,
      name: "Semantic Alpha",
      description: "Visible memory workspace.",
    });
    await fixture.workspaceRepository.create({
      id: ids.workspaceBeta,
      name: "Semantic Beta",
      description: "Hidden memory workspace.",
    });
    await fixture.memoryService.createSemanticMemory({
      id: ids.semanticAlpha,
      scope: "workspace",
      workspaceId: ids.workspaceAlpha,
      subject: `project.${ids.safeSuffix}.alpha`,
      predicate: "stores.context",
      value: "visible workspace context",
      confidence: 0.92,
      sensitivity: "low",
      sourceType: "manual",
      sourceRef: "playwright",
    });
    await fixture.memoryService.createSemanticMemory({
      id: ids.semanticBeta,
      scope: "workspace",
      workspaceId: ids.workspaceBeta,
      subject: `project.${ids.safeSuffix}.beta`,
      predicate: "stores.context",
      value: "hidden workspace context",
      confidence: 0.9,
      sensitivity: "low",
      sourceType: "manual",
      sourceRef: "playwright",
    });
  });

  await page.goto(`/memory/semantic?scope=workspace&workspaceId=${ids.workspaceAlpha}`);

  await expect(page.getByRole("heading", { name: "Semantic memory" })).toBeVisible();
  await expect(page.getByText(`project.${ids.safeSuffix}.alpha`)).toBeVisible();
  await expect(page.getByText(`project.${ids.safeSuffix}.beta`)).not.toBeVisible();
  await expect(page.getByText("confidence 92%")).toBeVisible();

  const createPanel = page.getByRole("complementary", { name: "Manual create" });
  await expect(createPanel.locator('[data-memory-ready="true"]')).toBeVisible();
  await createPanel.locator("#semantic-subject").fill(`project.${ids.safeSuffix}.bad-source`);
  await createPanel.locator("#semantic-predicate").fill("stores.context");
  await createPanel.locator("#semantic-value").fill('"bad source execution"');
  await createPanel.locator("#semantic-evidence").fill("{bad-json");
  await expect(createPanel.locator("#semantic-evidence")).toHaveValue("{bad-json");
  await createPanel.getByRole("button", { name: "Create semantic memory" }).click();

  await expect(page.getByRole("alert")).toContainText("MEMORY_EVIDENCE_REFS_INVALID");
});

test("user opens an execution-linked episode and follows its execution link", async ({ page }) => {
  const ids = testIds("episode");
  await seed(async (fixture) => {
    await fixture.workspaceRepository.create({
      id: ids.workspaceAlpha,
      name: "Episode Alpha",
      description: "Execution-linked episode workspace.",
    });
    await seedTrace(fixture, {
      id: ids.executionNew,
      capabilityId: "capability.echo",
      workspaceId: ids.workspaceAlpha,
      status: "completed",
      startedAt: "2026-07-01T15:00:00.000Z",
      completedAt: "2026-07-01T15:01:00.000Z",
    });
    await fixture.memoryService.createExecutionEpisode({
      id: ids.episode,
      scope: "workspace",
      workspaceId: ids.workspaceAlpha,
      capabilityId: "capability.echo",
      executionId: ids.executionNew,
      eventType: "echo.completed",
      summary: "Echo completed and wrote an episodic memory fixture.",
      outcome: "completed",
      confidence: 1,
      sensitivity: "low",
      sourceType: "execution",
      sourceRef: ids.executionNew,
      sourceCapabilityId: "capability.echo",
      evidenceRefs: [{ executionId: ids.executionNew }],
    });
  });

  await page.goto(
    `/memory/episodes?workspaceId=${ids.workspaceAlpha}&executionId=${ids.executionNew}`,
  );

  await expect(page.getByRole("heading", { name: "Episodic memory" })).toBeVisible();
  await expect(page.getByText("echo.completed")).toBeVisible();

  await page.locator("a").filter({ hasText: "echo.completed" }).click();
  await expect(page.getByRole("heading", { name: "echo.completed" })).toBeVisible();
  await expect(page.getByRole("link", { name: ids.executionNew })).toBeVisible();

  await page.getByRole("link", { name: ids.executionNew }).click();
  await expect(page.getByRole("heading", { name: "Execution detail" })).toBeVisible();
  await expect(page.getByText("seed trace step")).toBeVisible();
});

test("not-found states remain safe for executions and memory", async ({ page }) => {
  const ids = testIds("notfound");

  await page.goto(`/executions/${ids.executionMissing}`);
  await expect(page.getByRole("heading", { name: "Execution not found" })).toBeVisible();
  await expect(page.getByText("No persisted trace exists for this execution ID.")).toBeVisible();

  await page.goto(`/memory/${ids.memoryMissing}`);
  await expect(page.getByRole("heading", { name: "Memory not found" })).toBeVisible();
  await expect(page.getByText("No semantic or episodic memory exists for this ID.")).toBeVisible();
});

type SeedFixture = ReturnType<typeof createSeedFixture>;

type SeedTraceInput = {
  id: string;
  capabilityId: string;
  workspaceId?: string | undefined;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt?: string | undefined;
};

async function seed(action: (fixture: SeedFixture) => Promise<unknown>): Promise<void> {
  const fixture = createSeedFixture();

  try {
    await action(fixture);
  } finally {
    fixture.close();
  }
}

async function seedTrace(fixture: SeedFixture, input: SeedTraceInput): Promise<void> {
  await fixture.traceRepository.create({
    id: input.id,
    capabilityId: input.capabilityId,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    startedAt: input.startedAt,
  });
  await fixture.traceRepository.appendStep({
    id: `${input.id}_step_0`,
    executionId: input.id,
    sequence: 0,
    kind: "workflow",
    name: "seed trace step",
    status: "completed",
    summary: "Seeded by Playwright fixture setup.",
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? input.startedAt,
  });

  if (input.status === "completed") {
    await fixture.traceRepository.markCompleted({
      executionId: input.id,
      completedAt: input.completedAt ?? input.startedAt,
    });
    return;
  }

  if (input.status === "failed") {
    await fixture.traceRepository.markFailed({
      executionId: input.id,
      completedAt: input.completedAt ?? input.startedAt,
      error: {
        code: "PLAYWRIGHT_TRACE_FAILED",
        message: "Seeded failed execution.",
        category: "storage",
        retryable: false,
      },
    });
    return;
  }

  if (input.status === "cancelled") {
    await fixture.traceRepository.markCancelled({
      executionId: input.id,
      completedAt: input.completedAt ?? input.startedAt,
      reason: "Seeded cancelled execution.",
    });
  }
}

function createSeedFixture() {
  const databaseUrl = process.env.PAP_E2E_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "PAP_E2E_DATABASE_URL is required for seeded Playwright tests when PLAYWRIGHT_BASE_URL is used.",
    );
  }

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

  return {
    traceRepository,
    workspaceRepository,
    semanticMemoryRepository,
    episodicMemoryRepository,
    memoryService,
    close: connection.close,
  };
}

function testIds(label: string) {
  const safeSuffix = `${label}_${test.info().parallelIndex}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`.toLowerCase();

  return {
    safeSuffix,
    workspaceAlpha: `workspace_${safeSuffix}_alpha`,
    workspaceBeta: `workspace_${safeSuffix}_beta`,
    executionNew: `exec_${safeSuffix}_new`,
    executionOld: `exec_${safeSuffix}_old`,
    executionFailed: `exec_${safeSuffix}_failed`,
    executionOtherWorkspace: `exec_${safeSuffix}_other_workspace`,
    executionOtherCapability: `exec_${safeSuffix}_other_capability`,
    executionMissing: `exec_${safeSuffix}_missing`,
    semanticAlpha: `memory_${safeSuffix}_alpha`,
    semanticBeta: `memory_${safeSuffix}_beta`,
    episode: `memory_${safeSuffix}_episode`,
    memoryMissing: `memory_${safeSuffix}_missing`,
  };
}
