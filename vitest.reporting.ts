import * as os from "node:os";
import { fileURLToPath } from "node:url";
import type { InlineConfig } from "vitest/node";

type TestReportingOptions = {
  /** Nx project whose test target runs this configuration. */
  readonly project: string;
  /**
   * Results directory under `test-results/`; defaults to the project name so
   * `targetDefaults.test.outputs` matches. A project with more than one test
   * target names each suite distinctly.
   */
  readonly suite?: string;
  readonly runtimeMode?: "source" | "built";
};

/**
 * Labels every test file by purpose (specification, e2e, test) and joins
 * specification metadata onto native results. Every owner project's Vitest
 * configuration lists it in `setupFiles`.
 */
export const purposeSetupFile = fileURLToPath(new URL("vitest.purpose.setup.ts", import.meta.url));

export const makeTestReporting = ({
  project,
  suite = project,
  runtimeMode = "built",
}: TestReportingOptions): Pick<InlineConfig, "outputFile" | "reporters"> => {
  const outputDirectory = fileURLToPath(new URL(`test-results/${suite}/`, import.meta.url));

  return {
    reporters: [
      "default",
      "junit",
      [
        fileURLToPath(new URL("scripts/specification-evidence-reporter.ts", import.meta.url)),
        {
          repoRoot: fileURLToPath(new URL(".", import.meta.url)),
          outputDirectory,
          project,
          suite,
          runtimeMode,
        },
      ],
      [
        "allure-vitest/reporter",
        {
          environmentInfo: {
            node_version: process.version,
            os_architecture: os.arch(),
            os_platform: os.platform(),
            os_release: os.release(),
          },
          globalLabels: {
            project,
            repository: "axm",
          },
          resultsDir: `${outputDirectory}allure-results`,
        },
      ],
    ],
    outputFile: { junit: `${outputDirectory}junit.xml` },
  };
};
