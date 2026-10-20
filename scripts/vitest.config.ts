import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testExecution } from "@agentxm/test-reporting/execution";
import { makeTestReporting, purposeSetupFile } from "@agentxm/test-reporting/reporting";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...testExecution,
    ...makeTestReporting({ project: "axm", suite: "scripts" }),
    include: ["**/*.test.ts", "**/*.spec.ts"],
    setupFiles: [purposeSetupFile],
    testTimeout: 20000,
  },
});
