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

/** The workspace root, which owns `test-results/` and the paths receipts name. */
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

const reporterFile = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

/**
 * Labels every test file by purpose (specification, e2e, test) and joins
 * specification metadata onto native results. Every owner project's Vitest
 * configuration lists it in `setupFiles`.
 */
export const purposeSetupFile = reporterFile("purpose-setup.ts");

/**
 * Ends a failing run with what failed rather than with a report path, so a
 * suite that writes no receipts can still close on its failures.
 */
export const failureSummaryReporter: [string, { readonly repoRoot: string }] = [
  reporterFile("failure-summary-reporter.ts"),
  { repoRoot: workspaceRoot },
];

export const makeTestReporting = ({
  project,
  suite = project,
  runtimeMode = "built",
}: TestReportingOptions): Pick<InlineConfig, "outputFile" | "reporters"> => {
  const outputDirectory = `${workspaceRoot}test-results/${suite}/`;

  return {
    reporters: [
      "default",
      "junit",
      [
        reporterFile("specification-evidence-reporter.ts"),
        {
          repoRoot: workspaceRoot,
          outputDirectory,
          project,
          suite,
          runtimeMode,
        },
      ],
      [
        reporterFile("allure-reporter.ts"),
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
      // Last, so a failing run ends with what failed rather than with a report path.
      failureSummaryReporter,
    ],
    outputFile: { junit: `${outputDirectory}junit.xml` },
  };
};
