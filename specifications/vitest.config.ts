import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { testExecution } from "../vitest.execution.js";
import { makeTestReporting, purposeSetupFile } from "../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...testExecution,
    ...makeTestReporting({ project: "specifications" }),
    include: [
      "cli/**/*.spec.ts",
      "extension-identity/**/*.spec.ts",
      "package-identity/**/*.spec.ts",
      "settings-contract/**/*.spec.ts",
      "source-resolution/**/*.spec.ts",
      "system/**/*.spec.ts",
    ],
    exclude: [...configDefaults.exclude],
    setupFiles: [purposeSetupFile],
  },
});
