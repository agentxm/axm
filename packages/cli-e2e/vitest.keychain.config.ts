import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { makeTestReporting } from "../../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

// Explicit platform evidence: writes only disposable native keychain entries.
// It is uncached and excluded from the ordinary e2e lifecycle.
export default defineConfig({
  root: projectRoot,
  test: {
    ...makeTestReporting({ layer: "e2e", suite: "cli-e2e-keychain" }),
    include: ["src/**/*.keychain.e2e.test.ts"],
    testTimeout: 600_000,
    maxWorkers: 1,
  },
});
