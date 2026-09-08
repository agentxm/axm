import { defineConfig } from "vitest/config";
import { testExecution } from "../../vitest.execution.js";
import { makeTestReporting } from "../../vitest.reporting.js";

export default defineConfig({
  test: {
    ...testExecution,
    ...makeTestReporting({ layer: "tooling", suite: "test-support" }),
    include: ["src/**/*.internal.test.ts"],
  },
});
