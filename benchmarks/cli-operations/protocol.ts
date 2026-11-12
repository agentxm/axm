import type { BenchmarkSample } from "./model.js";

/** Fixed before candidate measurements; changing it invalidates comparisons. */
export const benchmarkProtocol = {
  id: "compiled-cli-operations-v1",
  firstInvocations: 1,
  warmups: 3,
  repetitions: 20,
  timeoutMs: 120_000,
  isolation:
    "A new workspace, home, registry state, and installation fixture for every invocation. Preparation and verification are outside timing.",
  clock:
    "Fresh compiled process: spawn through drained output and exit. First invocation is retained separately from warmup and steady-state samples.",
  cache:
    "OS filesystem cache is not evicted. AXM cache state is explicit in each scenario. A fresh process does not imply a cold filesystem cache.",
  resourceMetrics:
    "Child CPU, peak RSS, and OS I/O counters when supported; unavailable counters are null. Diagnostic work counters are separate runs and never mixed into latency distributions.",
  comparison: {
    relativeTolerance: 0.1,
    absoluteToleranceMs: 20,
    decision:
      "Flag an operation when either median or p95 rises by more than both 10% and 20ms. Every flagged operation requires investigation and disposition; an aggregate improvement cannot hide it.",
  },
} as const;

export interface Distribution {
  readonly count: number;
  readonly min: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly spread: number;
}

/** Nearest-rank quantiles; 20 observations provide an observed p95. */
export const distribution = (values: ReadonlyArray<number>): Distribution => {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("Benchmark distribution requires finite, non-negative observations.");
  const sorted = [...values].sort((left, right) => left - right);
  const at = (rank: number): number => {
    const result = sorted[rank];
    if (result === undefined) throw new Error("Benchmark quantile rank is absent.");
    return result;
  };
  const min = at(0);
  const max = at(sorted.length - 1);
  return {
    count: sorted.length,
    min,
    p50: at(Math.ceil(sorted.length * 0.5) - 1),
    p95: at(Math.ceil(sorted.length * 0.95) - 1),
    max,
    spread: max - min,
  };
};

export const measuredDistribution = (samples: ReadonlyArray<BenchmarkSample>): Distribution =>
  distribution(
    samples.filter((sample) => sample.phase === "measured").map((sample) => sample.durationMs),
  );

export const summarizeSamples = (samples: ReadonlyArray<BenchmarkSample>) => {
  const measured = samples.filter((sample) => sample.phase === "measured");
  const resource = (read: (sample: BenchmarkSample) => number | null): Distribution | null => {
    const values = measured.map(read);
    // A partially measured resource must not look like a complete distribution.
    return values.length > 0 && values.every((value): value is number => value !== null)
      ? distribution(values)
      : null;
  };
  const metricNames = new Set(measured.flatMap((sample) => Object.keys(sample.metrics)));
  const metrics: Record<string, Distribution | null> = {};
  for (const name of [...metricNames].sort())
    metrics[name] = resource((sample) => sample.metrics[name] ?? null);
  return {
    firstInvocationMs: samples.find((sample) => sample.phase === "first")?.durationMs ?? null,
    elapsedMs: measuredDistribution(samples),
    cpuUserMs: resource((sample) => sample.cpuUserMs),
    cpuSystemMs: resource((sample) => sample.cpuSystemMs),
    peakRssBytes: resource((sample) => sample.peakRssBytes),
    ioReadBytes: resource((sample) => sample.ioReadBytes),
    ioWriteBytes: resource((sample) => sample.ioWriteBytes),
    metrics,
  };
};

export const compareCounters = (
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
) =>
  Object.fromEntries(
    [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().map((name) => {
      const baseline = before[name] ?? null;
      const candidate = after[name] ?? null;
      return [
        name,
        {
          before: baseline,
          after: candidate,
          absolute: baseline === null || candidate === null ? null : candidate - baseline,
          percent:
            baseline === null || candidate === null || baseline === 0
              ? null
              : ((candidate - baseline) / baseline) * 100,
        },
      ] as const;
    }),
  );

export const compareSampleResources = (
  before: ReturnType<typeof summarizeSamples>,
  after: ReturnType<typeof summarizeSamples>,
) => {
  const compare = (baseline: Distribution | null, candidate: Distribution | null) =>
    baseline === null || candidate === null
      ? null
      : compareCounters(
          { p50: baseline.p50, p95: baseline.p95, max: baseline.max },
          { p50: candidate.p50, p95: candidate.p95, max: candidate.max },
        );
  return {
    cpuUserMs: compare(before.cpuUserMs, after.cpuUserMs),
    cpuSystemMs: compare(before.cpuSystemMs, after.cpuSystemMs),
    peakRssBytes: compare(before.peakRssBytes, after.peakRssBytes),
    ioReadBytes: compare(before.ioReadBytes, after.ioReadBytes),
    ioWriteBytes: compare(before.ioWriteBytes, after.ioWriteBytes),
    metrics: Object.fromEntries(
      [...new Set([...Object.keys(before.metrics), ...Object.keys(after.metrics)])]
        .sort()
        .map(
          (name) =>
            [name, compare(before.metrics[name] ?? null, after.metrics[name] ?? null)] as const,
        ),
    ),
  };
};

export const compareDistributions = (before: Distribution, after: Distribution) => {
  const delta = (baseline: number, candidate: number) => ({
    absoluteMs: candidate - baseline,
    percent: baseline === 0 ? null : ((candidate - baseline) / baseline) * 100,
  });
  const exceedsTolerance = (baseline: number, candidate: number): boolean =>
    candidate - baseline > benchmarkProtocol.comparison.absoluteToleranceMs &&
    candidate > baseline * (1 + benchmarkProtocol.comparison.relativeTolerance);
  return {
    p50: delta(before.p50, after.p50),
    p95: delta(before.p95, after.p95),
    max: delta(before.max, after.max),
    materialRegression:
      exceedsTolerance(before.p50, after.p50) || exceedsTolerance(before.p95, after.p95),
  };
};
