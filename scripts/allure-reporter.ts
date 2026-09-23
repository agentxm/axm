import * as fs from "node:fs";
import AllureVitestReporter, { type AllureVitestReporterConfig } from "allure-vitest/reporter";
import type { TestModule, Vitest } from "vitest/node";

type Options = AllureVitestReporterConfig & { readonly resultsDir: string };

/** Allure appends results by default; an Nx output must describe one invocation. */
export default class AllureReporter extends AllureVitestReporter {
  private readonly written = new Set<string>();

  constructor(private readonly options: Options) {
    super(options);
  }

  override onInit(vitest: Vitest): void {
    // Initialize at execution, never while Nx is loading Vitest configuration.
    fs.rmSync(this.options.resultsDir, { recursive: true, force: true });
    super.onInit(vitest);
  }

  onTestRunStart(): void {
    this.written.clear();
  }

  /**
   * Allure writes and fsyncs every result synchronously. Deferred to run end,
   * a large suite blocks Vitest's main thread long enough that worker
   * teardown timers report `Timeout terminating forks worker` for workers
   * that already exited, so each module is written as it finishes instead.
   */
  onTestModuleEnd(module: TestModule): void {
    this.written.add(module.id);
    super.onTestRunEnd([module]);
  }

  override onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    super.onTestRunEnd(modules.filter((module) => !this.written.has(module.id)));
  }
}
