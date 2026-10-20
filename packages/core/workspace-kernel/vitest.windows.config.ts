import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { makeTestReporting, purposeSetupFile } from "@agentxm/test-reporting/reporting";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...makeTestReporting({
      project: "workspace-kernel",
      suite: "workspace-windows",
    }),
    include: [
      "src/**/*.windows.test.ts",
      "src/locations/**/*.test.ts",
      "src/locations/**/*.spec.ts",
      "src/settlement/authorities-refuse-overlapping-physical-boundaries.spec.ts",
    ],
    setupFiles: [purposeSetupFile],
    testTimeout: 120_000,
    maxWorkers: 1,
  },
});
