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
            "packages/ai/test/**/*.test.mjs",
            "packages/ai-ollama/test/**/*.test.mjs",
            "packages/tools-search/test/**/*.test.mjs",
            "packages/tools-search-searxng/test/**/*.test.mjs",
            "packages/tools-web/test/**/*.test.mjs",
            "packages/tools-web-readability/test/**/*.test.mjs",
            "packages/research/test/**/*.test.mjs",
            "packages/source-profiles/test/**/*.test.mjs",
            "packages/shared/test/**/*.test.mjs",
            "packages/storage/test/**/*.test.mjs",
            "packages/testing/test/**/*.test.mjs",
            "packages/capabilities/echo/test/**/*.test.mjs",
            "packages/capabilities/local-model-test/test/**/*.test.mjs",
            "packages/capabilities/research/test/**/*.test.mjs",
            "packages/capabilities/search-extract-test/test/**/*.test.mjs",
          ],
        },
      }),
      defineProject({
        test: {
          name: "integration",
          environment: "node",
          include: [
            "packages/runtime/test/**/*.test.mjs",
            "packages/memory/test/**/*.test.mjs",
            "packages/storage-sqlite/test/**/*.test.mjs",
            "apps/web/test/**/*.test.mjs",
          ],
          testTimeout: 10_000,
        },
      }),
    ],
  },
});
