import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as Data from "effect/Data";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { authScenarios } from "./auth-scenarios.js";
import { scenarioEvidencePaths } from "./artifacts.js";
import { applicationStateScenarios } from "./application-state-scenarios.js";
import {
  benchmarkCoverageProblems,
  receiptIdentityProblems,
  scenarioCoverageProblems,
} from "./coverage.js";
import { distributionScenarios } from "./distribution-scenarios.js";
import { writeJson, type BenchmarkScenario } from "./fixtures.js";
import {
  benchmarkOperations,
  compareCommandInventories,
  parseCommandSnapshot,
} from "./inventory.js";
import { maintenanceScenarios } from "./maintenance-scenarios.js";
import {
  BenchmarkReceiptSchema,
  CommandSnapshotSchema,
  type BenchmarkOperation,
  type BenchmarkReceipt,
  type BenchmarkSample,
} from "./model.js";
import {
  benchmarkProtocol,
  compareCounters,
  compareDistributions,
  compareSampleResources,
  measuredDistribution,
  summarizeSamples,
} from "./protocol.js";
import { binaryIdentity, runScenarioSample } from "./runner.js";
import {
  localScenarios,
  repetitionScenarios,
  scalingScenarios,
  userScopeScenarios,
  userMutationScenarios,
} from "./scenarios.js";
import { buildStaticScenarios } from "./static-scenarios.js";
import { transitionScenarios } from "./transition-scenarios.js";
import { diagnoseScenario } from "./diagnostics.js";
import { remoteInspectionScenarios } from "./remote-inspection-scenarios.js";
import { sourceScenarios } from "./source-scenarios.js";
import { pathSourceScenarios } from "./path-source-scenarios.js";
import { scriptUpgradeScenarios } from "./script-upgrade-scenarios.js";

class OperationBenchmarkError extends Data.TaggedError("OperationBenchmarkError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const buildBenchmarkScenarios = (
  operations: ReadonlyArray<BenchmarkOperation>,
): ReadonlyArray<BenchmarkScenario> => [
  ...buildStaticScenarios(operations),
  ...localScenarios(operations),
  ...scalingScenarios(operations),
  ...repetitionScenarios(operations),
  ...userScopeScenarios(operations),
  ...userMutationScenarios(operations),
  ...pathSourceScenarios(operations),
  ...distributionScenarios(operations),
  ...remoteInspectionScenarios(),
  ...authScenarios(),
  ...maintenanceScenarios(),
  ...scriptUpgradeScenarios(),
  ...transitionScenarios(),
  ...applicationStateScenarios(),
  ...sourceScenarios(),
];

const DiagnosticSchema = Schema.Struct({
  scenarioId: Schema.String,
  evidence: Schema.Union([
    Schema.Struct({
      status: Schema.Literal("observed"),
      boundary: Schema.String,
      scenarioId: Schema.String,
      tracePath: Schema.String,
      syscalls: Schema.Record(
        Schema.String,
        Schema.Struct({ calls: Schema.Number, errors: Schema.Number }),
      ),
      metrics: Schema.Record(Schema.String, Schema.Number),
      limitation: Schema.String,
    }),
    Schema.Struct({ status: Schema.Literals(["unavailable", "failed"]), reason: Schema.String }),
  ]),
});

const StoredReportSchema = Schema.Struct({
  protocolHash: Schema.String,
  harnessSha256: Schema.String,
  subject: Schema.Literals(["baseline", "candidate"]),
  revision: Schema.String,
  binarySha256: Schema.String,
  hostId: Schema.String,
  smoke: Schema.Boolean,
  integrityVerified: Schema.Boolean,
  collectionComplete: Schema.Boolean,
  snapshot: CommandSnapshotSchema,
  receipts: Schema.Array(BenchmarkReceiptSchema),
  diagnostics: Schema.optionalKey(Schema.Array(DiagnosticSchema)),
});

const hashText = (text: string): string => createHash("sha256").update(text).digest("hex");
const readReport = async (file: string) => {
  const report = Schema.decodeUnknownSync(Schema.fromJsonString(StoredReportSchema))(
    await fs.readFile(file, "utf8"),
  );
  const problems = receiptIdentityProblems(report, report.receipts);
  if (problems.length > 0)
    throw new Error(
      `Report contains inconsistent receipt identities: ${file}\n${problems.join("\n")}`,
    );
  return report;
};

const runEvidence = async <A, E>(effect: Effect.Effect<A, E>, signal: AbortSignal): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect, { signal });
  if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause));
  return exit.value;
};

/** Include fixture implementation: a same-named fixture with changed bytes is not comparable. */
const harnessDigest = async (repoRoot: string): Promise<string> => {
  const files: string[] = [];
  const visit = async (relative: string): Promise<void> => {
    for (const entry of await fs.readdir(path.join(repoRoot, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(child);
    }
  };
  await visit("benchmarks/cli-operations");
  files.push(
    "scripts/bench.ts",
    "benchmarks/lifecycle-sources.ts",
    "tools/e2e-utils/src/device-auth-server.ts",
    "tools/e2e-utils/src/http-registry-server.ts",
    "tools/e2e-utils/src/archive.ts",
    "tools/e2e-utils/src/registry.ts",
    "packages/supporting/registry-client/src/testing.ts",
    "pnpm-lock.yaml",
  );
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(file);
    hash.update(await fs.readFile(path.join(repoRoot, file)));
  }
  return hash.digest("hex");
};

const hostBinary = (repoRoot: string): string => {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  return path.join(
    repoRoot,
    "apps/cli/dist/host-bin",
    `axm-${platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`,
  );
};

/** Diagnostic selections remain incomplete, and smoke runs use a different protocol identity. */
export const runCliOperationBenchmark = (repoRoot: string, outputPath: string): Promise<void> =>
  Effect.runPromise(
    Effect.tryPromise({
      try: async (signal) => {
        const inventoryPath =
          process.env["AXM_OPERATIONS_INVENTORY"] ??
          path.join(repoRoot, "test-results/benchmarks/cli-operations/command-inventory.json");
        const snapshot = parseCommandSnapshot(JSON.parse(await fs.readFile(inventoryPath, "utf8")));
        const operations = benchmarkOperations(snapshot);
        const scenarios = buildBenchmarkScenarios(operations);
        const declarations = scenarioCoverageProblems(operations, scenarios);
        const subject = Schema.decodeUnknownSync(Schema.Literals(["baseline", "candidate"]))(
          process.env["AXM_OPERATIONS_SUBJECT"] ?? "candidate",
        );
        const revision = process.env["AXM_OPERATIONS_REVISION"] ?? snapshot.revision;
        if (!/^[a-f0-9]{40}$/u.test(revision))
          throw new Error("AXM_OPERATIONS_REVISION must identify the full compiled source commit.");
        const binary = process.env["AXM_OPERATIONS_BINARY"] ?? hostBinary(repoRoot);
        const binarySha256 = await binaryIdentity(binary);
        const harnessSha256 = await harnessDigest(repoRoot);
        const protocolHash = hashText(JSON.stringify(benchmarkProtocol));
        const host = {
          platform: process.platform,
          architecture: process.arch,
          release: os.release(),
          cpu: os.cpus()[0]?.model ?? "unknown",
          logicalCpus: os.cpus().length,
          memoryBytes: os.totalmem(),
          bun: process.versions["bun"] ?? null,
          node: process.version,
        };
        const hostId = hashText(JSON.stringify({ ...host, hostname: os.hostname() }));
        const smoke = process.env["AXM_OPERATIONS_SMOKE"] === "1";
        const selectors =
          process.env["AXM_OPERATIONS_SELECT"]?.split(",").filter((part) => part !== "") ?? [];
        const selected = scenarios.filter(
          (scenario) =>
            selectors.length === 0 || selectors.some((selector) => scenario.id.includes(selector)),
        );
        if (selected.length === 0) throw new Error("No benchmark scenarios match the selection.");
        if (!smoke && selectors.length === 0 && declarations.length > 0)
          throw new Error(`Incomplete benchmark scenario registry:\n${declarations.join("\n")}`);
        let receipts: BenchmarkReceipt[] = [];
        let diagnostics: Array<typeof DiagnosticSchema.Type> = [];
        let integrityVerified = false;
        const failures: Array<{ readonly scenarioId: string; readonly message: string }> = [];
        if (process.env["AXM_OPERATIONS_RESUME"] === "1") {
          const previous = await readReport(outputPath);
          if (
            previous.protocolHash !== protocolHash ||
            previous.harnessSha256 !== harnessSha256 ||
            previous.subject !== subject ||
            previous.revision !== revision ||
            previous.binarySha256 !== binarySha256 ||
            previous.hostId !== hostId ||
            previous.smoke !== smoke
          )
            throw new Error("Cannot resume changed benchmark inputs, host, binary, or protocol.");
          receipts = [...previous.receipts];
          diagnostics = [...(previous.diagnostics ?? [])];
          await fs.copyFile(outputPath, `${outputPath}.before-resume-${Date.now()}.json`);
        }
        const protocolId = smoke ? `${benchmarkProtocol.id}-smoke` : benchmarkProtocol.id;
        const persist = async (): Promise<void> => {
          const pendingReport = `${outputPath}.pending`;
          await writeJson(pendingReport, {
            schemaVersion: 1,
            protocolHash,
            harnessSha256,
            subject,
            revision,
            binarySha256,
            hostId,
            host,
            smoke,
            protocol: benchmarkProtocol,
            snapshot,
            operations,
            scenarios: scenarios.map(
              ({
                id,
                operationId,
                modeId,
                fixtureId,
                description,
                dimensions,
                knownBaselineLimitation,
              }) => ({
                id,
                operationId,
                modeId,
                fixtureId,
                description,
                dimensions,
                ...(knownBaselineLimitation === undefined ? {} : { knownBaselineLimitation }),
              }),
            ),
            selections: selectors,
            declarationProblems: declarations,
            receipts,
            diagnostics,
            failures,
            integrityVerified,
            collectionComplete:
              integrityVerified &&
              !smoke &&
              selectors.length === 0 &&
              declarations.length === 0 &&
              scenarios.every(
                (scenario) =>
                  receipts.some(
                    (receipt) => receipt.scenarioId === scenario.id && receipt.status === "passed",
                  ) &&
                  diagnostics.some(
                    (diagnostic) =>
                      diagnostic.scenarioId === scenario.id &&
                      diagnostic.evidence.status === "observed",
                  ),
              ),
            summaries: receipts
              .filter((receipt) => receipt.status === "passed" && !smoke)
              .map((receipt) => ({
                scenarioId: receipt.scenarioId,
                ...summarizeSamples(receipt.samples),
              })),
          });
          await fs.rename(pendingReport, outputPath);
        };
        const collectionStarted = performance.now();
        const progress = async (
          scenarioId: string,
          scenarioOrdinal: number,
          phase: string,
          ordinal: number,
          count: number,
        ): Promise<void> => {
          const progressPath = `${outputPath}.progress.json`;
          await writeJson(`${progressPath}.pending`, {
            subject,
            smoke,
            scenarioId,
            scenarioOrdinal,
            scenarioCount: selected.length,
            phase,
            ordinal,
            count,
            elapsedMs: performance.now() - collectionStarted,
          });
          await fs.rename(`${progressPath}.pending`, progressPath);
        };
        await persist();
        for (const [index, scenario] of selected.entries()) {
          const previous = receipts.find(
            (receipt) => receipt.scenarioId === scenario.id && receipt.status === "passed",
          );
          if (
            previous !== undefined &&
            (smoke ||
              diagnostics.some(
                (diagnostic) =>
                  diagnostic.scenarioId === scenario.id &&
                  diagnostic.evidence.status === "observed",
              ))
          )
            continue;
          const evidencePaths = scenarioEvidencePaths(outputPath, scenario.id, subject);
          const evidencePath = evidencePaths.receipt;
          const samples: BenchmarkSample[] = previous === undefined ? [] : [...previous.samples];
          let status: BenchmarkReceipt["status"] = "passed";
          try {
            const phases =
              previous !== undefined
                ? []
                : smoke
                  ? [{ phase: "first", count: 1 } as const]
                  : ([
                      { phase: "first", count: benchmarkProtocol.firstInvocations },
                      { phase: "warmup", count: benchmarkProtocol.warmups },
                      { phase: "measured", count: benchmarkProtocol.repetitions },
                    ] as const);
            for (const { phase, count } of phases) {
              for (let ordinal = 0; ordinal < count; ordinal += 1) {
                await progress(scenario.id, index + 1, phase, ordinal + 1, count);
                const result = await runEvidence(
                  runScenarioSample(scenario, repoRoot, binary, { subject }),
                  signal,
                );
                samples.push({
                  ordinal,
                  phase,
                  args: result.args,
                  expectedExitCode: result.expectedExitCode,
                  durationMs: result.durationMs,
                  exitCode: result.exitCode,
                  cpuUserMs: result.cpuUserMs,
                  cpuSystemMs: result.cpuSystemMs,
                  peakRssBytes: result.peakRssBytes,
                  ioReadBytes: result.ioReadBytes,
                  ioWriteBytes: result.ioWriteBytes,
                  metrics: result.metrics,
                });
              }
            }
          } catch (cause) {
            status = "failed";
            failures.push({
              scenarioId: scenario.id,
              message: cause instanceof Error ? cause.message : String(cause),
            });
            if (signal.aborted) throw cause;
          }
          const receipt: BenchmarkReceipt = {
            scenarioId: scenario.id,
            operationId: scenario.operationId,
            modeId: scenario.modeId,
            subject,
            revision,
            binarySha256,
            protocolId,
            fixtureId: scenario.fixtureId,
            hostId,
            status,
            samples,
            evidencePath,
          };
          receipts = [
            ...receipts.filter((previous) => previous.scenarioId !== scenario.id),
            receipt,
          ];
          await writeJson(path.join(path.dirname(outputPath), evidencePath), receipt);
          if (!smoke && status === "passed") {
            await progress(scenario.id, index + 1, "syscalls", 1, 1);
            let evidence: (typeof DiagnosticSchema.Type)["evidence"];
            try {
              evidence = await runEvidence(
                diagnoseScenario(
                  scenario,
                  repoRoot,
                  binary,
                  path.join(path.dirname(outputPath), evidencePaths.trace),
                  subject,
                ),
                signal,
              );
            } catch (cause) {
              const reason = cause instanceof Error ? cause.message : String(cause);
              evidence = { status: "failed", reason };
              failures.push({ scenarioId: `${scenario.id}/diagnostic`, message: reason });
            }
            diagnostics = [
              ...diagnostics.filter((diagnostic) => diagnostic.scenarioId !== scenario.id),
              { scenarioId: scenario.id, evidence },
            ];
          }
          await persist();
          console.log(`${index + 1}/${selected.length} ${status}: ${scenario.id}`);
        }
        if (!smoke && harnessSha256 !== (await harnessDigest(repoRoot)))
          throw new Error(
            "Benchmark harness changed during collection; evidence requires a stable rerun.",
          );
        if (!smoke && binarySha256 !== (await binaryIdentity(binary)))
          throw new Error(
            "Compiled binary changed during collection; evidence requires a stable rerun.",
          );
        integrityVerified = !smoke;
        await persist();
        const comparePath = process.env["AXM_OPERATIONS_COMPARE"];
        if (comparePath !== undefined) {
          const baseline = await readReport(comparePath);
          if (
            subject !== "candidate" ||
            baseline.subject !== "baseline" ||
            smoke ||
            baseline.smoke ||
            selectors.length > 0 ||
            !baseline.integrityVerified ||
            !baseline.collectionComplete ||
            baseline.protocolHash !== protocolHash ||
            baseline.harnessSha256 !== harnessSha256
          )
            throw new Error(
              "Comparison requires a full baseline and candidate using the identical harness and protocol.",
            );
          const comparisonReceipts = [...baseline.receipts, ...receipts];
          const coverage = [
            ...compareCommandInventories(baseline.snapshot, snapshot),
            ...benchmarkCoverageProblems({ operations, scenarios, receipts: comparisonReceipts }),
          ];
          for (const scenario of scenarios) {
            if (
              !baseline.diagnostics?.some(
                (diagnostic) =>
                  diagnostic.scenarioId === scenario.id &&
                  diagnostic.evidence.status === "observed",
              )
            )
              coverage.push(`missing baseline diagnostic: ${scenario.id}`);
            if (
              !diagnostics.some(
                (diagnostic) =>
                  diagnostic.scenarioId === scenario.id &&
                  diagnostic.evidence.status === "observed",
              )
            )
              coverage.push(`missing candidate diagnostic: ${scenario.id}`);
          }
          const comparisons = scenarios.flatMap((scenario) => {
            const before = baseline.receipts.find(
              (receipt) => receipt.scenarioId === scenario.id && receipt.status === "passed",
            );
            const after = receipts.find(
              (receipt) => receipt.scenarioId === scenario.id && receipt.status === "passed",
            );
            return before === undefined || after === undefined
              ? []
              : [
                  {
                    scenarioId: scenario.id,
                    operationId: scenario.operationId,
                    modeId: scenario.modeId,
                    before: summarizeSamples(before.samples),
                    after: summarizeSamples(after.samples),
                    elapsed: compareDistributions(
                      measuredDistribution(before.samples),
                      measuredDistribution(after.samples),
                    ),
                    resources: compareSampleResources(
                      summarizeSamples(before.samples),
                      summarizeSamples(after.samples),
                    ),
                  },
                ];
          });
          const diagnosticComparisons = scenarios.map((scenario) => {
            const before =
              baseline.diagnostics?.find((diagnostic) => diagnostic.scenarioId === scenario.id)
                ?.evidence ?? null;
            const after =
              diagnostics.find((diagnostic) => diagnostic.scenarioId === scenario.id)?.evidence ??
              null;
            const deltas =
              before?.status === "observed" && after?.status === "observed"
                ? {
                    calls: compareCounters(
                      Object.fromEntries(
                        Object.entries(before.syscalls).map(([name, value]) => [name, value.calls]),
                      ),
                      Object.fromEntries(
                        Object.entries(after.syscalls).map(([name, value]) => [name, value.calls]),
                      ),
                    ),
                    errors: compareCounters(
                      Object.fromEntries(
                        Object.entries(before.syscalls).map(([name, value]) => [
                          name,
                          value.errors,
                        ]),
                      ),
                      Object.fromEntries(
                        Object.entries(after.syscalls).map(([name, value]) => [name, value.errors]),
                      ),
                    ),
                    metrics: compareCounters(before.metrics, after.metrics),
                  }
                : null;
            return { scenarioId: scenario.id, before, after, deltas };
          });
          await writeJson(path.join(path.dirname(outputPath), "comparison.json"), {
            coverage,
            comparisons,
            diagnosticComparisons,
            materialRegressions: comparisons
              .filter((comparison) => comparison.elapsed.materialRegression)
              .map((comparison) => comparison.scenarioId),
          });
          if (coverage.length > 0)
            throw new Error(`Incomplete comparison:\n${coverage.join("\n")}`);
        }
        if (failures.length > 0)
          throw new Error(`${failures.length} benchmark scenarios failed; see ${outputPath}.`);
        console.log(
          `CLI operation benchmark retained at ${outputPath}${smoke || selectors.length > 0 ? " (diagnostic selection; not complete coverage)" : ""}`,
        );
      },
      catch: (cause) =>
        new OperationBenchmarkError({
          message: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
    }),
  );
