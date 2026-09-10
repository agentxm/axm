import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { makeTestReporting, purposeSetupFile } from "../../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...makeTestReporting({ project: "cli-e2e", suite: "cli-e2e-windows" }),
    include: ["src/**/*.windows.e2e.test.ts"],
    setupFiles: [purposeSetupFile],
    testTimeout: 600_000,
    maxWorkers: 1,
  },
});
