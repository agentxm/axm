import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    include: ["src/**/*.windows.e2e.test.ts"],
    testTimeout: 600_000,
    maxWorkers: 1,
    reporters: ["default", "junit"],
    outputFile: { junit: "../../test-results/cli-e2e-windows/junit.xml" },
  },
});
