import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testExecution } from "./src/execution.js";
import { makeTestReporting, purposeSetupFile } from "./src/reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...testExecution,
    ...makeTestReporting({ project: "test-reporting" }),
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    setupFiles: [purposeSetupFile],
  },
});
