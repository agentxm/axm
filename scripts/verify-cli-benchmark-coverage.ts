import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import { scenarioCoverageProblems } from "../benchmarks/cli-operations/coverage.js";
import { buildBenchmarkScenarios } from "../benchmarks/cli-operations/index.js";
import {
  benchmarkOperations,
  parseCommandSnapshot,
} from "../benchmarks/cli-operations/inventory.js";

class BenchmarkCoverageError extends Data.TaggedError("BenchmarkCoverageError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

await Effect.runPromise(
  Effect.tryPromise({
    try: async () => {
      const repoRoot = path.resolve(import.meta.dirname, "..");
      const snapshot = parseCommandSnapshot(
        JSON.parse(
          await fs.readFile(
            path.join(repoRoot, "test-results/benchmarks/cli-operations/command-inventory.json"),
            "utf8",
          ),
        ),
      );
      const operations = benchmarkOperations(snapshot);
      const scenarios = buildBenchmarkScenarios(operations);
      const problems = scenarioCoverageProblems(operations, scenarios);
      if (problems.length > 0)
        throw new Error(`CLI benchmark declarations are incomplete:\n${problems.join("\n")}`);
      console.log(
        `CLI benchmark declarations cover ${operations.length} routes, ${operations.reduce((count, operation) => count + operation.modes.length, 0)} modes and ${scenarios.length} scenarios. Executed measurements are a separate requirement.`,
      );
    },
    catch: (cause) =>
      new BenchmarkCoverageError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  }),
);
