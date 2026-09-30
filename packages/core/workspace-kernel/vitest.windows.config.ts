import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { makeTestReporting, purposeSetupFile } from "../../../vitest.reporting.js";

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
      "src/settlement/authorities-refuse-overlapping-physical-boundaries.spec.ts",
    ],
    setupFiles: [purposeSetupFile],
    testTimeout: 120_000,
    maxWorkers: 1,
  },
});
