import * as os from "node:os";
import { fileURLToPath } from "node:url";
import type { InlineConfig } from "vitest/node";

type TestLayer = "e2e" | "specification" | "unit";

type TestReportingOptions = {
  readonly layer: TestLayer;
  readonly suite: string;
};

export const makeTestReporting = ({
  layer,
  suite,
}: TestReportingOptions): Pick<InlineConfig, "outputFile" | "reporters"> => {
  const outputDirectory = fileURLToPath(new URL(`test-results/${suite}/`, import.meta.url));

  return {
    reporters: [
      "default",
      "junit",
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
            layer,
            project: suite,
            repository: "axm",
          },
          resultsDir: `${outputDirectory}allure-results`,
        },
      ],
    ],
    outputFile: { junit: `${outputDirectory}junit.xml` },
  };
};
