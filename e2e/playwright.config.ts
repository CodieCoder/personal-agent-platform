import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { runMigrations } from "../packages/storage-sqlite/src/index.js";

const port = 3100;
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? `http://127.0.0.1:${port}`;
const dataDir = mkdtempSync(join(tmpdir(), "pap-e2e-"));
const generatedDatabaseUrl = `file:${join(dataDir, "pap.db")}`;
const configuredDatabaseUrl = process.env.PAP_E2E_DATABASE_URL;
const testDatabaseUrl = externalBaseURL
  ? configuredDatabaseUrl
  : (configuredDatabaseUrl ?? generatedDatabaseUrl);

if (testDatabaseUrl) {
  process.env.PAP_E2E_DATABASE_URL = testDatabaseUrl;
  runMigrations({ databaseUrl: testDatabaseUrl });
}

export default defineConfig({
  testDir: ".",
  outputDir: "../test-results/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(externalBaseURL
    ? {}
    : {
        webServer: {
          command: "pnpm dev:web",
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            NODE_ENV: "test",
            PAP_ENVIRONMENT: "test",
            PAP_BIND_HOST: "127.0.0.1",
            PAP_PORT: String(port),
            PAP_DATABASE_URL: generatedDatabaseUrl,
            PAP_E2E_DATABASE_URL: generatedDatabaseUrl,
            PAP_DATA_DIR: dataDir,
            PAP_LOG_LEVEL: "silent",
            OLLAMA_ENABLED: "false",
          },
        },
      }),
});
