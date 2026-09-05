import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { makeTestReporting } from "../../vitest.reporting.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: projectRoot,
  test: {
    ...makeTestReporting({ layer: "e2e", suite: "cli-e2e-install" }),
    include: ["src/install-verification.e2e.test.ts"],
    testTimeout: 180000,
  },
});
