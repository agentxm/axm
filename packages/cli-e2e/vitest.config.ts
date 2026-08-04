import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    include: ["src/**/*.e2e.test.ts"],
    exclude: ["src/binary-smoke.e2e.test.ts", "src/install-verification.e2e.test.ts"],
    // These e2e cases each spawn many real CLI processes (publish, init,
    // install, uninstall, update). The heaviest run ~25s in CI, so the old 30s
    // ceiling left no headroom and flaked under load on slower runners. Give a
    // generous global ceiling; individual fast tests still finish in seconds.
    testTimeout: 120000,
    reporters: ["default", "junit"],
    outputFile: { junit: "../../test-results/cli-e2e/junit.xml" },
  },
});
