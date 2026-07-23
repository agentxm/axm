import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    include: ["src/**/*.e2e.test.ts"],
    exclude: ["src/binary-smoke.e2e.test.ts", "src/install-verification.e2e.test.ts"],
    testTimeout: 60000,
    reporters: ["default", "junit"],
    outputFile: { junit: "../../test-results/cli-e2e/junit.xml" },
  },
});
