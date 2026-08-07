import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    include: ["src/**/*.e2e.test.ts"],
    exclude: ["src/binary-smoke.e2e.test.ts", "src/install-verification.e2e.test.ts"],
    // These e2e cases each spawn many real CLI processes (publish, init,
    // install, uninstall, update) and can exceed two minutes when the full
    // workspace graph competes for resources. Keep the test budget aligned
    // with the subprocess budget; individual fast tests still finish quickly.
    testTimeout: 600_000,
    // Each worker launches many real CLI subprocesses. Letting Vitest use every
    // host core can exhaust process capacity and strand otherwise fast commands.
    maxWorkers: 4,
    reporters: ["default", "junit"],
    outputFile: { junit: "../../test-results/cli-e2e/junit.xml" },
  },
});
