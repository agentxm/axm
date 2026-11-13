import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { globSync } from "node:fs";
import * as path from "node:path";
import { defineConfig } from "vitest/config";
import { makeTestReporting, purposeSetupFile } from "@agentxm/test-reporting/reporting";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const reporting = makeTestReporting({ project: "cli-e2e" });
const wireOutput = fileURLToPath(
  new URL("../../test-results/cli-e2e/wire-coverage.json", import.meta.url),
);
const wireDirectory = fileURLToPath(
  new URL(`../../test-results/cli-e2e/wire/${randomUUID()}/`, import.meta.url),
);
const include = ["src/**/*.e2e.test.ts", "src/**/*.spec.ts"];
const exclude = [
  "src/ordinary-inventory-latency.spec.ts",
  "src/binary-smoke.e2e.test.ts",
  "src/binary-local-tracing.e2e.test.ts",
  "src/local-tracing-seq.e2e.test.ts",
  "src/install-verification.e2e.test.ts",
  "src/**/*.windows.e2e.test.ts",
];

export default defineConfig({
  root: projectRoot,
  test: {
    ...reporting,
    reporters: [
      ...(reporting.reporters ?? []),
      [
        fileURLToPath(new URL("src/test-support/wire-coverage-reporter.ts", import.meta.url)),
        {
          directory: wireDirectory,
          output: wireOutput,
          requireComplete: process.env["AXM_WIRE_REQUIRE_COMPLETE"],
          suiteFiles: [...globSync(include, { cwd: projectRoot, exclude })].map((file) =>
            path.resolve(projectRoot, file),
          ),
        },
      ],
    ],
    env: { AXM_WIRE_COVERAGE_DIRECTORY: wireDirectory },
    include,
    setupFiles: [purposeSetupFile],
    exclude,
    // These e2e cases each spawn many real CLI processes (publish, init,
    // install, uninstall, update) and can exceed two minutes when the full
    // workspace graph competes for resources. Keep the test budget aligned
    // with the subprocess budget; individual fast tests still finish quickly.
    testTimeout: 600_000,
    // Each worker launches many real CLI subprocesses. Letting Vitest use every
    // host core can exhaust process capacity and strand otherwise fast commands.
    maxWorkers: 4,
  },
});
