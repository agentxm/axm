import { fileURLToPath } from "node:url";
import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";
import { testExecution } from "../../vitest.execution.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

/**
 * The terminal's own tests — the screen, its prompts, the design gallery, and
 * renderer conformance — run from source for the edit loop of terminal work.
 * It resolves workspace packages from their sources, so it waits on no build,
 * and it neither labels tests by purpose nor writes receipts: the `test`
 * target stays the evidence for these files, under its own inputs and outputs.
 */
export default defineConfig({
  root: projectRoot,
  ssr: { resolve: { conditions: ["axm-source", ...defaultServerConditions] } },
  test: {
    ...testExecution,
    include: [
      "src/screen/**/*.test.ts",
      "src/screen/**/*.spec.ts",
      "src/test-support/**/*.test.ts",
    ],
    reporters: [
      "default",
      [
        fileURLToPath(new URL("../../scripts/failure-summary-reporter.ts", import.meta.url)),
        { repoRoot: fileURLToPath(new URL("../../", import.meta.url)) },
      ],
    ],
  },
});
