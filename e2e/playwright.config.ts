import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const dataDir = mkdtempSync(join(tmpdir(), "pap-e2e-"));

export default defineConfig({
  testDir: ".",
  outputDir: "../test-results/e2e",
  fullyParallel: false,
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
      PAP_DATABASE_URL: `file:${join(dataDir, "pap.db")}`,
      PAP_DATA_DIR: dataDir,
      PAP_LOG_LEVEL: "silent",
    },
  },
});
