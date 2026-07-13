import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Download, type Page } from "@playwright/test";
import {
  createSqliteDatabase,
  runMigrations,
  SqliteExecutionTraceRepository,
  SqliteResearchReportRepository,
  SqliteResearchSourceRepository,
  SqliteSemanticMemoryRepository,
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
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: server.baseURL,
    });

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);

    await expect(page.getByRole("heading", { name: "Research" })).toBeVisible();
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    // Explicitly select the workspace by label to work around SSR defaultValue hydration.
    await page.getByLabel("Workspace").selectOption("Research Alpha");
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

    const exportPanel = page.locator("section[aria-labelledby='research-export-title']");
    await expect(exportPanel.getByRole("button", { name: "Copy plain text" })).toBeVisible();
    await exportPanel.getByRole("button", { name: "Copy plain text" }).click();
    await expect(exportPanel.getByText("Plain text copied to clipboard.")).toBeVisible();

    const clipboardText = await page.evaluate(() =>
      (
        navigator as Navigator & { clipboard: { readText(): Promise<string> } }
      ).clipboard.readText(),
    );
    expect(clipboardText).toContain("Sources (1)");
    expect(clipboardText).toMatch(/Limitations \(\d+\)/u);
    expect(clipboardText).toContain("coverage_note");
    expect(clipboardText).toContain("[C1]");
    expect(clipboardText).not.toContain("## Sources");

    const [markdownDownload] = await Promise.all([
      page.waitForEvent("download"),
      exportPanel.getByRole("button", { name: "Download Markdown" }).click(),
    ]);
    await expect(exportPanel.getByText("Markdown download started.")).toBeVisible();
    const markdownContent = await readDownloadedText(markdownDownload);
    expect(markdownContent).toContain("# Research Report");
    expect(markdownContent).toContain("## Sources (1)");
    expect(markdownContent).toContain("## Citations (2)");
    expect(markdownContent).toMatch(/## Limitations \(\d+\)/u);
    expect(markdownContent).toContain("coverage_note");
    expect(markdownContent).toContain("[C1]");

    const [jsonDownload] = await Promise.all([
      page.waitForEvent("download"),
      exportPanel.getByRole("button", { name: "Download JSON" }).click(),
    ]);
    await expect(exportPanel.getByText("JSON download started.")).toBeVisible();
    const jsonContent = await readDownloadedText(jsonDownload);
    const exportedReport = JSON.parse(jsonContent);
    const reportId = new URL(page.url()).pathname.split("/").pop() ?? "";
    const exportDate = (exportedReport.completedAt ?? exportedReport.createdAt).slice(0, 10);

    expect(jsonDownload.suggestedFilename()).toBe(`research-${reportId}-${exportDate}.json`);
    expect(markdownDownload.suggestedFilename()).toBe(`research-${reportId}-${exportDate}.md`);
    expect(exportedReport.id).toBe(reportId);
    expect(exportedReport.summary.keyPoints.length).toBeGreaterThan(0);
    expect(exportedReport.findings[0].id).toMatch(/^research_finding_/u);
    expect(exportedReport.findings[0].kind).toBe("sourced_fact");
    expect(exportedReport.citations[0].evidenceId).toBe(exportedReport.sources[0].evidenceId);
    expect(exportedReport.sources[0].evidenceId.length).toBeGreaterThan(0);
    expect(exportedReport.sources[0].selectionRank).toBe(1);
    expect(exportedReport.sources[0].analysis).not.toBeNull();
    expect(exportedReport.sources[0].citationIds).toEqual(expect.any(Array));
    expect(exportedReport.status).toBe("completed");
    expect(jsonContent).not.toContain("rawProviderOutput");
    expect(jsonContent).not.toContain("hiddenReasoning");
    expect(jsonContent).not.toContain("stackTrace");

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

async function readDownloadedText(download: Download): Promise<string> {
  const path = await download.path();

  if (path === null) {
    throw new Error(`Playwright did not provide a local path for ${download.suggestedFilename()}.`);
  }

  return readFile(path, "utf8");
}

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

test("workspace research dashboard filters, paginates, and opens report detail", async ({
  page,
}) => {
  const ids = testIds("history");
  const server = await startResearchFixtureServer({
    port: 3109,
    health: "healthy",
    prefix: "pap-e2e-research-history-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);
    const reports = await seedResearchHistory(ids, server.databaseUrl);

    await page.goto(`${server.baseURL}/workspaces/${ids.workspaceAlpha}/research`);

    const dashboard = page.locator("section[aria-labelledby='workspace-research-summary-title']");

    await expect(page.getByRole("heading", { name: "Research Alpha" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(dashboard.getByText("Reports")).toBeVisible();
    await expect(dashboard.getByText("3").first()).toBeVisible();

    await page.getByLabel("Question search").fill("completed");
    await Promise.all([
      page.waitForURL(/question=completed/u),
      page.getByRole("button", { name: "Apply filters" }).click(),
    ]);
    await expect(page.getByText("Alpha completed history report")).toBeVisible();
    await expect(page.getByText("Alpha warning history report")).toHaveCount(0);

    await page.goto(
      `${server.baseURL}/workspaces/${ids.workspaceAlpha}/research?question=warning&hasWarnings=true&page=1&pageSize=10`,
    );
    await expect(page).toHaveURL(/question=warning/u);
    await expect(page).toHaveURL(/hasWarnings=true/u);
    await expect(page.getByLabel("Question search")).toHaveValue("warning");
    await expect(page.getByLabel("Warnings")).toHaveValue("true");
    await expect(page.getByText("Alpha warning history report")).toBeVisible();
    await expect(page.getByText("2 sources")).toBeVisible();
    await expect(page.getByText("1 warnings")).toBeVisible();
    await expect(page.getByText("1 pending memory")).toBeVisible();
    const warningReportCard = page.getByRole("link", { name: new RegExp(reports.warning, "u") });
    await expect(warningReportCard.getByText(ids.workspaceAlpha)).toBeVisible();
    await expect(page.getByText("Beta warning history report")).toHaveCount(0);

    await warningReportCard.click();
    await expect(page).toHaveURL(new RegExp(`/research/${reports.warning}`, "u"));
    await expect(page.getByRole("heading", { name: "Report review" })).toBeVisible();
    await expect(page.getByText("partial_source_failure")).toBeVisible();

    await page.goto(
      `${server.baseURL}/workspaces/${ids.workspaceAlpha}/research?question=history&page=1&pageSize=1`,
    );
    await expect(page.getByText("Page 1 - 3 reports")).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/question=history/u);
    await expect(page).toHaveURL(/page=2/u);
    await expect(page).toHaveURL(/pageSize=1/u);

    await page.goto(
      `${server.baseURL}/research/history?workspaceId=${ids.workspaceAlpha}&hasPendingMemoryProposal=true`,
    );
    await expect(page.getByRole("heading", { name: "Research history" })).toBeVisible();
    await expect(page.getByText("Alpha warning history report")).toBeVisible();
    await expect(page.getByText("Beta warning history report")).toHaveCount(0);
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

test("source feedback persists across page reloads without mutating source text", async ({
  page,
}) => {
  const ids = testIds("srcfb");
  const server = await startResearchFixtureServer({
    port: 3110,
    health: "healthy",
    prefix: "pap-e2e-research-src-fb-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    await page.getByLabel("Question").fill("Should source feedback persist across reloads?");
    await page.getByLabel("Source limit").fill("1");
    await page.getByLabel("Search results").fill("3");

    await Promise.all([
      page.waitForURL(/\/research\/research_report_/u),
      page.getByRole("button", { name: "Run research" }).click(),
    ]);

    const sourcesPanel = page.locator("section[aria-labelledby='research-sources-title']");
    await expect(sourcesPanel).toBeVisible();

    // New source feedback: form is visible directly; fill and save.
    await sourcesPanel.getByLabel("Source rating").selectOption("useful");
    await sourcesPanel.getByLabel("Source feedback notes").fill("Accurate source for research.");
    await sourcesPanel.getByRole("button", { name: /^Save$/ }).click();

    // After save, feedback switches to display mode showing rating, notes, and an Edit button.
    await expect(sourcesPanel.getByRole("button", { name: /^Edit$/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(sourcesPanel.getByText("Accurate source for research.")).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-research-report-detail="true"]')).toBeVisible();

    // After reload, persisted feedback should still be visible.
    await expect(sourcesPanel.getByRole("button", { name: /^Edit$/ })).toBeVisible();
    await expect(sourcesPanel.getByText("Accurate source for research.")).toBeVisible();

    // Edit existing feedback.
    await sourcesPanel.getByRole("button", { name: /^Edit$/ }).click();
    await sourcesPanel.getByLabel("Source rating").selectOption("poor");
    await sourcesPanel.getByLabel("Source feedback notes").fill("Revised after re-evaluation.");
    await sourcesPanel.getByRole("button", { name: /^Update$/ }).click();

    // After update, display mode shows the new rating.
    await expect(sourcesPanel.getByRole("button", { name: /^Edit$/ })).toBeVisible();
    await expect(sourcesPanel.getByText("Revised after re-evaluation.")).toBeVisible();

    // Remove feedback and verify source text is preserved.
    await sourcesPanel.getByRole("button", { name: /^Remove$/ }).click();
    await expect(sourcesPanel.getByLabel("Source rating")).toBeVisible();
    await expect(sourcesPanel.getByRole("button", { name: /^Edit$/ })).toHaveCount(0);

    await expect(
      sourcesPanel.getByText("Local AI engineering notes for deterministic agents"),
    ).toBeVisible();
  } finally {
    await stopFixtureServer(server.process);
  }
});

test("report feedback persists across page reloads without mutating findings", async ({ page }) => {
  const ids = testIds("rptfb");
  const server = await startResearchFixtureServer({
    port: 3111,
    health: "healthy",
    prefix: "pap-e2e-research-rpt-fb-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    await page.getByLabel("Question").fill("Should report feedback persist across reloads?");
    await page.getByLabel("Source limit").fill("1");
    await page.getByLabel("Search results").fill("3");

    await Promise.all([
      page.waitForURL(/\/research\/research_report_/u),
      page.getByRole("button", { name: "Run research" }).click(),
    ]);

    const feedbackPanel = page.locator("section[aria-labelledby='research-report-feedback-title']");
    await expect(feedbackPanel).toBeVisible();
    await expect(feedbackPanel.getByRole("button", { name: "Save feedback" })).toBeVisible();
    await expect(feedbackPanel.getByRole("button", { name: "Edit feedback" })).toHaveCount(0);

    await feedbackPanel.locator("#report-feedback-rating").selectOption("useful");
    await feedbackPanel.getByLabel("This report was useful").check();
    await feedbackPanel.locator("#report-feedback-notes").fill("Clear, sourced research findings.");
    await feedbackPanel.getByRole("button", { name: "Save feedback" }).click();

    await expect(feedbackPanel.getByText("useful").first()).toBeVisible();
    await expect(feedbackPanel.getByText("Clear, sourced research findings.")).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-research-report-detail="true"]')).toBeVisible();

    await expect(feedbackPanel.getByText("useful").first()).toBeVisible();

    await feedbackPanel.getByRole("button", { name: "Edit feedback" }).click();
    await feedbackPanel.locator("#report-feedback-rating").selectOption("neutral");
    await feedbackPanel.locator("#report-feedback-notes").fill("Re-evaluated report feedback.");
    await feedbackPanel.getByRole("button", { name: "Update feedback" }).click();

    await expect(feedbackPanel.getByText("neutral").first()).toBeVisible();

    await expect(page.getByRole("heading", { name: "Cited findings" })).toBeVisible();
    await expect(
      page.getByText("Personal Agent Platform uses deterministic search").first(),
    ).toBeVisible();
  } finally {
    await stopFixtureServer(server.process);
  }
});

test("memory proposal can be approved and rejected from the proposal list", async ({ page }) => {
  const ids = testIds("proposal");
  const server = await startResearchFixtureServer({
    port: 3112,
    health: "healthy",
    prefix: "pap-e2e-research-proposal-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    await page.getByLabel("Question").fill("Which research finding should become approved memory?");
    await page.getByLabel("Source limit").fill("1");
    await page.getByLabel("Search results").fill("3");
    await page.getByLabel("Propose citation-backed memory").check();

    await Promise.all([
      page.waitForURL(/\/research\/research_report_/u),
      page.getByRole("button", { name: "Run research" }).click(),
    ]);

    await expect(page.getByRole("heading", { name: "Memory proposal" })).toBeVisible();
    await expect(page.getByText("1 pending, 0 active, 0 rejected.")).toBeVisible();

    await page.getByRole("link", { name: "proposed" }).click();
    await expect(page.getByText("semantic / proposed")).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("semantic / active")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    await page.getByLabel("Question").fill("Another proposal to reject.");
    await page.getByLabel("Propose citation-backed memory").check();

    await Promise.all([
      page.waitForURL(/\/research\/research_report_/u),
      page.getByRole("button", { name: "Run research" }).click(),
    ]);

    await expect(page.getByRole("heading", { name: "Memory proposal" })).toBeVisible();
    await expect(page.getByText("1 pending, 0 active, 0 rejected.")).toBeVisible();

    await page.getByRole("link", { name: "proposed" }).click();
    await expect(page.getByText("semantic / proposed")).toBeVisible();

    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText("semantic / rejected")).toBeVisible();
  } finally {
    await stopFixtureServer(server.process);
  }
});

test("feedback and proposal records are isolated by workspace", async ({ page }) => {
  const ids = testIds("fbiso");
  const server = await startResearchFixtureServer({
    port: 3113,
    health: "healthy",
    prefix: "pap-e2e-research-fb-iso-",
  });

  try {
    await seedWorkspaces(ids, server.databaseUrl);

    await page.goto(`${server.baseURL}/research?workspaceId=${ids.workspaceAlpha}`);
    await expect(page.locator('[data-research-ready="true"]')).toBeVisible();
    await page.getByLabel("Question").fill("Alpha feedback workspace test.");
    await page.getByLabel("Source limit").fill("1");
    await page.getByLabel("Search results").fill("3");
    await page.getByLabel("Propose citation-backed memory").check();

    await Promise.all([
      page.waitForURL(/\/research\/research_report_/u),
      page.getByRole("button", { name: "Run research" }).click(),
    ]);

    const reportURL = page.url();
    const reportId = new URL(reportURL).pathname.split("/").pop() ?? "";

    const feedbackPanel = page.locator("section[aria-labelledby='research-report-feedback-title']");
    await feedbackPanel.locator("#report-feedback-rating").selectOption("useful");
    await feedbackPanel.getByRole("button", { name: "Save feedback" }).click();
    await expect(feedbackPanel.getByText("useful").first()).toBeVisible();

    await page.goto(
      `${server.baseURL}/research/${encodeURIComponent(reportId)}?workspaceId=${ids.workspaceBeta}`,
    );
    await expect(page.getByRole("heading", { name: "Report not found" })).toBeVisible();

    await page.goto(
      `${server.baseURL}/workspaces/${ids.workspaceBeta}/research?hasPendingMemoryProposal=true`,
    );
    await expect(page.getByText("No research reports match these filters.")).toBeVisible();

    await page.goto(`${server.baseURL}/memory/semantic?workspaceId=${ids.workspaceBeta}`);
    await expect(page.getByRole("heading", { name: /semantic/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject" })).toHaveCount(0);
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

async function seedResearchHistory(
  ids: ReturnType<typeof testIds>,
  databaseUrl: string,
): Promise<{ completed: string; pending: string; warning: string }> {
  const connection = createSqliteDatabase({ databaseUrl });
  const traceRepository = new SqliteExecutionTraceRepository(connection.db);
  const reportRepository = new SqliteResearchReportRepository(connection.db);
  const sourceRepository = new SqliteResearchSourceRepository(connection.db);
  const semanticMemoryRepository = new SqliteSemanticMemoryRepository(connection.db);
  const alphaWarningExecution = `exec_${ids.workspaceAlpha}_warning`;
  const alphaCompletedExecution = `exec_${ids.workspaceAlpha}_completed`;
  const alphaPendingExecution = `exec_${ids.workspaceAlpha}_pending`;
  const betaExecution = `exec_${ids.workspaceBeta}_warning`;
  const warningReportId = `research_report_${ids.workspaceAlpha}_warning`;
  const completedReportId = `research_report_${ids.workspaceAlpha}_completed`;
  const pendingReportId = `research_report_${ids.workspaceAlpha}_pending`;

  try {
    await traceRepository.create({
      id: alphaWarningExecution,
      capabilityId: "capability.research",
      workspaceId: ids.workspaceAlpha,
      startedAt: "2026-07-04T09:00:00.000Z",
    });
    await traceRepository.create({
      id: alphaCompletedExecution,
      capabilityId: "capability.research",
      workspaceId: ids.workspaceAlpha,
      startedAt: "2026-07-03T09:00:00.000Z",
    });
    await traceRepository.create({
      id: alphaPendingExecution,
      capabilityId: "capability.research",
      workspaceId: ids.workspaceAlpha,
      startedAt: "2026-07-05T09:00:00.000Z",
    });
    await traceRepository.create({
      id: betaExecution,
      capabilityId: "capability.research",
      workspaceId: ids.workspaceBeta,
      startedAt: "2026-07-04T09:00:00.000Z",
    });

    const warningReport = await reportRepository.create({
      id: warningReportId,
      executionId: alphaWarningExecution,
      workspaceId: ids.workspaceAlpha,
      question: "Alpha warning history report",
      summary: researchSummaryFixture("Alpha warning history summary."),
      warnings: [
        {
          code: "partial_source_failure",
          message: "One source could not be fetched.",
        },
      ],
      status: "completed_with_warnings",
      createdAt: "2026-07-04T09:01:00.000Z",
      completedAt: "2026-07-04T09:05:00.000Z",
    });
    const completedReport = await reportRepository.create({
      id: completedReportId,
      executionId: alphaCompletedExecution,
      workspaceId: ids.workspaceAlpha,
      question: "Alpha completed history report",
      summary: researchSummaryFixture("Alpha completed history summary."),
      status: "completed",
      createdAt: "2026-07-03T09:01:00.000Z",
      completedAt: "2026-07-03T09:05:00.000Z",
    });
    await reportRepository.create({
      id: pendingReportId,
      executionId: alphaPendingExecution,
      workspaceId: ids.workspaceAlpha,
      question: "Alpha pending history report",
      summary: researchSummaryFixture("Alpha pending history summary."),
      status: "running",
      createdAt: "2026-07-05T09:01:00.000Z",
    });
    await reportRepository.create({
      id: `research_report_${ids.workspaceBeta}_warning`,
      executionId: betaExecution,
      workspaceId: ids.workspaceBeta,
      question: "Beta warning history report",
      summary: researchSummaryFixture("Beta warning history summary."),
      warnings: [
        {
          code: "partial_source_failure",
          message: "Beta warning should stay isolated.",
        },
      ],
      status: "completed_with_warnings",
      createdAt: "2026-07-04T09:01:00.000Z",
      completedAt: "2026-07-04T09:06:00.000Z",
    });

    await sourceRepository.create({
      id: `research_source_${ids.workspaceAlpha}_warning_a`,
      reportId: warningReport.id,
      executionId: warningReport.executionId,
      workspaceId: warningReport.workspaceId,
      url: "https://example.com/history-warning-a",
      title: "History warning source A",
      selectionRank: 1,
      status: "fetch_failed",
    });
    await sourceRepository.create({
      id: `research_source_${ids.workspaceAlpha}_warning_b`,
      reportId: warningReport.id,
      executionId: warningReport.executionId,
      workspaceId: warningReport.workspaceId,
      url: "https://example.com/history-warning-b",
      title: "History warning source B",
      selectionRank: 2,
      status: "fetch_failed",
    });
    await sourceRepository.create({
      id: `research_source_${ids.workspaceAlpha}_completed`,
      reportId: completedReport.id,
      executionId: completedReport.executionId,
      workspaceId: completedReport.workspaceId,
      url: "https://example.com/history-completed",
      title: "History completed source",
      selectionRank: 1,
      status: "fetch_failed",
    });
    await semanticMemoryRepository.create({
      id: `memory_${ids.workspaceAlpha}_proposal`,
      scope: "workspace",
      workspaceId: ids.workspaceAlpha,
      subject: "research.history",
      predicate: "found",
      value: "Alpha warning history has a pending proposal.",
      status: "proposed",
      sourceType: "research_report",
      sourceExecutionId: warningReport.executionId,
      sourceCapabilityId: "capability.research",
    });

    return {
      completed: completedReportId,
      pending: pendingReportId,
      warning: warningReportId,
    };
  } finally {
    connection.close();
  }
}

function researchSummaryFixture(text: string) {
  return {
    text,
    keyPoints: ["Seeded browser history fixture."],
  };
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
