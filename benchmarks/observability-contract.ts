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
export type MemoryPolicy = "enforced" | "informational";
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
    /** Exact inventory-reconciled automatic scan stat rows; timing traces are uninspected. */
    readonly automaticCacheMaintenance: ReadonlyArray<PeriodicMaintenanceFact> | null;
    readonly retainedSpanCount: number;
    readonly retainedDetailSpanCount: number | null;
    readonly summaryGroups: number;
    readonly diagnosticShutdownMillis: number | null;
    readonly exportFinalizationMillis: number | null;
    readonly traceId: string;
    readonly rootSpanId: string;
    readonly workDigest?: string;
    readonly documentSerializationWork?: DocumentSerializationWork;
    readonly retrievalBytes?: number;
  };
}

/** Native receipt profiles; the diagnostic profile below has separate admission guards. */
const nativeReceiptInstallOwners = new Map<string, ReadonlyArray<string>>([
  ["axm.hash.preimage", ["axm.publish.file", "axm.publish.snapshot", "axm.verify.publication"]],
  [
    "axm.io.read-file",
    [
      "axm.publish.file",
      "axm.publish.prepare-document",
      "axm.publish.receipts",
      "axm.publish.snapshot",
    ],
  ],
  ["axm.io.write-file", ["axm.operation.phase", "axm.publish.receipts"]],
]);

export const documentByteField = (
  scenario: string,
  row: {
    readonly kind: string;
    readonly ownerName: string;
    readonly dimensions: Readonly<Record<string, string | number | boolean>>;
  },
):
  | { readonly field: "bytes" | "ioBytes"; readonly measurement: "axm.work.bytes" | "axm.io.bytes" }
  | undefined => {
  if (scenario === "installed/adopt-enabled-native-refusal") {
    return row.kind === "axm.io.write-file" &&
      ["axm.cli.command", "axm.cli.operation"].includes(row.ownerName) &&
      row.dimensions["axm.work.owner"] === row.ownerName &&
      row.dimensions["axm.outcome"] === "success" &&
      Object.keys(row.dimensions).length === 2
      ? { field: "ioBytes", measurement: "axm.io.bytes" }
      : undefined;
  }
  if (
    row.ownerName !== "axm.operation.phase" ||
    Object.keys(row.dimensions).length !== 2 ||
    row.dimensions["axm.outcome"] !== "success"
  )
    return undefined;
  const owner = row.dimensions["axm.work.owner"];
  if (typeof owner !== "string") return undefined;
  const admitted =
    scenario === "typed/knowledge/new"
      ? (row.kind === "axm.hash.preimage" &&
          ["axm.publish.file", "axm.verify.publication"].includes(owner)) ||
        (row.kind === "axm.io.read-file" && owner === "axm.publish.file") ||
        (row.kind === "axm.io.write-file" && owner === "axm.publish.receipts")
      : ["typed/subagents/install", "typed/knowledge/install", "typed/packs/install"].includes(
          scenario,
        ) &&
        ((nativeReceiptInstallOwners.get(row.kind)?.includes(owner) ?? false) ||
          (scenario === "typed/subagents/install" &&
            owner === "axm.subagent.apply" &&
            ["axm.io.read-file", "axm.io.write-file"].includes(row.kind)));
  if (!admitted) return undefined;
  return row.kind === "axm.hash.preimage"
    ? { field: "bytes", measurement: "axm.work.bytes" }
    : { field: "ioBytes", measurement: "axm.io.bytes" };
};

const NativeReceiptSerializationSchema = Schema.Struct({
  path: Schema.Literal(".axm/projection-containers.json"),
  rawSha256: sha256,
  rawBytes: count,
  comparisonSha256: sha256,
  projectedScalarBytes: count,
  projectedFieldCount: count.check(Schema.isGreaterThan(0)),
  historicalFieldCount: count,
  projectedFields: Schema.Array(
    Schema.Struct({
      path: Schema.String.check(
        Schema.isPattern(
          /^(?:entries\/\d+\/identity|createdDirectories\/\d+)\/(?:entry|owner\/identity|root\/identity|parents\/\d+\/identity)\/(?:inode|birthtime)$/u,
        ),
      ),
      bytes: count.check(Schema.isGreaterThan(0)),
      historical: Schema.Boolean,
    }),
  ),
  validation: Schema.Literal("native-metadata-and-bounded-cleanup"),
});
export type NativeReceiptSerialization = typeof NativeReceiptSerializationSchema.Type;

const AdoptionDiagnosticSerializationSchema = Schema.Struct({
  path: Schema.Literal(".axm/diagnostics/adoption-diagnostic.json"),
  rawSha256: sha256,
  rawBytes: count.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(64 * 1024)),
  comparisonSha256: sha256,
  projectedScalarBytes: count,
  projectedFieldCount: count.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(16)),
  historicalFieldCount: Schema.Literal(0),
  projectedFields: Schema.Array(
    Schema.Struct({
      path: Schema.String.check(
        Schema.isPattern(/^failure\/history\/(?:[0-9]|1[0-5])\/elapsedMs$/u),
      ),
      bytes: count.check(Schema.isGreaterThan(0)),
      historical: Schema.Literal(false),
    }),
  ),
  validation: Schema.Literal("invocation-bound-adoption-diagnostic"),
});
export type AdoptionDiagnosticSerialization = typeof AdoptionDiagnosticSerializationSchema.Type;
const DocumentSerializationSchema = Schema.Union([
  NativeReceiptSerializationSchema,
  AdoptionDiagnosticSerializationSchema,
]);
export type DocumentSerialization = typeof DocumentSerializationSchema.Type;

const DocumentByteRowSchema = Schema.Struct({
  kind: Schema.String,
  ownerName: Schema.String,
  dimensions: Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Number, Schema.Boolean]),
  ),
  field: Schema.Literals(["bytes", "ioBytes"]),
  measurement: Schema.Literals(["axm.work.bytes", "axm.io.bytes"]),
  value: count,
  total: count,
  count: count.check(Schema.isGreaterThan(0)),
  measured: count,
  occurrences: count,
});
export type DocumentByteRow = typeof DocumentByteRowSchema.Type;

const DocumentSerializationWorkSchema = Schema.Struct({
  strictDigest: sha256,
  receipt: DocumentSerializationSchema,
  byteRows: Schema.Array(DocumentByteRowSchema),
});
export type DocumentSerializationWork = typeof DocumentSerializationWorkSchema.Type;

export const documentByteRowKey = (row: DocumentByteRow): string =>
  JSON.stringify([
    row.kind,
    row.ownerName,
    Object.entries(row.dimensions).sort(([a], [b]) => a.localeCompare(b)),
    row.field,
    row.measurement,
  ]);

export interface WorkComparison {
  readonly status:
    | "equal"
    | "different"
    | "native-serialization-bytes-inconclusive"
    | "diagnostic-serialization-bytes-inconclusive";
  readonly byteEquivalence: "recorded-equal" | "unproven";
  readonly completeAttribution: "unproven";
  readonly summaryWorkDigest: string | undefined;
  readonly detailWorkDigest: string | undefined;
  readonly issues: ReadonlyArray<string>;
  readonly differences: ReadonlyArray<{
    readonly summary: DocumentByteRow;
    readonly detail: DocumentByteRow;
  }>;
  readonly receipts?: {
    readonly summary: DocumentSerialization;
    readonly detail: DocumentSerialization;
  };
  readonly finalDocumentWidthEnvelope?: {
    readonly scalarWidthDifference: number;
    readonly interpretation: "Conservative comparison eligibility only; final fields do not bound intermediate writes or establish complete attribution.";
  };
}

/** One guard shared by live preflight and final assessment; raw byte equality is never relabelled. */
export const compareSummaryDetailWork = (
  scenario: string,
  summary: ObservationSample["trace"],
  detail: ObservationSample["trace"],
): WorkComparison => {
  const identity = {
    summaryWorkDigest: summary?.workDigest,
    detailWorkDigest: detail?.workDigest,
    completeAttribution: "unproven" as const,
  };
  const failed = (): WorkComparison => ({
    ...identity,
    status: "different",
    byteEquivalence: "unproven",
    differences: [],
    issues: ["Summary/detail work mismatch: " + scenario],
  });
  if (summary?.workDigest === undefined || detail?.workDigest === undefined) return failed();
  if (summary.workDigest === detail.workDigest)
    return {
      ...identity,
      status: "equal",
      byteEquivalence: "recorded-equal",
      differences: [],
      issues: [],
    };
  const left = summary.documentSerializationWork;
  const right = detail.documentSerializationWork;
  if (
    !Schema.is(DocumentSerializationWorkSchema)(left) ||
    !Schema.is(DocumentSerializationWorkSchema)(right)
  )
    return failed();
  const a = left.receipt;
  const b = right.receipt;
  const diagnostic = scenario === "installed/adopt-enabled-native-refusal";
  const validation = diagnostic
    ? "invocation-bound-adoption-diagnostic"
    : "native-metadata-and-bounded-cleanup";
  if (a.validation !== validation || b.validation !== validation) return failed();
  if (
    summary.delivery !== "inspected" ||
    detail.delivery !== "inspected" ||
    !summary.complete ||
    !detail.complete ||
    left.strictDigest !== right.strictDigest ||
    a.comparisonSha256 !== b.comparisonSha256 ||
    a.rawSha256 === b.rawSha256 ||
    a.rawBytes === b.rawBytes ||
    b.rawBytes - a.rawBytes !== b.projectedScalarBytes - a.projectedScalarBytes ||
    a.projectedFieldCount !== b.projectedFieldCount ||
    a.historicalFieldCount !== b.historicalFieldCount ||
    a.historicalFieldCount > a.projectedFieldCount ||
    left.byteRows.length === 0 ||
    left.byteRows.length !== right.byteRows.length
  )
    return failed();
  const validFields = (receipt: DocumentSerialization) =>
    receipt.projectedFields.length === receipt.projectedFieldCount &&
    new Set(receipt.projectedFields.map((field) => field.path)).size ===
      receipt.projectedFieldCount &&
    receipt.projectedFields.reduce((sum, field) => sum + field.bytes, 0) ===
      receipt.projectedScalarBytes &&
    receipt.projectedFields.filter((field) => field.historical).length ===
      receipt.historicalFieldCount;
  if (!validFields(a) || !validFields(b)) return failed();
  const rightFields = new Map(b.projectedFields.map((field) => [field.path, field]));
  let scalarWidthDifference = 0;
  for (const field of a.projectedFields) {
    const other = rightFields.get(field.path);
    if (other === undefined || other.historical !== field.historical) return failed();
    scalarWidthDifference += Math.abs(other.bytes - field.bytes);
  }
  if (scalarWidthDifference === 0) return failed();
  const valid = (row: DocumentByteRow) => {
    const field = documentByteField(scenario, row);
    return (
      field?.field === row.field &&
      field.measurement === row.measurement &&
      row.value === row.total &&
      row.measured === row.count &&
      row.occurrences === row.count
    );
  };
  if (!left.byteRows.every(valid) || !right.byteRows.every(valid)) return failed();
  const rightRows = new Map(right.byteRows.map((row) => [documentByteRowKey(row), row]));
  if (
    rightRows.size !== right.byteRows.length ||
    new Set(left.byteRows.map(documentByteRowKey)).size !== left.byteRows.length
  )
    return failed();
  const differences: Array<{ summary: DocumentByteRow; detail: DocumentByteRow }> = [];
  for (const row of left.byteRows) {
    const other = rightRows.get(documentByteRowKey(row));
    if (
      other === undefined ||
      row.count !== other.count ||
      row.measured !== other.measured ||
      row.occurrences !== other.occurrences
    )
      return failed();
    // Final fields are a conservative eligibility envelope, not a bound on intermediate writes.
    if (Math.abs(other.value - row.value) > row.measured * scalarWidthDifference) return failed();
    if (row.value !== other.value) differences.push({ summary: row, detail: other });
  }
  if (differences.length === 0) return failed();
  if (diagnostic) {
    // Exactly one diagnostic write per admitted owner. Other operation writes remain
    // in its aggregate; only the observed final scalar-width delta is eligible.
    if (left.byteRows.length !== 2 || differences.length !== 2) return failed();
    for (const { summary: row, detail: other } of differences) {
      const expectedCount = row.ownerName === "axm.cli.command" ? 1 : 6;
      if (
        row.count !== expectedCount ||
        other.value - row.value !== b.rawBytes - a.rawBytes ||
        row.value < a.rawBytes ||
        other.value < b.rawBytes ||
        (row.ownerName === "axm.cli.command" &&
          (row.value !== a.rawBytes || other.value !== b.rawBytes))
      )
        return failed();
    }
  }
  return {
    ...identity,
    status: diagnostic
      ? "diagnostic-serialization-bytes-inconclusive"
      : "native-serialization-bytes-inconclusive",
    byteEquivalence: "unproven",
    issues: [],
    differences,
    receipts: { summary: a, detail: b },
    finalDocumentWidthEnvelope: {
      scalarWidthDifference,
      interpretation:
        "Conservative comparison eligibility only; final fields do not bound intermediate writes or establish complete attribution.",
    },
  };
};

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
  readonly workComparison?: WorkComparison;
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
  memoryPolicy: MemoryPolicy = "enforced",
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
    // Retain the largest paired increment, including warmup, even when memory is informational.
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
  const resourceFailed =
    memoryPolicy === "enforced" && comparisons.some((comparison) => !comparison.memoryPassed);
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
  memoryPolicy: MemoryPolicy = "enforced",
) => {
  const issues: string[] = [];
  const workComparisons: Array<WorkComparison & { readonly scenario: string }> = [];
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
    const workComparison = compareSummaryDetailWork(scenario, summary, detail);
    workComparisons.push({ scenario, ...workComparison });
    issues.push(...workComparison.issues);
    const own = samples.filter((sample) => sample.scenario === scenario);
    const assessment = assessScenarioTiming(budgets, own, memoryPolicy);
    if (!assessment.complete) issues.push("Incomplete measured blocks: " + scenario);
    if (assessment.needsEscalation)
      issues.push("Required timing escalation is missing: " + scenario);
    if (assessment.inconclusive)
      issues.push("Timing remains inconclusive after ten samples: " + scenario);
    const initial = assessScenarioTiming(
      budgets,
      own.filter((sample) => sample.warmup || sample.iteration < budgets.measurement.repetitions),
      memoryPolicy,
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
      const passed =
        assessment.passed &&
        comparison.elapsedPassed &&
        (memoryPolicy === "informational" || comparison.memoryPassed);
      comparisons.push({ scenario, ...comparison, passed });
      if (
        (memoryPolicy === "enforced" && !comparison.memoryPassed) ||
        (!assessment.noisy && !assessment.drifting && !comparison.elapsedPassed)
      )
        issues.push("Performance budget exceeded: " + scenario + "/" + comparison.mode);
    }
  }
  return { passed: issues.length === 0, issues, comparisons, workComparisons };
};
