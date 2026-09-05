import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { makeTestReporting } from "../../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...makeTestReporting({ layer: "e2e", suite: "cli-e2e-windows" }),
    include: ["src/**/*.windows.e2e.test.ts"],
    testTimeout: 600_000,
    maxWorkers: 1,
  },
});
