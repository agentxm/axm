import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testExecution } from "../../vitest.execution.js";
import { makeTestReporting } from "../../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...testExecution,
    ...makeTestReporting({ layer: "internal", suite: "registry-protocol" }),
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
  },
});
