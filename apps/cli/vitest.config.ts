import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testExecution } from "../../vitest.execution.js";
import { makeTestReporting, purposeSetupFile } from "../../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...testExecution,
    ...makeTestReporting({ project: "cli" }),
    include: ["src/**/*.test.ts", "src/**/*.spec.ts", "scripts/**/*.test.ts"],
    setupFiles: [purposeSetupFile],
  },
});
