import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { makeTestReporting, purposeSetupFile } from "@agentxm/test-reporting/reporting";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    ...makeTestReporting({ project: "cli-e2e", suite: "cli-e2e-tracing" }),
    include: ["src/local-tracing-seq.e2e.test.ts"],
    setupFiles: [purposeSetupFile],
    testTimeout: 120_000,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
