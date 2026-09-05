/** Vitest host adapter: capture execution inputs before running and outcomes after. */
import * as fs from "node:fs";
import * as path from "node:path";
import type { Reporter, TestModule, TestSpecification } from "vitest/node";

import {
  captureEvidenceInputs,
  digestContent,
  sameEvidenceInputs,
  type EvidenceInputs,
  type EvidenceRun,
} from "./specification-evidence.js";

interface Options {
  readonly repoRoot: string;
  readonly outputDirectory: string;
  readonly suite: string;
}

export default class SpecificationEvidenceReporter implements Reporter {
  private inputs: EvidenceInputs | undefined;
  private startedAt = "";
  private selected = new Map<string, { readonly digest: string; readonly filtered: boolean }>();

  constructor(private readonly options: Options) {}

  onTestRunStart(specifications: readonly TestSpecification[]): void {
    this.startedAt = new Date().toISOString();
    this.inputs = captureEvidenceInputs(this.options.repoRoot);
    this.selected = new Map(
      specifications.map((specification) => [
        specification.moduleId,
        {
          digest: digestContent(fs.readFileSync(specification.moduleId)),
          filtered:
            specification.testNamePattern !== undefined ||
            (specification.testLines?.length ?? 0) > 0 ||
            (specification.testIds?.length ?? 0) > 0 ||
            (specification.testTagsFilter?.length ?? 0) > 0,
        },
      ]),
    );
    // An interrupted replacement run cannot leave yesterday's receipt looking current.
    fs.mkdirSync(this.options.outputDirectory, { recursive: true });
    fs.rmSync(path.join(this.options.outputDirectory, "evidence.json"), { force: true });
  }

  onTestRunEnd(
    modules: readonly TestModule[],
    errors: readonly unknown[],
    reason: "passed" | "failed" | "interrupted",
  ): void {
    if (this.inputs === undefined) return;
    const inputsAfter = captureEvidenceInputs(this.options.repoRoot);
    const relative = (file: string): string =>
      path.relative(this.options.repoRoot, file).split(path.sep).join("/");
    const run: EvidenceRun = {
      format: 1,
      suite: this.options.suite,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      inputs: this.inputs,
      inputsStable: sameEvidenceInputs(this.inputs, inputsAfter),
      environment: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
      selection: [...this.selected.keys()].map(relative).sort(),
      complete: reason !== "interrupted",
      unhandledErrors: errors.length,
      files: modules.map((module) => {
        const tests = [...module.children.allTests()];
        const count = (state: "passed" | "failed" | "skipped" | "pending"): number =>
          tests.filter((test) => test.result().state === state).length;
        const selected = this.selected.get(module.moduleId);
        return {
          source: relative(module.moduleId),
          contentDigest: selected?.digest ?? "uncollected",
          tests: tests.length,
          passed: count("passed"),
          failed: count("failed"),
          skipped: count("skipped"),
          pending: count("pending"),
          moduleFailed: module.state() === "failed",
          filtered: selected?.filtered ?? true,
        };
      }),
    };
    const destination = path.join(this.options.outputDirectory, "evidence.json");
    fs.writeFileSync(`${destination}.tmp`, `${JSON.stringify(run, null, 2)}\n`);
    fs.renameSync(`${destination}.tmp`, destination);
  }
}
