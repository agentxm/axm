/**
 * Vitest reporter: one plain block at the very end of a run naming each failed
 * test, the first line of why, and where — so a failing run answers "what
 * failed" from its last lines, without colour codes or a search through the
 * default reporter's diffs above it. A passing run prints nothing.
 */
import * as path from "node:path";
import type { Reporter, TestModule } from "vitest/node";

interface Options {
  readonly repoRoot: string;
}

/** One failed test as the summary names it. */
export interface TestFailure {
  /** The test file, relative to the repository root. */
  readonly file: string;
  /** The test's name with the suites it sits in. */
  readonly name: string;
  /** Why it failed, as the first failure reports it. */
  readonly message: string;
  /** The line of the test file the failure points at, where one is known. */
  readonly line?: number;
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu");

/** The first line of a failure message, without colour codes, cut to one terminal line. */
const firstLine = (message: string, width: number): string => {
  const line = (message.replace(ANSI, "").split("\n")[0] ?? "").trim();
  return line.length > width ? `${line.slice(0, width - 1)}…` : line;
};

/** The longest reason a summary line carries before it is cut. */
const REASON_WIDTH = 200;

/**
 * The summary's lines: a count, then each file with its failed tests beneath
 * it and the reason beneath each test. No failures, no lines.
 */
export const failureSummary = (failures: ReadonlyArray<TestFailure>): ReadonlyArray<string> => {
  if (failures.length === 0) return [];
  const files = [...new Set(failures.map((failure) => failure.file))];
  return [
    "",
    `FAILED TESTS: ${String(failures.length)} in ${String(files.length)} ${files.length === 1 ? "file" : "files"}`,
    ...files.flatMap((file) => [
      "",
      file,
      ...failures
        .filter((failure) => failure.file === file)
        .flatMap((failure) => [
          `  x ${failure.name}${failure.line === undefined ? "" : ` (line ${String(failure.line)})`}`,
          `      ${firstLine(failure.message, REASON_WIDTH)}`,
        ]),
    ]),
    "",
  ];
};

/** Every failed test of the run, and each file that failed before any test ran. */
export const failuresOf = (
  modules: ReadonlyArray<TestModule>,
  repoRoot: string,
): ReadonlyArray<TestFailure> =>
  modules.flatMap((module) => {
    const file = path.relative(repoRoot, module.moduleId);
    const tests = [...module.children.allTests("failed")].map((test): TestFailure => {
      const [error] = test.result().errors ?? [];
      const line = error?.stacks?.find((frame) => frame.file === module.moduleId)?.line;
      return {
        file,
        name: test.fullName,
        message: error?.message ?? "failed without a message",
        ...(line === undefined ? {} : { line }),
      };
    });
    // A file that throws while it is collected fails without a failed test.
    const [collection] = module.errors();
    return tests.length === 0 && collection !== undefined
      ? [{ file, name: "(file failed before its tests ran)", message: collection.message }]
      : tests;
  });

export default class FailureSummaryReporter implements Reporter {
  constructor(private readonly options: Options) {}

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const lines = failureSummary(failuresOf(modules, this.options.repoRoot));
    if (lines.length > 0) process.stdout.write(`${lines.join("\n")}\n`);
  }
}
