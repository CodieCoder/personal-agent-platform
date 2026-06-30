import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      defineProject({
        test: {
          name: "unit",
          environment: "node",
          include: [
            "packages/contracts/test/**/*.test.mjs",
            "packages/shared/test/**/*.test.mjs",
            "packages/storage/test/**/*.test.mjs",
            "packages/testing/test/**/*.test.mjs",
            "packages/capabilities/echo/test/**/*.test.mjs",
          ],
        },
      }),
      defineProject({
        test: {
          name: "integration",
          environment: "node",
          include: [
            "packages/runtime/test/**/*.test.mjs",
            "packages/storage-sqlite/test/**/*.test.mjs",
          ],
          testTimeout: 10_000,
        },
      }),
    ],
  },
});
