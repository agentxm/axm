import * as fs from "node:fs";
import AllureVitestReporter, { type AllureVitestReporterConfig } from "allure-vitest/reporter";
import type { Vitest } from "vitest/node";

type Options = AllureVitestReporterConfig & { readonly resultsDir: string };

/** Allure appends results by default; an Nx output must describe one invocation. */
export default class AllureReporter extends AllureVitestReporter {
  constructor(private readonly options: Options) {
    super(options);
  }

  override onInit(vitest: Vitest): void {
    // Initialize at execution, never while Nx is loading Vitest configuration.
    fs.rmSync(this.options.resultsDir, { recursive: true, force: true });
    super.onInit(vitest);
  }
}
