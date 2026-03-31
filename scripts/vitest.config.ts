import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    include: ["**/*.test.ts"],
    testTimeout: 20000,
    reporters: ["default", "junit"],
    outputFile: { junit: "../test-results/scripts/junit.xml" },
  },
});
