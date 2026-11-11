import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { makeTestReporting, purposeSetupFile } from "@agentxm/test-reporting/reporting";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    ...makeTestReporting({ project: "cli-e2e", suite: "cli-e2e-performance" }),
    include: ["src/ordinary-inventory-latency.spec.ts"],
    setupFiles: [purposeSetupFile],
    maxWorkers: 1,
    testTimeout: 600_000,
  },
});
