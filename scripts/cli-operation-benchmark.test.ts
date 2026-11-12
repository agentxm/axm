import { describe, expect, it } from "vitest";
import {
  benchmarkCoverageProblems,
  allocationCoverageProblems,
} from "../benchmarks/cli-operations/coverage.js";
import {
  benchmarkOperations,
  compareCommandInventories,
} from "../benchmarks/cli-operations/inventory.js";
import type {
  BenchmarkReceipt,
  BenchmarkSample,
  CommandSnapshot,
} from "../benchmarks/cli-operations/model.js";
import {
  benchmarkProtocol,
  compareDistributions,
  compareCounters,
  distribution,
} from "../benchmarks/cli-operations/protocol.js";

const snapshot: CommandSnapshot = {
  schemaVersion: 1,
  revision: "a".repeat(40),
  cliVersion: "1.0.0",
  globalFlags: [],
  helpTopics: [],
  entries: [
    {
      path: ["sync"],
      aliases: [],
      description: "Synchronize the workspace",
      childCount: 0,
      groupOnly: false,
      capabilities: { preview: true, effect: "workspace", inputs: "explicit", modes: [] },
      flags: [{ name: "preview", type: "boolean", required: false }],
      arguments: [],
    },
  ],
};

const operations = benchmarkOperations(snapshot);
const scenarios = operations.flatMap((operation) =>
  operation.modes.map((mode) => ({
    id: `${operation.id}/${mode.id}`,
    operationId: operation.id,
    modeId: mode.id,
    fixtureId: "fixture-v1",
    dimensions: {
      scope: "project",
      source: "path",
      selection: "bulk",
      view: "filesystem",
      output: "human",
      state: "changed",
      format: "cli-human",
      kinds: ["skill"],
    } as const,
  })),
);
const sample = (
  args: ReadonlyArray<string>,
  phase: BenchmarkSample["phase"],
  ordinal: number,
): BenchmarkSample => ({
  args,
  phase,
  ordinal,
  expectedExitCode: 0,
  durationMs: 100,
  exitCode: 0,
  cpuUserMs: 50,
  cpuSystemMs: 5,
  peakRssBytes: 1234,
  ioReadBytes: 0,
  ioWriteBytes: 0,
  metrics: {},
});
const receipts: ReadonlyArray<BenchmarkReceipt> = scenarios.flatMap((scenario) => {
  const mode = operations[0]?.modes.find((entry) => entry.id === scenario.modeId);
  if (mode === undefined) throw new Error("Missing fixture mode");
  const args = ["sync", ...mode.flags];
  return (["baseline", "candidate"] as const).map((subject) => ({
    ...scenario,
    scenarioId: scenario.id,
    subject,
    revision: (subject === "baseline" ? "a" : "b").repeat(40),
    binarySha256: "a".repeat(64),
    protocolId: benchmarkProtocol.id,
    hostId: "test-host",
    status: "passed",
    evidencePath: `${subject}.json`,
    samples: [
      sample(args, "first", 0),
      ...Array.from({ length: 3 }, (_, index) => sample(args, "warmup", index)),
      ...Array.from({ length: 20 }, (_, index) => sample(args, "measured", index)),
    ],
  }));
});

describe("complete compiled CLI benchmark evidence", () => {
  it("requires a separate scenario and both results for a new route or mode", () => {
    expect(benchmarkCoverageProblems({ operations, scenarios, receipts })).toEqual([]);
    const first = snapshot.entries[0];
    if (first === undefined) throw new Error("Missing fixture registration");
    const added = benchmarkOperations({
      ...snapshot,
      entries: [...snapshot.entries, { ...first, path: ["install"] }],
    });
    expect(benchmarkCoverageProblems({ operations: added, scenarios, receipts })).toContain(
      "missing scenario: install [default]",
    );
    const missingPreview = scenarios.filter((scenario) => scenario.modeId !== "preview");
    expect(
      benchmarkCoverageProblems({ operations, scenarios: missingPreview, receipts }),
    ).toContain("missing scenario: sync [preview]");
    expect(
      benchmarkCoverageProblems({
        operations,
        scenarios,
        receipts: receipts.filter((receipt) => receipt.subject !== "candidate"),
      }),
    ).toContain("sync/default: expected one candidate receipt, found 0");
  });

  it("rejects skipped, incomparable and insufficient sample evidence", () => {
    const changed = receipts.map((receipt) =>
      receipt.subject === "candidate"
        ? { ...receipt, hostId: "another-host", status: "skipped" as const, samples: [] }
        : receipt,
    );
    const problems = benchmarkCoverageProblems({ operations, scenarios, receipts: changed });
    expect(problems).toContain("sync/default/candidate: skipped");
    expect(problems).toContain("sync/default: incomparable baseline and candidate");
    expect(problems).toContain("sync/default/candidate: expected 20 measured samples, found 0");
  });

  it("cannot count help timing as a successful mutation benchmark", () => {
    const changed = receipts.map((receipt) =>
      receipt.modeId === "default"
        ? {
            ...receipt,
            samples: receipt.samples.map((entry) => ({ ...entry, args: ["sync", "--help"] })),
          }
        : receipt,
    );
    expect(benchmarkCoverageProblems({ operations, scenarios, receipts: changed })).toContain(
      "sync/default/candidate: static output cannot substitute for operation execution",
    );
  });

  it("cannot exempt an architecture-inapplicable route from measurements", () => {
    expect(
      allocationCoverageProblems(operations, [
        {
          operationId: "sync",
          owner: "fixture",
          publicEntrypoints: [],
          applicability: "inapplicable",
          rationale: "Purpose fixture only",
          evidence: ["fixture.spec.ts"],
        },
      ]),
    ).toEqual([]);
    expect(benchmarkCoverageProblems({ operations, scenarios, receipts: [] })).not.toEqual([]);
  });

  it("detects a new flag even without a renamed route", () => {
    const first = snapshot.entries[0];
    if (first === undefined) throw new Error("Missing fixture registration");
    expect(
      compareCommandInventories(snapshot, {
        ...snapshot,
        entries: [
          {
            ...first,
            flags: [...first.flags, { name: "details", type: "boolean", required: false }],
          },
        ],
      }),
    ).toEqual(["changed registration: sync"]);
  });

  it("keeps an unknown flag and an unspecified fixture representation incomplete", () => {
    const first = snapshot.entries[0];
    if (first === undefined) throw new Error("Missing fixture registration");
    const unclassified = benchmarkOperations({
      ...snapshot,
      entries: [
        {
          ...first,
          flags: [...first.flags, { name: "new-meaning", type: "boolean", required: false }],
        },
      ],
    });
    expect(benchmarkCoverageProblems({ operations: unclassified, scenarios, receipts })).toContain(
      "unclassified flag: sync --new-meaning",
    );
    const unspecified = scenarios.map((scenario) => ({
      ...scenario,
      dimensions: { ...scenario.dimensions, format: "" },
    }));
    expect(benchmarkCoverageProblems({ operations, scenarios: unspecified, receipts })).toContain(
      "missing scenario dimensions: sync/default",
    );
  });

  it("retains observed nearest-rank p95 and flags regressions individually", () => {
    const before = distribution(Array.from({ length: 20 }, (_, index) => index + 100));
    expect(before).toEqual({ count: 20, min: 100, p50: 109, p95: 118, max: 119, spread: 19 });
    expect(compareDistributions(before, distribution([200, 210])).materialRegression).toBe(true);
    expect(compareDistributions(before, distribution([110, 120])).materialRegression).toBe(false);
    expect(compareCounters({ reads: 10 }, { reads: 5, writes: 2 })).toEqual({
      reads: { before: 10, after: 5, absolute: -5, percent: -50 },
      writes: { before: null, after: 2, absolute: null, percent: null },
    });
  });
});
