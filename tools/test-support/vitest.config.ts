import { defineConfig } from "vitest/config";
import { testExecution } from "../../vitest.execution.js";
import { makeTestReporting, purposeSetupFile } from "../../vitest.reporting.js";

export default defineConfig({
  test: {
    ...testExecution,
    ...makeTestReporting({ project: "test-support" }),
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    setupFiles: [purposeSetupFile],
  },
});
