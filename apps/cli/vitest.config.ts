import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testExecution } from "@agentxm/test-reporting/execution";
import { makeTestReporting, purposeSetupFile } from "@agentxm/test-reporting/reporting";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...testExecution,
    // Command journeys perform multiple real filesystem reconciliation passes.
    // A single worker can exceed 20s; keep the shared slow-test reporting while
    // allowing the same budget as the multi-pass regeneration specification.
    testTimeout: 40_000,
    ...makeTestReporting({ project: "cli" }),
    include: ["src/**/*.test.ts", "src/**/*.spec.ts", "scripts/**/*.test.ts"],
    setupFiles: [purposeSetupFile],
  },
});
