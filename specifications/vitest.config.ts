import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { makeTestReporting } from "../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...makeTestReporting({ layer: "specification", suite: "specifications" }),
    include: ["cli/**/*.spec.ts", "client-core/**/*.spec.ts", "system/**/*.spec.ts"],
    exclude: [...configDefaults.exclude],
    setupFiles: ["./support/reporting.setup.ts"],
  },
});
