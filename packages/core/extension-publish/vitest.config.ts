import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { testExecution } from "../../../vitest.execution.js";
import { makeTestReporting, purposeSetupFile } from "../../../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...testExecution,
    ...makeTestReporting({ project: "extension-publish" }),
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    setupFiles: [purposeSetupFile],
    exclude: [...configDefaults.exclude, "src/**/*.type-test.ts"],
  },
});
