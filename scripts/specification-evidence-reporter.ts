/** Vitest host adapter: capture execution inputs before running and outcomes after. */
import * as fs from "node:fs";
import * as path from "node:path";
import type { Reporter, TestCase, TestModule, TestSpecification } from "vitest/node";

import {
  captureEvidenceInputs,
  digestContent,
  sameEvidenceInputs,
  type EvidenceInputs,
  type EvidenceRun,
  type ReceiptPurpose,
} from "./specification-evidence.js";
import { isTestPurpose } from "./test-purpose.js";
import { readCachedWorkspace, runtimeOutputs } from "./workspace-discovery.js";

interface Options {
  readonly repoRoot: string;
  readonly outputDirectory: string;
  /** Nx project whose test target runs this configuration. */
  readonly project: string;
  /** Results directory and receipt name; distinct per target of one project. */
  readonly suite: string;
  readonly runtimeMode: EvidenceInputs["runtimeMode"];
}

/**
 * The purpose the shared purpose setup attached to every test in the file.
 * Absent or disagreeing labels leave the file unlabelled, so a specification
 * that ran without its labelling never reads as specification evidence.
 */
const filePurpose = (tests: readonly TestCase[]): ReceiptPurpose => {
  const purposes = new Set(
    tests.map((test) => {
      const value: unknown = Reflect.get(test.meta(), "purpose");
      return isTestPurpose(value) ? value : "unlabelled";
    }),
  );
  const [purpose] = purposes;
  return purposes.size === 1 && purpose !== undefined ? purpose : "unlabelled";
};

export default class SpecificationEvidenceReporter implements Reporter {
  private inputs: EvidenceInputs | undefined;
  private outputs: readonly string[] = [];
  private startedAt = "";
  private selected = new Map<string, { readonly digest: string; readonly filtered: boolean }>();

  constructor(private readonly options: Options) {}

  async onTestRunStart(specifications: readonly TestSpecification[]): Promise<void> {
    this.startedAt = new Date().toISOString();
    this.outputs = await this.resolveRuntimeOutputs();
    this.inputs = captureEvidenceInputs(this.options.repoRoot, {
      runtimeMode: this.options.runtimeMode,
      runtimeOutputs: this.outputs,
    });
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
    const inputsAfter = captureEvidenceInputs(this.options.repoRoot, {
      runtimeMode: this.options.runtimeMode,
      runtimeOutputs: this.outputs,
    });
    const relative = (file: string): string =>
      path.relative(this.options.repoRoot, file).split(path.sep).join("/");
    const run: EvidenceRun = {
      format: 2,
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
          owner: this.options.project,
          purpose: filePurpose(tests),
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

  /**
   * Built runtime inputs come from the project graph's resolved outputs. The
   * cached graph is current inside `nx run`; without one the receipt records
   * no runtime outputs, which the verdict then cannot match as fresh.
   */
  private async resolveRuntimeOutputs(): Promise<readonly string[]> {
    if (this.options.runtimeMode === "source") return [];
    try {
      return runtimeOutputs(await readCachedWorkspace());
    } catch (error) {
      console.error(
        `Execution evidence could not resolve runtime outputs from the cached project graph: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }
}
