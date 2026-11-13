import { describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gunzipSync } from "node:zlib";
import { spawn } from "node:child_process";
import { once } from "node:events";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { MachineEventSchema, type MachineEvent, type TraceWorkSummary } from "axm.sh/runtime";
import {
  assessObservabilityEvidence,
  assessScenarioTiming,
  timingBlockOrder,
  timingSubjects,
  ObservabilityBudgetsSchema,
  traceModes,
  type ObservationSample,
  type PreflightCheck,
} from "../benchmarks/observability-contract.js";
import {
  compressObservationArtifacts,
  digest,
  hostResourceSnapshot,
  outputDigest,
  progressComparisonNormalization,
  projectComparisonField,
  projectPlanEvaluationTime,
  runObservedProcess,
  snapshotDigest,
  snapshotTree,
} from "../benchmarks/observability-process.js";
import { harnessProvenance } from "../benchmarks/observability-provenance.js";
import { verifyStagedNativeImport } from "../benchmarks/observability-typed-fixtures.js";
import {
  discoverObservabilityRoutes,
  makeObservabilityCoverage,
} from "../benchmarks/observability-coverage.js";
import {
  automaticCacheMaintenanceWork,
  periodicMaintenanceWork,
  workDigest,
} from "../benchmarks/observability.js";

const budgets = Schema.decodeUnknownSync(Schema.fromJsonString(ObservabilityBudgetsSchema))(
  fs.readFileSync(new URL("../benchmarks/observability-budgets.json", import.meta.url), "utf8"),
);
const coverage = [
  { command: "list", variant: "default", scenarios: ["list/one"], status: "implemented" },
] as const;
const samples = (repetitions = 5): ObservationSample[] => {
  const values: ObservationSample[] = [];
  for (const warmup of [true, false])
    for (let iteration = 0; iteration < (warmup ? 1 : repetitions); iteration++)
      for (const scheduled of timingSubjects) {
        const subject = scheduled === "baseline" ? "baseline" : "candidate";
        const mode = scheduled === "baseline" ? "disabled" : scheduled;
        const baselineId = ["baseline", warmup, iteration].join("/");
        values.push({
          id: subject === "baseline" ? baselineId : [mode, warmup, iteration].join("/"),
          phase: "timing",
          scenario: "list/one",
          mode,
          warmup,
          iteration,
          subject,
          ...(subject === "candidate" ? { baselineId } : {}),
          durationMs: 100,
          peakRssBytes: 10_000_000,
          exitCode: 0,
          inputDigest: null,
          stdoutDigest: "stdout",
          stderrDigest: "stderr",
          postconditionDigest: null,
          artifacts: "retained",
          oracle: {
            verified: true,
            requestCount: 0,
            requestDigest: "requests",
            evidence: "oracle.json",
          },
          ...(subject !== "candidate" || mode === "disabled"
            ? {}
            : {
                trace: {
                  complete: true,
                  delivery: "not-individually-inspected",
                  periodicMaintenance: null,
                  automaticCacheMaintenance: null,
                  retainedSpanCount: 3,
                  retainedDetailSpanCount: null,
                  summaryGroups: 1,
                  diagnosticShutdownMillis: 10,
                  exportFinalizationMillis: 5,
                  traceId: "1".repeat(32),
                  rootSpanId: "2".repeat(16),
                },
              }),
        });
      }
  return values;
};
const preflight = (): PreflightCheck[] =>
  traceModes.map((mode) => ({
    scenario: "list/one",
    mode,
    comparisonVerified: true,
    ...(mode === "disabled"
      ? {}
      : {
          trace: {
            complete: true,
            delivery: "inspected",
            periodicMaintenance: [],
            automaticCacheMaintenance: [],
            retainedSpanCount: 3,
            retainedDetailSpanCount: 1,
            summaryGroups: 1,
            diagnosticShutdownMillis: 10,
            exportFinalizationMillis: 5,
            traceId: "1".repeat(32),
            rootSpanId: "2".repeat(16),
            workDigest: "work",
          },
        }),
  }));
const assess = (values: ReadonlyArray<ObservationSample>, checks = preflight()) =>
  assessObservabilityEvidence(budgets, coverage, ["list/one"], values, checks);

const deliveredReuse = (
  outcome: "hit" | "coalesced",
  count = 1,
  kind = "axm.observation.reuse",
): TraceWorkSummary => ({
  kind,
  owner: "0123456789abcdef",
  ownerName: "axm.operation.phase",
  dimensions: {
    "axm.work.owner": "axm.observation.phase",
    "axm.outcome": "success",
    "axm.cache.outcome": outcome,
    ...(kind === "axm.auth.cache"
      ? { "axm.auth.cache-kind": "stored-session", "axm.work.reused": true }
      : {}),
  },
  count,
  workDurationMs: 1,
  measurements: {
    "axm.work.requested": { total: count, measured: count, occurrences: count },
    "axm.work.executed": { total: 0, measured: count, occurrences: count },
    "axm.work.reused-count": { total: count, measured: count, occurrences: count },
  },
  requested: count,
  executed: 0,
  reused: count,
  bytes: null,
  ioBytes: null,
  archiveBytes: null,
  workCount: null,
  batchItems: null,
  registryBatchItems: null,
  archiveEntries: null,
  deniedItems: null,
});

const heartbeatWork = (operation: "stat" | "utimes", count = 1): TraceWorkSummary => ({
  ...deliveredReuse("hit", count),
  kind: "axm.native.lock-io",
  ownerName: "axm.cli.operation",
  dimensions: {
    "axm.work.owner": "SyncWorkspace.previewOrApply",
    "axm.outcome": "success",
    "axm.native.phase": "heartbeat",
    "axm.native.operation": operation,
  },
  workDurationMs: (count * 100) / 1000,
  executed: count,
  requested: null,
  reused: null,
  measurements: {
    "axm.work.executed": { total: count, measured: count, occurrences: count },
    "axm.summary.work-duration-us": { total: count * 100, measured: count, occurrences: count },
  },
});

// Unit facts and schedules from the retained 61-event cold sync-restore pair.
// Keep the fixture independent of temporary campaign artifacts and wall clocks.
const acquisitionSchedules = {
  baseline:
    "S1 S2 S3 S4 P1 P2 P3 P4 R1 R4 S5 R3 R2 S6 S7 P5 P6 P7 R5 R6 S8 R7 S9 S10 P8 P9 P10 R10 R9 R8",
  candidate:
    "S1 S2 S3 S4 P1 P2 P3 P4 R4 R3 S5 R2 R1 S6 S7 P5 R5 P6 P7 S8 R6 R7 S9 S10 P8 P9 P10 R8 R9 R10",
};
const syncProgress = (schedule: string) => {
  const prefix = [
    { _tag: "OperationStarted", operationId: "operation-1", name: "Sync workspace", mode: "apply" },
    { _tag: "PhaseStarted", phase: "resolution" },
    { _tag: "UnitStarted", unitId: "sync-preflight", label: "workspace sync plan", index: 0 },
    {
      _tag: "UnitResolved",
      unitId: "sync-preflight",
      label: "workspace sync plan",
      index: 0,
      state: "committed",
    },
    { _tag: "PhaseStarted", phase: "planning" },
    {
      _tag: "UnitStarted",
      unitId: "lockfile-reconciliation",
      label: "lockfile reconciliation",
      index: 1,
    },
    {
      _tag: "UnitResolved",
      unitId: "lockfile-reconciliation",
      label: "lockfile reconciliation",
      index: 1,
      state: "committed",
    },
    { _tag: "PhaseStarted", phase: "acquisition" },
  ];
  const acquisition = schedule.split(" ").map((entry) => {
    const number = Number(entry.slice(1));
    const name = `bench-${String(number).padStart(3, "0")}`;
    const unitId = `registry-extract:@acme/skill/${name}`;
    const fields = { unitId, label: `acquiring ${name}`, index: number + 1 };
    switch (entry[0]) {
      case "S":
        return { _tag: "UnitStarted", ...fields };
      case "P":
        return {
          _tag: "UnitProgress",
          unitId,
          done: number === 10 ? 381 : 382,
          total: number === 10 ? 381 : 382,
          unit: "bytes",
          attempt: { n: 1, of: 3 },
        };
      case "R":
        return { _tag: "UnitResolved", ...fields, state: "committed" };
      default:
        throw new Error("Unknown retained progress fixture event.");
    }
  });
  const applied = Array.from({ length: 10 }, (_, index) => {
    const name = `bench-${String(index + 1).padStart(3, "0")}`;
    const fields = {
      unitId: `skill:${name}`,
      label: `${name}; previous source=registry:@acme/skills/${name}; proposed source=registry:@acme/skills/${name}; previous version=1.0.0; proposed version=1.0.0; reason=missing; downgrade=no`,
      index,
      total: 10,
    };
    return [
      { _tag: "UnitStarted", ...fields },
      { _tag: "UnitResolved", ...fields, state: "committed" },
    ];
  }).flat();
  return [
    ...prefix,
    ...acquisition,
    { _tag: "PhaseStarted", phase: "validation" },
    { _tag: "PhaseStarted", phase: "apply" },
    ...applied,
    { _tag: "OperationSettled", outcome: "applied" },
  ].map((event, index) => {
    const entry = Schema.decodeUnknownSync(MachineEventSchema)({
      type: "progress",
      event: { ...event, seq: index + 1, atMs: 1000 + index },
    });
    if (entry.type !== "progress") throw new Error("Expected progress fixture event.");
    return entry;
  });
};
const progressText = (events: ReadonlyArray<unknown>) =>
  events.map((event) => JSON.stringify(event)).join("\n") + "\n";
const resequenceProgress = (events: ReadonlyArray<MachineEvent>) => {
  let sequence = 0;
  return events.map((entry) =>
    entry.type === "progress" ? { ...entry, event: { ...entry.event, seq: ++sequence } } : entry,
  );
};

describe("observability campaign evidence", () => {
  it("requires full preflight and one shared baseline with each candidate in every rotated block", () => {
    expect(samples()).toHaveLength(24);
    expect(samples().filter((sample) => sample.subject === "baseline")).toHaveLength(6);
    expect(assess(samples()).passed).toBe(true);
    expect(assess(samples(), []).passed).toBe(false);
    expect(assess(samples().slice(1)).issues).toContain(
      "Incomplete matched block: list/one/disabled/true/0",
    );
    expect(
      assess(
        samples().map((sample) =>
          sample.subject === "candidate" ? { ...sample, baselineId: "wrong" } : sample,
        ),
      ).passed,
    ).toBe(false);
    expect(
      assessObservabilityEvidence(
        budgets,
        [...coverage, { command: "publish", variant: "preview", scenarios: [], status: "pending" }],
        ["list/one"],
        samples(),
        preflight(),
      ).passed,
    ).toBe(false);
    expect(timingBlockOrder(0, 0)).toEqual(["baseline", "disabled", "summary", "detail"]);
    expect(timingBlockOrder(1, 0)).toEqual(["disabled", "summary", "detail", "baseline"]);
    expect(timingBlockOrder(0, 1)).toEqual(timingBlockOrder(1, 0));
  });

  it("rejects changed output and independent wire work even when timings improve", () => {
    const values = samples().map((sample): ObservationSample =>
      sample.subject === "candidate"
        ? {
            ...sample,
            durationMs: 1,
            stdoutDigest: "unexpected-output",
            oracle: { ...sample.oracle, requestDigest: "duplicate-request" },
          }
        : sample,
    );
    const result = assess(values);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.startsWith("Behavior/input mismatch"))).toBe(true);
    expect(result.issues.some((issue) => issue.startsWith("Independent request mismatch"))).toBe(
      true,
    );
  });

  it("admits a declared verified refusal but rejects arbitrary failures", () => {
    expect(
      assess(samples().map((sample) => ({ ...sample, exitCode: 1, expectedExitCode: 1 }))).passed,
    ).toBe(true);
    expect(assess(samples().map((sample) => ({ ...sample, exitCode: 1 }))).passed).toBe(false);
    expect(
      assess(
        samples().map((sample) => ({
          ...sample,
          exitCode: 1,
          expectedExitCode: 1,
          oracle: { ...sample.oracle, verified: false },
        })),
      ).passed,
    ).toBe(false);
  });

  it("keeps producer completeness, full preflight delivery and summary/detail parity distinct", () => {
    const values = samples().map((sample): ObservationSample =>
      sample.mode === "detail" && sample.trace !== undefined
        ? {
            ...sample,
            trace: { ...sample.trace, diagnosticShutdownMillis: null },
          }
        : sample.mode === "summary" && sample.trace !== undefined
          ? { ...sample, trace: { ...sample.trace, complete: false } }
          : sample,
    );
    const checks = preflight().map((check) =>
      check.mode === "detail" && check.trace !== undefined
        ? { ...check, trace: { ...check.trace, workDigest: "omitted-read" } }
        : check,
    );
    const result = assess(values, checks);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.startsWith("Incomplete producer evidence"))).toBe(
      true,
    );
    expect(
      result.issues.some((issue) => issue.startsWith("Missing diagnostic shutdown evidence")),
    ).toBe(true);
    expect(result.issues).toContain("Summary/detail work mismatch: list/one");
    expect(
      assess(
        samples().map((sample) =>
          sample.trace === undefined
            ? sample
            : { ...sample, trace: { ...sample.trace, delivery: "inspected" } },
        ),
      ).passed,
    ).toBe(false);
  });

  it("fails stable elapsed regressions and resource violations without retrying to pass", () => {
    const slow = samples().map((sample) =>
      sample.subject === "candidate" ? { ...sample, durationMs: 1000 } : sample,
    );
    expect(assessScenarioTiming(budgets, slow).needsEscalation).toBe(false);
    expect(assess(slow).passed).toBe(false);
    const excessive = samples().map((sample): ObservationSample =>
      sample.subject === "candidate"
        ? {
            ...sample,
            peakRssBytes: 100_000_000,
            ...(sample.trace === undefined
              ? {}
              : { trace: { ...sample.trace, diagnosticShutdownMillis: 501 } }),
          }
        : sample,
    );
    expect(
      assess(excessive).issues.some((issue) =>
        issue.startsWith("Diagnostic shutdown budget exceeded"),
      ),
    ).toBe(true);
    expect(assessScenarioTiming(budgets, excessive).needsEscalation).toBe(false);
    const masked = samples().map((sample) => ({
      ...sample,
      peakRssBytes:
        sample.iteration === 0
          ? 100_000_000
          : sample.subject === "candidate" && sample.mode === "disabled" && sample.iteration === 1
            ? 30_000_000
            : 10_000_000,
    }));
    expect(assessScenarioTiming(budgets, masked).comparisons[0]?.additionalPeakRssBytes).toBe(
      20_000_000,
    );
    expect(assess(masked).passed).toBe(false);
    const warmupExceeded = samples().map((sample) =>
      sample.warmup && sample.subject === "candidate" && sample.mode === "disabled"
        ? { ...sample, peakRssBytes: 40_000_000 }
        : sample,
    );
    expect(assess(warmupExceeded).passed).toBe(false);
  });

  it("uses the overhead allowance for near-bound escalation and keeps all ten observations", () => {
    const near = (count: number) =>
      samples(count).map((sample) =>
        sample.subject === "candidate" && sample.mode === "disabled"
          ? { ...sample, durationMs: 130 }
          : sample,
      );
    expect(assessScenarioTiming(budgets, samples()).needsEscalation).toBe(false);
    expect(assessScenarioTiming(budgets, near(5)).needsEscalation).toBe(true);
    expect(assess(near(5)).passed).toBe(false);
    expect(assess(near(10)).passed).toBe(true);
    expect(assess(samples(10)).issues).toContain("Unjustified timing escalation: list/one");
  });

  it("escalates noisy results regardless of initial median and remains inconclusive if noise persists", () => {
    const noisy = (count: number) =>
      samples(count).map((sample) =>
        sample.subject === "candidate" && sample.mode === "disabled"
          ? { ...sample, durationMs: sample.iteration % 2 === 0 ? 160 : 100 }
          : sample,
      );
    const initial = assessScenarioTiming(budgets, noisy(5));
    expect(initial.comparisons[0]?.elapsedPassed).toBe(false);
    expect(initial.noisy).toBe(true);
    expect(initial.needsEscalation).toBe(true);
    expect(assessScenarioTiming(budgets, noisy(10)).inconclusive).toBe(true);
    expect(assess(noisy(10)).passed).toBe(false);
    const drift = samples().map((sample) =>
      sample.subject === "baseline"
        ? { ...sample, durationMs: 100 + sample.iteration * 4 }
        : sample,
    );
    expect(assessScenarioTiming(budgets, drift)).toMatchObject({
      noisy: false,
      drifting: true,
      needsEscalation: true,
    });
  });

  it.effect(
    "discovers preview/fix obligations from existing help and never substitutes help for a handler",
    () =>
      Effect.gen(function* () {
        const commands = yield* discoverObservabilityRoutes((route) =>
          Effect.succeed(
            JSON.stringify({
              type: "help",
              flags: route === "lint" ? [{ name: "fix" }, { name: "preview" }] : [],
              ...(route === "" ? { subcommands: [{ commands: [{ name: "lint" }] }] } : {}),
            }),
          ),
        );
        const available = [
          { id: "root", command: "", args: ["--help"] },
          { id: "query", command: "lint", args: ["lint"] },
          { id: "fix", command: "lint", args: ["lint", "--fix"] },
          { id: "preview", command: "lint", args: ["lint", "--fix", "--preview"] },
        ];
        expect(
          makeObservabilityCoverage(available, commands).every(
            (entry) => entry.status === "implemented",
          ),
        ).toBe(true);
        expect(
          makeObservabilityCoverage(
            available.filter((entry) => entry.id !== "fix"),
            commands,
          ).some((entry) => entry.variant === "fix" && entry.status === "pending"),
        ).toBe(true);
        expect(
          makeObservabilityCoverage(
            [{ id: "help", command: "lint", args: ["lint", "--help"] }],
            commands,
          ).every((entry) => entry.status === "pending"),
        ).toBe(true);
      }),
  );
});

describe("independent comparison artifacts", () => {
  it.live("retains exact multibyte stdout and stderr from a chunked child process", () =>
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => fs.mkdtempSync(path.join(os.tmpdir(), "axm-observability-output-"))),
        (directory) => Effect.sync(() => fs.rmSync(directory, { recursive: true, force: true })),
      );
      const stdout = "stdout: λ🙂漢字\n".repeat(32);
      const stderr = "stderr: é🦊日本\n".repeat(32);
      const observed = yield* runObservedProcess({
        executable: process.execPath,
        args: [
          "--input-type=module",
          "-e",
          `const outputs = [Buffer.from(${JSON.stringify(stdout)}), Buffer.from(${JSON.stringify(stderr)})];
           for (let offset = 0; offset < Math.max(...outputs.map(output => output.length)); offset += 7) {
             process.stdout.write(outputs[0].subarray(offset, offset + 7));
             process.stderr.write(outputs[1].subarray(offset, offset + 7));
             await new Promise(resolve => setImmediate(resolve));
           }`,
        ],
        cwd: directory,
        environment: process.env,
        artifacts: directory,
        measureRss: false,
      });
      expect(observed.exitCode).toBe(0);
      expect(observed.stdout).toBe(stdout);
      expect(observed.stderr).toBe(stderr);
      expect(fs.readFileSync(path.join(directory, "stdout.txt"))).toEqual(Buffer.from(stdout));
      expect(fs.readFileSync(path.join(directory, "stderr.txt"))).toEqual(Buffer.from(stderr));
    }).pipe(Effect.scoped),
  );

  it("records a real competing process without retaining its private argument", async () => {
    const privateArgument = "benchmark-private-process-argument";
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)", "--", privateArgument],
      { stdio: "ignore" },
    );
    const exited = once(child, "exit");
    try {
      const observed = hostResourceSnapshot(os.tmpdir());
      expect(observed.processes.some((row) => row.pid === child.pid)).toBe(true);
      expect(JSON.stringify(observed)).not.toContain(privateArgument);
      expect(observed.artifactFilesystem.availableBytes).toBeGreaterThan(0);
    } finally {
      child.kill();
      await exited;
    }
  });

  it("projects a validated recovery path inside one array entry without hiding neighboring data", () => {
    const raw = {
      recovery: {
        entries: [{ recoveryPath: "/tmp/verified", extra: 7 }, { recoveryPath: "unchanged" }],
      },
      extra: true,
    };
    expect(
      projectComparisonField(
        raw,
        ["recovery", "entries", "0", "recoveryPath"],
        "/tmp/verified",
        "<verified>",
      ),
    ).toEqual({
      ...raw,
      recovery: {
        entries: [{ recoveryPath: "<verified>", extra: 7 }, { recoveryPath: "unchanged" }],
      },
    });
    expect(() =>
      projectComparisonField(raw, ["recovery", "entries", "01"], undefined, "invalid"),
    ).toThrow();
  });

  it("projects only an in-invocation plan-result-v4 evaluation time, preserving candidate identity", () => {
    const instant = "2026-11-12T12:00:00.000Z";
    const epoch = Date.parse(instant);
    const raw = {
      ok: true,
      result: {
        contract: "plan-result-v4",
        evaluatedAt: instant,
        candidateId: "meaningful",
        extra: 1,
      },
      suggestions: ["retained"],
    };
    const projected = projectPlanEvaluationTime(JSON.stringify(raw), epoch - 1, epoch + 1);
    expect(JSON.parse(projected)).toEqual({
      ...raw,
      result: { ...raw.result, evaluatedAt: "<evaluated-during-invocation>" },
    });
    expect(() => projectPlanEvaluationTime(JSON.stringify(raw), epoch + 1, epoch + 2)).toThrow();
    const unrelated = JSON.stringify({ ok: true, result: { evaluatedAt: instant } });
    expect(projectPlanEvaluationTime(unrelated, epoch - 1, epoch + 1)).toBe(unrelated);
    const changed = { ...raw, result: { ...raw.result, candidateId: "changed" } };
    expect(
      outputDigest(projectPlanEvaluationTime(JSON.stringify(changed), epoch - 1, epoch + 1), []),
    ).not.toBe(outputDigest(projected, []));
  });

  it.effect.each([
    ["skills", "apply"],
    ["skills", "preview"],
    ["subagents", "apply"],
    ["subagents", "preview"],
  ] as const)(
    "compares only independently staged %s %s identity while preserving the result contract",
    ([kind, mode]) =>
      Effect.gen(function* () {
        const source = kind === "skills" ? "./native-skill" : "./native-reviewer.md";
        const raw = {
          ok: true,
          result: {
            contract: "plan-result-v4",
            planName: "Import native extension",
            mode,
            outcome: mode === "apply" ? "applied" : "previewed",
            candidateId: "f".repeat(64),
            counts: {
              total: 1,
              ready: mode === "preview" ? 1 : 0,
              committed: mode === "apply" ? 1 : 0,
              failed: 0,
              blocked: 0,
              rolledBack: 0,
            },
            units: [
              {
                id: (kind === "skills" ? "skill" : "subagent") + ":imported",
                label: `Import ${source} -> @acme/${kind}/imported`,
                state: mode === "apply" ? "committed" : "ready",
                artifact: { path: kind + "/imported", change: "created" },
              },
            ],
            footprint: [{ path: "axm.json", change: "modified" }],
          },
          suggestions: ["retained"],
        };
        const original = JSON.stringify(raw);
        const verify = (value: unknown) =>
          verifyStagedNativeImport(kind, mode, JSON.stringify(value));
        const first = yield* verify(raw);
        const second = yield* verify({
          ...raw,
          result: { ...raw.result, candidateId: "3".repeat(64) },
        });
        expect(second.stdoutComparison).toBe(first.stdoutComparison);
        expect(JSON.parse(first.stdoutComparison)).toEqual({
          ...raw,
          result: {
            ...raw.result,
            candidateId: "<independently-staged-native-import-candidate>",
          },
        });
        expect(JSON.stringify(raw)).toBe(original);
        const changed = yield* verify({
          ...raw,
          result: { ...raw.result, footprint: [{ path: "axm.json", change: "removed" }] },
        });
        expect(changed.stdoutComparison).not.toBe(first.stdoutComparison);
        for (const result of [
          { ...raw.result, candidateId: "invalid" },
          { ...raw.result, contract: "other-contract" },
          { ...raw.result, planName: "Unrelated plan" },
          { ...raw.result, mode: mode === "apply" ? "preview" : "apply" },
          { ...raw.result, outcome: "blocked" },
          { ...raw.result, units: [] },
          { ...raw.result, units: [{ id: "skill:other", label: "Other target", state: "ready" }] },
          { ...raw.result, counts: { ...raw.result.counts, committed: 2 } },
        ]) {
          expect((yield* verify({ ...raw, result }).pipe(Effect.result))._tag).toBe("Failure");
        }
      }),
  );

  it("distinguishes unknown work metrics from observed zero and retains semantic ownership", () => {
    const work = {
      kind: "axm.http.request",
      owner: "0123456789abcdef",
      ownerName: "axm.cli.command",
      dimensions: {},
      count: 1,
      workDurationMs: 1,
      measurements: { "axm.work.executed": { total: 1, measured: 1, occurrences: 1 } },
      requested: null,
      executed: 1,
      reused: null,
      bytes: null,
      ioBytes: null,
      archiveBytes: null,
      workCount: null,
      batchItems: null,
      registryBatchItems: null,
      archiveEntries: null,
      deniedItems: null,
    };
    expect(workDigest([work])).not.toBe(workDigest([{ ...work, requested: 0 }]));
    expect(workDigest([work])).not.toBe(
      workDigest([
        {
          ...work,
          measurements: {
            ...work.measurements,
            "axm.work.bytes": { total: 2, measured: 1, occurrences: 2 },
          },
        },
      ]),
    );
    for (const metric of [
      "workCount",
      "batchItems",
      "registryBatchItems",
      "archiveEntries",
      "deniedItems",
    ] as const)
      expect(workDigest([work])).not.toBe(workDigest([{ ...work, [metric]: 0 }]));
    expect(workDigest([work])).toBe(
      workDigest([{ ...work, owner: "fedcba9876543210", workDurationMs: 50 }]),
    );
    expect(workDigest([work])).not.toBe(
      workDigest([{ ...work, ownerName: "axm.operation.phase" }]),
    );
  });

  it("compares delivered reuse across completion schedules without changing raw facts", () => {
    for (const kind of [
      "axm.observation.reuse",
      "axm.observation.pack-reuse",
      "axm.resolve.desired-state-reuse",
      "axm.registry.metadata-reuse",
      "axm.auth.cache",
    ]) {
      const completed = [deliveredReuse("hit", 2, kind)];
      const mixed = [deliveredReuse("hit", 1, kind), deliveredReuse("coalesced", 1, kind)];
      const original = structuredClone({ completed, mixed });
      expect(workDigest(completed)).toBe(workDigest(mixed));
      expect({ completed, mixed }).toEqual(original);
    }
  });

  it("retains work, bytes, outcomes and ownership when comparing delivered reuse", () => {
    const hit = deliveredReuse("hit");
    const coalesced = deliveredReuse("coalesced");
    const changed: ReadonlyArray<TraceWorkSummary> = [
      deliveredReuse("coalesced", 2),
      { ...coalesced, requested: 2 },
      { ...coalesced, executed: 1 },
      { ...coalesced, reused: 0 },
      { ...coalesced, bytes: 1 },
      { ...coalesced, ioBytes: 1 },
      { ...coalesced, ownerName: "axm.cli.operation" },
      {
        ...coalesced,
        dimensions: { ...coalesced.dimensions, "axm.work.owner": "axm.cli.command" },
      },
      {
        ...coalesced,
        dimensions: { ...coalesced.dimensions, "axm.outcome": "failure" },
      },
      {
        ...coalesced,
        measurements: {
          ...coalesced.measurements,
          "axm.work.bytes": { total: 1, measured: 1, occurrences: 1 },
        },
      },
    ];
    for (const row of changed) expect(workDigest([hit])).not.toBe(workDigest([row]));
  });

  it("keeps hit/coalesced labels strict outside fully measured successful memo reuse", () => {
    const invalidShapes: ReadonlyArray<(row: TraceWorkSummary) => TraceWorkSummary> = [
      (row) => ({ ...row, count: 0 }),
      (row) => ({ ...row, requested: null }),
      (row) => ({ ...row, executed: 1 }),
      (row) => ({ ...row, reused: 0 }),
      (row) => ({ ...row, measurements: {} }),
      (row) => ({
        ...row,
        measurements: {
          ...row.measurements,
          "axm.work.reused-count": { total: 1, measured: 0, occurrences: 1 },
        },
      }),
      (row) => ({
        ...row,
        measurements: {
          ...row.measurements,
          "axm.work.executed": { total: 1, measured: 1, occurrences: 1 },
        },
      }),
      (row) => ({ ...row, dimensions: { ...row.dimensions, "axm.work.reused": false } }),
      (row) => ({ ...row, dimensions: { ...row.dimensions, "axm.outcome": "failure" } }),
      (row) => ({ ...row, dimensions: { ...row.dimensions, "axm.outcome": "interrupted" } }),
      (row) => ({ ...row, kind: "axm.archive.cache-load" }),
      (row) => ({ ...row, kind: "axm.archive.cache-read" }),
      (row) => ({ ...row, kind: "axm.update.cache" }),
    ];
    for (const invalid of invalidShapes)
      expect(workDigest([invalid(deliveredReuse("hit"))])).not.toBe(
        workDigest([invalid(deliveredReuse("coalesced"))]),
      );
    for (const outcome of ["miss", "corrupt", "bypass"])
      expect(workDigest([deliveredReuse("hit")])).not.toBe(
        workDigest([
          {
            ...deliveredReuse("hit"),
            dimensions: { ...deliveredReuse("hit").dimensions, "axm.cache.outcome": outcome },
          },
        ]),
      );
  });

  it("retains exact periodic heartbeat facts separately from deterministic work equality", () => {
    const productWork = deliveredReuse("hit");
    const work = [productWork, heartbeatWork("stat", 2), heartbeatWork("utimes", 2)];
    const original = structuredClone(work);
    expect(workDigest(work)).toBe(workDigest([productWork]));
    expect(periodicMaintenanceWork(work)).toEqual(original.slice(1));
    expect(periodicMaintenanceWork([productWork])).toEqual([]);
    expect(work).toEqual(original);
    expect(workDigest([...work, { ...productWork, executed: 1 }])).not.toBe(workDigest(work));
  });

  it("keeps failed, partial and other native work in strict cross-run accounting", () => {
    const heartbeat = heartbeatWork("stat");
    const strict: ReadonlyArray<TraceWorkSummary> = [
      { ...heartbeat, kind: "axm.io.stat" },
      { ...heartbeat, count: 0 },
      { ...heartbeat, executed: 0 },
      { ...heartbeat, bytes: 0 },
      { ...heartbeat, measurements: {} },
      {
        ...heartbeat,
        measurements: {
          ...heartbeat.measurements,
          "axm.work.executed": { total: 1, measured: 0, occurrences: 1 },
        },
      },
      {
        ...heartbeat,
        measurements: {
          ...heartbeat.measurements,
          "axm.summary.work-duration-us": { total: 100, measured: 0, occurrences: 1 },
        },
      },
      {
        ...heartbeat,
        measurements: {
          ...heartbeat.measurements,
          "axm.work.bytes": { total: 0, measured: 1, occurrences: 1 },
        },
      },
      { ...heartbeat, dimensions: { ...heartbeat.dimensions, "axm.outcome": "failure" } },
      { ...heartbeat, dimensions: { ...heartbeat.dimensions, "axm.outcome": "interrupted" } },
      { ...heartbeat, dimensions: { ...heartbeat.dimensions, "axm.native.phase": "acquire" } },
      { ...heartbeat, dimensions: { ...heartbeat.dimensions, "axm.native.phase": "release" } },
      { ...heartbeat, dimensions: { ...heartbeat.dimensions, "axm.native.phase": "cleanup" } },
      { ...heartbeat, dimensions: { ...heartbeat.dimensions, "axm.native.phase": "exit" } },
      { ...heartbeat, dimensions: { ...heartbeat.dimensions, "axm.native.operation": "unlink" } },
      { ...heartbeat, dimensions: { ...heartbeat.dimensions, "axm.failure.kind": "denied" } },
    ];
    for (const row of strict) {
      expect(periodicMaintenanceWork([row])).toEqual([]);
      expect(workDigest([row])).not.toBe(workDigest([]));
    }
  });

  it.effect("separates only inventory-reconciled automatic non-evicting cache scan stats", () =>
    Effect.gen(function* () {
      const scan = (
        count: number,
        attributes: Readonly<Record<string, string | number | boolean>> = {},
      ) => ({
        spanId: "a".repeat(16),
        parentSpanId: "b".repeat(16),
        name: "axm.archive.cache-prune",
        elapsedMs: 1,
        attributes: {
          "axm.cache.prune.trigger": "automatic",
          "axm.outcome": "success",
          "axm.cache.entries-scanned": count,
          "axm.cache.entries-removed": 0,
          "axm.cache.bytes-freed": 0,
          ...attributes,
        },
      });
      const stat = (count: number): TraceWorkSummary => ({
        ...heartbeatWork("stat", count),
        owner: "a".repeat(16),
        ownerName: "axm.archive.cache-prune",
        kind: "axm.io.stat",
        dimensions: {
          "axm.work.owner": "axm.archive.cache-prune",
          "axm.outcome": "success",
          "axm.operation.phase": "acquisition",
        },
      });
      const product = deliveredReuse("hit");
      for (const count of [4, 5]) {
        const rows = [product, stat(count)];
        const original = structuredClone(rows);
        const retained = yield* automaticCacheMaintenanceWork({
          work: rows,
          cacheMaintenance: [scan(count)],
        });
        expect(retained).toEqual([rows[1]]);
        expect(rows).toEqual(original);
        const variable = new Set(retained);
        expect(workDigest(rows.filter((row) => !variable.has(row)))).toBe(workDigest([product]));
      }
      for (const attributes of [
        { "axm.cache.prune.trigger": "explicit" },
        { "axm.outcome": "failure" },
        { "axm.outcome": "interrupted" },
        { "axm.cache.entries-removed": 1 },
        { "axm.cache.bytes-freed": 1 },
      ]) {
        expect(
          yield* automaticCacheMaintenanceWork({
            work: [stat(4)],
            cacheMaintenance: [scan(4, attributes)],
          }),
        ).toEqual([]);
      }
      const strict: TraceWorkSummary[] = [
        { ...stat(4), owner: "c".repeat(16) },
        { ...stat(4), ownerName: "axm.operation.phase" },
        { ...stat(4), count: 3 },
        { ...stat(4), executed: 3 },
        { ...stat(4), bytes: 0 },
        { ...stat(4), measurements: {} },
        { ...stat(4), dimensions: { ...stat(4).dimensions, "axm.outcome": "failure" } },
        { ...stat(4), dimensions: { ...stat(4).dimensions, "axm.failure.kind": "denied" } },
        { ...stat(4), kind: "axm.io.remove" },
      ];
      for (const row of strict) {
        const result = yield* automaticCacheMaintenanceWork({
          work: [row],
          cacheMaintenance: [scan(4)],
        }).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
      }
      for (const count of [3, 5, -1, 1.5])
        expect(
          (yield* automaticCacheMaintenanceWork({
            work: [stat(4)],
            cacheMaintenance: [scan(count)],
          }).pipe(Effect.result))._tag,
        ).toBe("Failure");
      expect(
        yield* automaticCacheMaintenanceWork({ work: [], cacheMaintenance: [scan(0)] }),
      ).toEqual([]);
      expect(
        workDigest([
          product,
          { ...stat(1), owner: "c".repeat(16), ownerName: "axm.operation.phase" },
        ]),
      ).not.toBe(workDigest([product]));
    }),
  );

  it("includes transitive fixture modules in the executable harness identity", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-observability-provenance-"));
    try {
      fs.writeFileSync(
        path.join(directory, "entry.ts"),
        'import { value } from "./fixture.js"; export { value };',
      );
      fs.writeFileSync(
        path.join(directory, "fixture.ts"),
        'export { value } from "./protocol.js";',
      );
      fs.writeFileSync(path.join(directory, "protocol.ts"), 'export const value = "before";');
      const before = harnessProvenance(directory, "entry.ts");
      fs.writeFileSync(path.join(directory, "protocol.ts"), 'export const value = "after";');
      const after = harnessProvenance(directory, "entry.ts");
      expect(before.modules.map((entry) => entry.path)).toEqual([
        "entry.ts",
        "fixture.ts",
        "protocol.ts",
      ]);
      expect(before.sha256).not.toBe(after.sha256);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("projects only the validated field while retaining suggestions and unknown product fields", () => {
    const raw = {
      ok: true,
      result: { canonical: { validatedAt: "2026-01-01", additional: 1 }, changed: true },
      suggestions: [{ cmd: "axm list" }],
      futureField: { meaningful: true },
    };
    expect(
      projectComparisonField(raw, ["result", "canonical", "validatedAt"], "2026-01-01", "<time>"),
    ).toEqual({
      ...raw,
      result: { ...raw.result, canonical: { ...raw.result.canonical, validatedAt: "<time>" } },
    });
    expect(() =>
      projectComparisonField(raw, ["result", "missing"], undefined, "ignored"),
    ).toThrow();
    expect(() =>
      projectComparisonField(raw, ["result", "canonical", "validatedAt"], "wrong", "ignored"),
    ).toThrow();
    expect(raw.result.canonical.validatedAt).toBe("2026-01-01");
  });

  it("retains exact raw bytes and identity while compressing completed artifacts", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-observability-compression-"));
    try {
      const bytes = Buffer.from('{"result":"' + "fixture".repeat(1000) + '"}\n');
      fs.writeFileSync(path.join(directory, "stdout.txt"), bytes);
      fs.writeFileSync(path.join(directory, "receipt.json"), '{"traceId":"retained"}\n');
      const sizes = compressObservationArtifacts(directory);
      expect(sizes.compressedBytes).toBeLessThan(sizes.rawBytes);
      expect(gunzipSync(fs.readFileSync(path.join(directory, "stdout.txt.gz")))).toEqual(bytes);
      expect(fs.existsSync(path.join(directory, "stdout.txt"))).toBe(false);
      expect(fs.readFileSync(path.join(directory, "compression.json"), "utf8")).toContain(
        digest(bytes),
      );
      expect(fs.readFileSync(path.join(directory, "receipt.json"), "utf8")).toBe(
        '{"traceId":"retained"}\n',
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("normalizes only protocol progress timestamps, retaining arbitrary result fields", () => {
    const events = syncProgress(acquisitionSchedules.baseline);
    expect(outputDigest(progressText(events), [])).toBe(
      outputDigest(
        progressText(
          events.map((entry) => ({
            ...entry,
            event: { ...entry.event, atMs: entry.event.atMs + 1000 },
          })),
        ),
        [],
      ),
    );
    expect(() =>
      outputDigest('{"type":"progress","event":{"atMs":1,"phase":"apply"}}', []),
    ).toThrow();
    expect(outputDigest('{"ok":true,"result":{"atMs":1}}', [])).not.toBe(
      outputDigest('{"ok":true,"result":{"atMs":2}}', []),
    );
    expect(outputDigest('{"ok":true,"result":{"version":"1"}}', [])).not.toBe(
      outputDigest('{"ok":true,"result":{"version":"2"}}', []),
    );
  });

  it("compares the retained 61-event schedules by complete acquisition unit facts, including drained batches", () => {
    const baseline = syncProgress(acquisitionSchedules.baseline);
    const candidate = syncProgress(acquisitionSchedules.candidate);
    const raw = progressText(baseline);
    expect(baseline).toHaveLength(61);
    expect(candidate).toHaveLength(61);
    expect(digest(raw)).not.toBe(digest(progressText(candidate)));
    expect(outputDigest(raw, [])).toBe(outputDigest(progressText(candidate), []));
    const drained = syncProgress(
      Array.from({ length: 10 }, (_, index) => `S${index + 1} P${index + 1} R${index + 1}`).join(
        " ",
      ),
    );
    expect(outputDigest(raw, [])).toBe(outputDigest(progressText(drained), []));
    expect(progressText(baseline)).toBe(raw);
    expect(progressComparisonNormalization.rawOutput).toContain("Original bytes");
  });

  it("preserves acquisition measurements, attempts, outcomes, unknown facts and per-unit progress order", () => {
    const events = syncProgress(acquisitionSchedules.baseline);
    const expected = outputDigest(progressText(events), []);
    const progress = events.findIndex((entry) => entry.event._tag === "UnitProgress");
    const resolved = events.findIndex(
      (entry, index) => index > 8 && entry.event._tag === "UnitResolved",
    );
    for (const change of [
      { at: progress, fields: { done: 381 } },
      { at: progress, fields: { attempt: { n: 2, of: 3 } } },
      { at: progress, fields: { extra: "new meaningful fact" } },
      {
        at: resolved,
        fields: { state: "failed", failure: { category: "network", detail: "acquisition failed" } },
      },
      { at: resolved, fields: { index: 99 } },
      { at: resolved, fields: { label: "changed label" } },
    ])
      expect(
        outputDigest(
          progressText(
            events.map((entry, index) =>
              index === change.at
                ? { ...entry, event: { ...entry.event, ...change.fields } }
                : entry,
            ),
          ),
          [],
        ),
      ).not.toBe(expected);

    const measurement = events[progress];
    if (measurement === undefined) throw new Error("Missing fixture measurement.");
    const half = { ...measurement, event: { ...measurement.event, done: 191 } };
    const forward = resequenceProgress([
      ...events.slice(0, progress),
      half,
      ...events.slice(progress),
    ]);
    const reversed = resequenceProgress([
      ...events.slice(0, progress + 1),
      half,
      ...events.slice(progress + 1),
    ]);
    expect(outputDigest(progressText(forward), [])).not.toBe(
      outputDigest(progressText(reversed), []),
    );
  });

  it("refuses incomplete sequences, invalid unit causality and unsettled lifecycle boundaries", () => {
    const events = syncProgress(acquisitionSchedules.baseline);
    const first = events[8];
    const progress = events[12];
    const settled = events.at(-1);
    if (first === undefined || progress === undefined || settled === undefined)
      throw new Error("Missing fixture lifecycle events.");
    const invalid = [
      events.filter((_, index) => index !== 12),
      events.map((entry, index) =>
        index === 12 ? { ...entry, event: { ...entry.event, seq: 12 } } : entry,
      ),
      resequenceProgress(events.filter((_, index) => index !== 8)),
      resequenceProgress([
        ...events.slice(0, 8),
        progress,
        ...events.slice(9, 12),
        first,
        ...events.slice(13),
      ]),
      resequenceProgress([...events.slice(0, 12), settled, ...events.slice(12, -1)]),
      events.slice(0, -1),
      [...events, settled],
    ];
    for (const entries of invalid) expect(() => outputDigest(progressText(entries), [])).toThrow();
  });

  it("keeps acquisition barriers, serial apply, nested units and human output in emission order", () => {
    const baseline = syncProgress(acquisitionSchedules.baseline);
    const candidate = syncProgress(acquisitionSchedules.candidate);
    const diagnostic = { type: "log", level: "warn", message: "ordered diagnostic" };
    expect(
      outputDigest(progressText([...baseline.slice(0, 16), diagnostic, ...baseline.slice(16)]), []),
    ).not.toBe(
      outputDigest(progressText([...baseline.slice(0, 17), diagnostic, ...baseline.slice(17)]), []),
    );
    const asApply = (entries: typeof baseline) =>
      entries.map((entry) =>
        entry.event._tag === "PhaseStarted" && entry.event.phase === "acquisition"
          ? { ...entry, event: { ...entry.event, phase: "apply" } }
          : entry,
      );
    expect(outputDigest(progressText(asApply(baseline)), [])).not.toBe(
      outputDigest(progressText(asApply(candidate)), []),
    );
    const nested = (entries: typeof baseline) =>
      entries.map((entry) =>
        entry.event._tag === "UnitStarted" && entry.event.unitId.startsWith("registry-extract:")
          ? { ...entry, event: { ...entry.event, parentUnitId: "parent" } }
          : entry,
      );
    expect(outputDigest(progressText(nested(baseline)), [])).not.toBe(
      outputDigest(progressText(nested(candidate)), []),
    );
    const reorderedApply = resequenceProgress([
      ...baseline.slice(0, 40),
      ...baseline.slice(42, 44),
      ...baseline.slice(40, 42),
      ...baseline.slice(44),
    ]);
    expect(outputDigest(progressText(baseline), [])).not.toBe(
      outputDigest(progressText(reorderedApply), []),
    );
    expect(outputDigest("acquired first\nacquired second\n", [])).not.toBe(
      outputDigest("acquired second\nacquired first\n", []),
    );
  });

  it("detects changed product content even when its keys resemble tracing metadata", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-observability-state-"));
    try {
      const file = path.join(directory, "settings.json");
      fs.writeFileSync(file, '{"operationId":"original","atMs":1}');
      const before = snapshotTree(directory, [directory]);
      fs.writeFileSync(file, '{"operationId":"changed","atMs":2}');
      const after = snapshotTree(directory, [directory]);
      expect(snapshotDigest(before)).not.toBe(snapshotDigest(after));
      expect(before[0]?.sha256).not.toBe(after[0]?.sha256);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
