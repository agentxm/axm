import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { makeTestReporting } from "../../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...makeTestReporting({ layer: "internal", suite: "core-windows" }),
    include: ["src/**/*.windows.test.ts"],
    testTimeout: 120_000,
    maxWorkers: 1,
  },
});
