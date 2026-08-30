import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { makeTestReporting } from "../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...makeTestReporting({ layer: "specification", suite: "specifications" }),
    include: [
      "cli/**/*.spec.ts",
      "extension-identity/**/*.spec.ts",
      "package-identity/**/*.spec.ts",
      "settings-contract/**/*.spec.ts",
      "source-resolution/**/*.spec.ts",
      "version-constraints/**/*.spec.ts",
      "system/**/*.spec.ts",
    ],
    exclude: [...configDefaults.exclude],
    setupFiles: ["./support/reporting.setup.ts"],
  },
});
