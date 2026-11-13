/** Diagnostic evidence accounting. Acceptance remains with the executable specifications. */
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const sha256 = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/));
const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const positive = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0));

export class ObservabilityBenchmarkFailure extends Data.TaggedError(
  "ObservabilityBenchmarkFailure",
)<{
  readonly code: string;
  readonly message: string;
}> {}

export const fixtureFailure = (message: string) =>
  new ObservabilityBenchmarkFailure({ code: "fixture", message });

export const BinaryManifestSchema = Schema.Struct({
  binaryPath: Schema.String,
  binarySha256: sha256,
  sourceRevision: Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/)),
  sourceDirty: Schema.Boolean,
  sourceDiffSha256: Schema.optional(sha256),
  sourceDiffPath: Schema.optional(Schema.String),
});
export type BinaryManifest = typeof BinaryManifestSchema.Type;

const elapsedBudget = Schema.Struct({ relative: positive, absoluteMillis: positive });
export const ObservabilityBudgetsSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  measurement: Schema.Struct({
    repetitions: Schema.Literal(5),
    maximumRepetitions: Schema.Literal(10),
    warmups: Schema.Literal(1),
    comparison: Schema.Literal("rotated-shared-baseline-block"),
    noiseFraction: Schema.Literal(0.2),
    driftFraction: Schema.Literal(0.1),
    headroomFraction: Schema.Literal(0.2),
    elapsedStatistic: Schema.Literal("median"),
    host: Schema.Literal("isolated Linux x64 reference host"),
  }),
  elapsedBudgets: Schema.Struct({
    disabled: elapsedBudget,
    summary: elapsedBudget,
    detail: elapsedBudget,
  }),
  maximumAdditionalRssBytes: Schema.Struct({ disabled: count, summary: count, detail: count }),
  maximumRetainedSpans: Schema.Struct({ summary: count, detail: count }),
  maximumSummaryGroups: count,
  maximumDiagnosticShutdownMillis: positive,
  interpretation: Schema.String,
});
export type ObservabilityBudgets = typeof ObservabilityBudgetsSchema.Type;
export const traceModes = ["disabled", "summary", "detail"] as const;
export type TraceMode = (typeof traceModes)[number];

/** Structural artifact view; the decoder/composition retains each complete validated row. */
interface PeriodicMaintenanceFact {
  readonly kind: string;
  readonly owner: string;
  readonly ownerName: string;
  readonly count: number;
  readonly executed: number | null;
  readonly workDurationMs: number | null;
  readonly dimensions: Readonly<Record<string, string | number | boolean>>;
  readonly measurements: Readonly<
    Record<
      string,
      { readonly total: number; readonly measured: number; readonly occurrences: number }
    >
  >;
}

export interface OperationCoverage {
  readonly command: string;
  readonly variant: string;
  readonly scenarios: ReadonlyArray<string>;
  readonly status: "implemented" | "pending";
  readonly reason?: string;
}

export interface ObservationSample {
  readonly id: string;
  readonly phase: "preflight" | "timing";
  readonly baselineId?: string;
  readonly scenario: string;
  readonly mode: TraceMode;
  readonly subject: "baseline" | "candidate";
  readonly iteration: number;
  readonly warmup: boolean;
  readonly durationMs: number;
  readonly peakRssBytes: number;
  readonly exitCode: number;
  readonly expectedExitCode?: number;
  readonly inputDigest: string | null;
  readonly stdoutDigest: string;
  readonly stderrDigest: string;
  readonly postconditionDigest: string | null;
  readonly oracle: {
    readonly verified: boolean;
    readonly requestCount: number;
    readonly requestDigest: string;
    readonly evidence: string;
  };
  readonly artifacts: string;
  readonly trace?: {
    readonly complete: boolean;
    readonly delivery: "inspected" | "not-individually-inspected";
    /** Exact inspected heartbeat facts; null means this timing trace was not retrieved. */
    readonly periodicMaintenance: ReadonlyArray<PeriodicMaintenanceFact> | null;
    readonly retainedSpanCount: number;
    readonly retainedDetailSpanCount: number | null;
    readonly summaryGroups: number;
    readonly diagnosticShutdownMillis: number | null;
    readonly exportFinalizationMillis: number | null;
    readonly traceId: string;
    readonly rootSpanId: string;
    readonly workDigest?: string;
    readonly retrievalBytes?: number;
  };
}

/** Fixture validation and measured evidence use the same product-behavior comparison. */
export const observationPairIssues = (
  baseline: ObservationSample,
  candidate: ObservationSample,
): ReadonlyArray<string> => {
  const issues: string[] = [];
  const key = [candidate.scenario, candidate.mode, candidate.warmup, candidate.iteration].join("/");
  if (baseline.phase !== candidate.phase) issues.push("Comparison phases differ: " + key);
  for (const field of [
    "inputDigest",
    "stdoutDigest",
    "stderrDigest",
    "postconditionDigest",
    "exitCode",
  ] as const)
    if (baseline[field] !== candidate[field])
      issues.push("Behavior/input mismatch (" + field + "): " + key);
  if (baseline.oracle.requestDigest !== candidate.oracle.requestDigest)
    issues.push("Independent request mismatch: " + key);
  return issues;
};

export const verifyBinaryIdentity = (manifest: BinaryManifest, actualSha256: string) =>
  actualSha256 === manifest.binarySha256
    ? Effect.void
    : Effect.fail(
        new ObservabilityBenchmarkFailure({
          code: "binary-identity",
          message: "The binary bytes do not match their supplied provenance manifest.",
        }),
      );

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  const left = sorted[middle - 1];
  return right === undefined
    ? Number.NaN
    : sorted.length % 2 === 1
      ? right
      : ((left ?? right) + right) / 2;
};

export interface PreflightCheck {
  readonly scenario: string;
  readonly mode: TraceMode;
  readonly comparisonVerified: boolean;
  readonly trace?: ObservationSample["trace"];
}

export const observationLimitIssues = (
  budgets: ObservabilityBudgets,
  sample: ObservationSample,
): ReadonlyArray<string> => {
  const issues: string[] = [];
  const key = sample.id;
  if (
    sample.exitCode !== (sample.expectedExitCode ?? 0) ||
    !Number.isInteger(sample.expectedExitCode ?? 0) ||
    (sample.expectedExitCode ?? 0) < 0 ||
    (sample.expectedExitCode ?? 0) > 255 ||
    !Number.isFinite(sample.durationMs) ||
    sample.durationMs < 0 ||
    !Number.isFinite(sample.peakRssBytes) ||
    sample.peakRssBytes <= 0
  )
    issues.push("Invalid process observation: " + key);
  if (!sample.oracle.verified) issues.push("Unverified independent operation oracle: " + key);
  if (sample.subject === "candidate" && sample.mode !== "disabled") {
    const trace = sample.trace;
    if (trace === undefined || !trace.complete) issues.push("Incomplete producer evidence: " + key);
    else {
      if (
        trace.retainedSpanCount - 1 > budgets.maximumRetainedSpans[sample.mode] ||
        (trace.retainedDetailSpanCount !== null &&
          trace.retainedDetailSpanCount > budgets.maximumRetainedSpans[sample.mode])
      )
        issues.push("Retained-span budget exceeded: " + key);
      if (trace.summaryGroups > budgets.maximumSummaryGroups)
        issues.push("Summary-group budget exceeded: " + key);
      if (trace.diagnosticShutdownMillis === null)
        issues.push("Missing diagnostic shutdown evidence: " + key);
      else if (trace.diagnosticShutdownMillis > budgets.maximumDiagnosticShutdownMillis)
        issues.push("Diagnostic shutdown budget exceeded: " + key);
      if (
        sample.phase === "preflight" &&
        (trace.delivery !== "inspected" || trace.workDigest === undefined)
      )
        issues.push("Incomplete trace inspection: " + key);
      if (sample.phase === "timing" && trace.delivery !== "not-individually-inspected")
        issues.push("Timing sample claims individual delivery inspection: " + key);
    }
  } else if (sample.trace !== undefined)
    issues.push("Unexpected trace evidence for disabled tracing: " + key);
  return issues;
};

export const timingSubjects = ["baseline", "disabled", "summary", "detail"] as const;
export type TimingSubject = (typeof timingSubjects)[number];
/** Rotated order; five or ten blocks cannot be perfectly balanced over four positions. */
export const timingBlockOrder = (
  scenarioIndex: number,
  block: number,
): ReadonlyArray<TimingSubject> =>
  timingSubjects.map(
    (_, index) =>
      timingSubjects[(scenarioIndex + block + index) % timingSubjects.length] ?? "baseline",
  );

/** One baseline is shared within its nearby block, not duplicated as three observations. */
export const assessScenarioTiming = (
  budgets: ObservabilityBudgets,
  samples: ReadonlyArray<ObservationSample>,
) => {
  const measured = samples.filter((sample) => sample.phase === "timing" && !sample.warmup);
  const baseline = measured
    .filter((sample) => sample.subject === "baseline")
    .sort((a, b) => a.iteration - b.iteration);
  const groups = timingSubjects.map((subject) =>
    subject === "baseline"
      ? baseline
      : measured
          .filter((sample) => sample.subject === "candidate" && sample.mode === subject)
          .sort((a, b) => a.iteration - b.iteration),
  );
  const count = baseline.length;
  const complete =
    (count === budgets.measurement.repetitions ||
      count === budgets.measurement.maximumRepetitions) &&
    groups.every((group) => group.length === count);
  const baselineMedianMs = median(baseline.map((sample) => sample.durationMs));
  const noisy = groups.some((group) => {
    const values = group.map((sample) => sample.durationMs);
    const center = median(values);
    return (
      !Number.isFinite(center) ||
      center <= 0 ||
      (Math.max(...values) - Math.min(...values)) / center > budgets.measurement.noiseFraction
    );
  });
  const first = median(baseline.slice(0, 2).map((sample) => sample.durationMs));
  const last = median(baseline.slice(-2).map((sample) => sample.durationMs));
  const drifting =
    !Number.isFinite(first) ||
    first <= 0 ||
    Math.abs(last - first) / first > budgets.measurement.driftFraction;
  const comparisons = traceModes.map((mode) => {
    const candidate = measured.filter(
      (sample) => sample.subject === "candidate" && sample.mode === mode,
    );
    const candidateMedianMs = median(candidate.map((sample) => sample.durationMs));
    const allowance =
      baselineMedianMs * budgets.elapsedBudgets[mode].relative +
      budgets.elapsedBudgets[mode].absoluteMillis;
    const allowedMedianMs = baselineMedianMs + allowance;
    // The runner rejects any paired increment, including its warmup; a high baseline in another block cannot mask it.
    const additionalPeakRssBytes = Math.max(
      ...samples
        .filter(
          (sample) =>
            sample.phase === "timing" && sample.subject === "candidate" && sample.mode === mode,
        )
        .map((sample) => {
          const matched = samples.find(
            (before) =>
              before.phase === "timing" &&
              before.subject === "baseline" &&
              before.warmup === sample.warmup &&
              before.iteration === sample.iteration,
          );
          return matched === undefined
            ? Number.POSITIVE_INFINITY
            : sample.peakRssBytes - matched.peakRssBytes;
        }),
    );
    const deltas = candidate.map((sample) => {
      const matched = baseline.find((before) => before.iteration === sample.iteration);
      return matched === undefined
        ? Number.NaN
        : sample.durationMs -
            (matched.durationMs * (1 + budgets.elapsedBudgets[mode].relative) +
              budgets.elapsedBudgets[mode].absoluteMillis);
    });
    return {
      mode,
      baselineMedianMs,
      candidateMedianMs,
      allowedMedianMs,
      additionalPeakRssBytes,
      elapsedPassed: candidateMedianMs <= allowedMedianMs,
      memoryPassed: additionalPeakRssBytes <= budgets.maximumAdditionalRssBytes[mode],
      nearBound:
        allowedMedianMs - candidateMedianMs <= allowance * budgets.measurement.headroomFraction,
      straddlesBound: deltas.some((delta) => delta > 0) && deltas.some((delta) => delta < 0),
    };
  });
  const resourceFailed = comparisons.some((comparison) => !comparison.memoryPassed);
  const stableFailure =
    !noisy && !drifting && comparisons.some((comparison) => !comparison.elapsedPassed);
  const needsEscalation =
    complete &&
    count === budgets.measurement.repetitions &&
    !resourceFailed &&
    !stableFailure &&
    (noisy ||
      drifting ||
      comparisons.some((comparison) => comparison.nearBound || comparison.straddlesBound));
  const inconclusive =
    complete && count === budgets.measurement.maximumRepetitions && (noisy || drifting);
  return {
    count,
    complete,
    noisy,
    drifting,
    needsEscalation,
    inconclusive,
    comparisons,
    passed:
      complete &&
      !needsEscalation &&
      !inconclusive &&
      !resourceFailed &&
      comparisons.every((comparison) => comparison.elapsedPassed),
  };
};

/** Partial coverage, missing blocks and uncertainty remain explicit failures of the evidence claim. */
export const assessObservabilityEvidence = (
  budgets: ObservabilityBudgets,
  coverage: ReadonlyArray<OperationCoverage>,
  scenarios: ReadonlyArray<string>,
  samples: ReadonlyArray<ObservationSample>,
  preflight: ReadonlyArray<PreflightCheck> = [],
) => {
  const issues: string[] = [];
  const comparisons: Array<
    ReturnType<typeof assessScenarioTiming>["comparisons"][number] & {
      scenario: string;
      passed: boolean;
    }
  > = [];
  for (const operation of coverage) {
    if (operation.status !== "implemented" || operation.scenarios.length === 0)
      issues.push("Pending successful fixture: " + operation.command + "/" + operation.variant);
    for (const scenario of operation.scenarios)
      if (!scenarios.includes(scenario)) issues.push("Missing declared scenario: " + scenario);
  }
  if (coverage.length === 0 || scenarios.length === 0)
    issues.push("The operation coverage manifest is empty.");
  const unique = new Set<string>();
  for (const sample of samples) {
    const key = [
      sample.scenario,
      sample.mode,
      sample.subject,
      sample.warmup,
      sample.iteration,
    ].join("/");
    if (unique.has(key)) issues.push("Duplicate sample: " + key);
    unique.add(key);
    if (
      !scenarios.includes(sample.scenario) ||
      !traceModes.includes(sample.mode) ||
      sample.phase !== "timing" ||
      !Number.isInteger(sample.iteration) ||
      sample.iteration < 0 ||
      sample.iteration >=
        (sample.warmup ? budgets.measurement.warmups : budgets.measurement.maximumRepetitions) ||
      (sample.subject === "baseline" && sample.mode !== "disabled")
    )
      issues.push("Undeclared sample: " + key);
    issues.push(...observationLimitIssues(budgets, sample));
  }
  for (const scenario of scenarios) {
    const checks = preflight.filter((check) => check.scenario === scenario);
    for (const mode of traceModes) {
      const matching = checks.filter((check) => check.mode === mode);
      if (
        matching.length !== 1 ||
        !matching[0]?.comparisonVerified ||
        (mode !== "disabled" &&
          (matching[0].trace?.delivery !== "inspected" ||
            !matching[0].trace.complete ||
            matching[0].trace.workDigest === undefined))
      )
        issues.push("Missing verified preflight: " + scenario + "/" + mode);
    }
    const summary = checks.find((check) => check.mode === "summary")?.trace;
    const detail = checks.find((check) => check.mode === "detail")?.trace;
    if (summary !== undefined && detail !== undefined && summary.workDigest !== detail.workDigest)
      issues.push("Summary/detail work mismatch: " + scenario);
    const own = samples.filter((sample) => sample.scenario === scenario);
    const assessment = assessScenarioTiming(budgets, own);
    if (!assessment.complete) issues.push("Incomplete measured blocks: " + scenario);
    if (assessment.needsEscalation)
      issues.push("Required timing escalation is missing: " + scenario);
    if (assessment.inconclusive)
      issues.push("Timing remains inconclusive after ten samples: " + scenario);
    const initial = assessScenarioTiming(
      budgets,
      own.filter((sample) => sample.warmup || sample.iteration < budgets.measurement.repetitions),
    );
    if (assessment.count === budgets.measurement.maximumRepetitions && !initial.needsEscalation)
      issues.push("Unjustified timing escalation: " + scenario);
    for (const warmup of [true, false]) {
      const count = warmup ? budgets.measurement.warmups : assessment.count;
      for (let iteration = 0; iteration < count; iteration++) {
        const block = own.filter(
          (sample) => sample.warmup === warmup && sample.iteration === iteration,
        );
        const before = block.filter((sample) => sample.subject === "baseline");
        for (const mode of traceModes) {
          const candidate = block.filter(
            (sample) => sample.subject === "candidate" && sample.mode === mode,
          );
          if (
            block.length !== 4 ||
            before.length !== 1 ||
            candidate.length !== 1 ||
            before[0] === undefined ||
            candidate[0] === undefined
          ) {
            issues.push(
              "Incomplete matched block: " + [scenario, mode, warmup, iteration].join("/"),
            );
            continue;
          }
          if (candidate[0].baselineId !== before[0].id)
            issues.push("Wrong shared baseline reference: " + candidate[0].id);
          issues.push(...observationPairIssues(before[0], candidate[0]));
        }
      }
    }
    for (const comparison of assessment.comparisons) {
      const passed = assessment.passed && comparison.elapsedPassed && comparison.memoryPassed;
      comparisons.push({ scenario, ...comparison, passed });
      if (
        !comparison.memoryPassed ||
        (!assessment.noisy && !assessment.drifting && !comparison.elapsedPassed)
      )
        issues.push("Performance budget exceeded: " + scenario + "/" + comparison.mode);
    }
  }
  return { passed: issues.length === 0, issues, comparisons };
};
