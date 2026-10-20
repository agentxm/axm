import { defineConfig } from "vitest/config";
import { testExecution } from "@agentxm/test-reporting/execution";
import { makeTestReporting, purposeSetupFile } from "@agentxm/test-reporting/reporting";

export default defineConfig({
  test: {
    ...testExecution,
    ...makeTestReporting({ project: "test-support" }),
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    setupFiles: [purposeSetupFile],
  },
});
