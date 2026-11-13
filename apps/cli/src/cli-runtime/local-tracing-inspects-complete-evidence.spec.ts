import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  inspectLocalTrace,
  traceRetrievalPlan,
  decodeTraceRetrieval,
} from "../machine-output-api.js";

export const specification = defineSpecification({
  requirement: "cli/local-tracing-inspects-complete-evidence",
  title: "Trace inspection verifies diagnostic evidence independently of product success",
  statement:
    "Local trace inspection shall certify an invocation only when the received command identity, selected span set, and typed aggregate facts agree with completed producer accounting and supplied independent work and ownership expectations, preserving unmeasured counters as unknown, excluding unadmitted receiver fields, and refusing incomplete or inconsistent evidence.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The production inspector validates controlled receipt and receiver documents against independent fixture expectations; these cases prove verification decisions, not actual Seq ingestion or complete producer coverage.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const traceId = "0123456789abcdef0123456789abcdef";
const rootId = "0000000000000001";
const ownerId = "0000000000000002";
const waitId = "0000000000000003";
const build = {
  version: "0.51.0",
  revision: "1".repeat(40),
  dirty: false,
  execution: "source",
  runtime: "bun",
  runtimeVersion: "1.4.4",
};
const timings = {
  startupMillis: 2,
  executionMillis: 10,
  runtimeElapsedAtExecutionEndMillis: 12,
  exportFinalizationMillis: 3,
};
const resources = {
  "@Resource.service.name": "axm",
  "@Resource.service.version": build.version,
  "@Resource.axm.build.revision": build.revision,
  "@Resource.axm.build.dirty": build.dirty,
  "@Resource.axm.execution.kind": build.execution,
  "@Resource.process.runtime.name": build.runtime,
  "@Resource.process.runtime.version": build.runtimeVersion,
};
const span = (
  id: string,
  name: string,
  parent: string | undefined,
  properties: unknown = {},
  children: unknown[] = [],
) => ({
  type: "span",
  spanId: id,
  ...(parent === undefined ? {} : { parentSpanId: parent }),
  message: name,
  elapsedMs: 10,
  columns: { "@Properties": properties, ...resources },
  children,
});
const aggregate = (
  kind: string,
  counters: Record<string, number>,
  occurrences = 1,
  owner = ownerId,
) => {
  const attributes: Record<string, string | number | boolean> = {
    "axm.summary.schema-version": 1,
    "axm.summary.kind": kind,
    "axm.summary.owner": owner,
    "axm.summary.count": occurrences,
    "axm.summary.duration-measured": occurrences,
    "axm.summary.work-duration-us": 30_000,
    "axm.outcome": "success",
  };
  for (const [key, total] of Object.entries(counters)) {
    attributes[key] = total;
    attributes[`axm.measured.${key.slice("axm.".length)}`] = occurrences;
  }
  return {
    type: "log",
    spanId: owner,
    message: "axm.work.summary",
    columns: { "@Properties": attributes, ...resources },
  };
};
const idsDigest = (ids: string[]) =>
  createHash("sha256").update(ids.sort().join("\n")).digest("hex");
// Fixture accounting is authored independently of the inspector. Updating a signature
// represents a producer that really performed the changed work, not receiver tampering.
const logDigest = (logs: ReturnType<typeof aggregate>[]) =>
  createHash("sha256")
    .update(
      logs
        .map((log) =>
          JSON.stringify([
            "axm.work.summary",
            Object.entries(log.columns["@Properties"]).sort(([a], [b]) =>
              a < b ? -1 : a > b ? 1 : 0,
            ),
          ]),
        )
        .sort()
        .join("\n"),
    )
    .digest("hex");
const expected = {
  spans: [
    { name: "axm.cli.operation", count: 1, parentName: "axm.cli.invocation" },
    { name: "axm.wait.workspace-lock", count: 1, parentName: "axm.cli.operation" },
  ],
  work: [
    { kind: "axm.registry.attempt", ownerName: "axm.cli.operation", count: 1, executed: 1 },
    { kind: "axm.io.read-file", count: 2, executed: 2, bytes: 12 },
    { kind: "axm.observation.reuse", requested: 3, executed: 2, reused: 1 },
  ],
};
const fixture = () => {
  const logs = [
    aggregate("axm.registry.attempt", { "axm.work.executed": 1 }),
    aggregate("axm.io.read-file", { "axm.work.executed": 2, "axm.work.bytes": 12 }, 2),
    aggregate(
      "axm.observation.reuse",
      { "axm.work.requested": 3, "axm.work.executed": 2, "axm.work.reused-count": 1 },
      3,
    ),
  ];
  const wait = span(waitId, "axm.wait.workspace-lock", ownerId);
  const operation = span(ownerId, "axm.cli.operation", rootId, { "axm.outcome": "success" }, [
    wait,
    ...logs,
  ]);
  const tree = {
    traceId,
    complete: true,
    root: span(
      rootId,
      "axm.cli.invocation",
      undefined,
      {
        axm: {
          command: { route: "list" },
          operation: { mode: "query" },
          outcome: "failure",
          exit: { code: 1 },
        },
      },
      [operation],
    ),
  };
  const receipt = {
    schemaVersion: 2,
    service: "axm",
    traceId,
    spanId: rootId,
    mode: "summary",
    detailSelection: { kinds: [], phase: null },
    commandRoute: "list",
    build,
    timings,
    producerComplete: true,
    retainedSpanCount: 3,
    spanIdsSha256: idsDigest([rootId, ownerId, waitId]),
    aggregateEventCount: 3,
    aggregateEventsSha256: logDigest(logs),
    droppedSpanCount: 0,
    droppedAggregateEventCount: 0,
    unrecognizedSpanCount: 0,
    unrecognizedAttributeCount: 0,
    summaryOverflowCount: 0,
  };
  const attest = () => {
    receipt.aggregateEventCount = logs.length;
    receipt.aggregateEventsSha256 = logDigest(logs);
  };
  return { tree, receipt, logs, wait, operation, attest };
};

describe("local trace evidence inspection", () => {
  it.effect("preserves admission capacity as a dimension rather than an additive work count", () =>
    Effect.gen(function* () {
      const { tree, receipt, logs, operation, attest } = fixture();
      for (const capacity of [1, 3]) {
        const log = aggregate("axm.admission.request-origin", {});
        log.columns["@Properties"]["axm.admission.capacity"] = capacity;
        log.columns["@Properties"]["axm.admission.unit"] = "permits";
        logs.push(log);
        operation.children.push(log);
      }
      attest();
      const report = yield* inspectLocalTrace(receipt, tree, {
        expected: {
          work: [
            {
              kind: "axm.admission.request-origin",
              dimensions: { "axm.admission.capacity": 1 },
              count: 1,
            },
            {
              kind: "axm.admission.request-origin",
              dimensions: { "axm.admission.capacity": 3 },
              count: 1,
            },
          ],
        },
      });
      const admissions = report.work.filter((row) => row.kind === "axm.admission.request-origin");
      expect(admissions).toHaveLength(2);
      expect(admissions.map((row) => row.dimensions["axm.admission.capacity"])).toEqual(
        expect.arrayContaining([1, 3]),
      );
      expect(admissions.every((row) => row.workCount === null)).toBe(true);
      expect(report.waits).toHaveLength(1);
      expect(report.waits[0]?.name).toBe("axm.wait.workspace-lock");
    }),
  );

  it.effect(
    "uses one bounded projected query at the tree limit and verifies a complete large receipt",
    () =>
      Effect.gen(function* () {
        const { receipt } = fixture();
        const spanCount = 10_000;
        const ids = Array.from({ length: spanCount }, (_, i) =>
          (i + 1).toString(16).padStart(16, "0"),
        );
        const large = {
          ...receipt,
          mode: "detail",
          detailSelection: { kinds: ["io"], phase: null },
          retainedSpanCount: spanCount,
          spanIdsSha256: idsDigest(ids),
          aggregateEventCount: 0,
          aggregateEventsSha256: logDigest([]),
        };
        const plan = yield* traceRetrievalPlan(large);
        expect(plan).toMatchObject({ format: "rows", eventLimit: 10_001 });
        expect(plan.args.slice(0, 4)).toEqual(["query", "--json", "--timeout=15000", "--query"]);
        expect(plan.args.at(-1)).toContain(`where @TraceId = '${traceId}' limit 10001`);
        expect(plan.args.at(-1)).not.toContain("@Data");
        const columns = [
          "traceId",
          "spanId",
          "parentSpanId",
          "isSpan",
          "message",
          "elapsedMs",
          "c0",
          "c1",
          "c2",
          "c3",
          "c4",
          "c5",
          "c6",
          "c7",
        ];
        const rows = ids.map((id) => [
          traceId,
          id,
          id === rootId ? null : rootId,
          true,
          id === rootId ? "axm.cli.invocation" : "axm.archive.extraction",
          10,
          id === rootId ? { "axm.command.route": "list", private: "PRIVATE" } : {},
          ...Object.values(resources),
        ]);
        const decoded = yield* decodeTraceRetrieval(large, { Columns: columns, Rows: rows });
        const report = yield* inspectLocalTrace(large, decoded, {
          expected: { spans: [{ name: "axm.archive.extraction", count: spanCount - 1 }] },
        });
        expect(report.evidence.retainedSpanCount).toBe(spanCount);
        expect(report.evidence.expectations).toBe("verified");
        expect(JSON.stringify(report)).not.toContain("PRIVATE");
        expect(
          yield* Effect.flip(
            decodeTraceRetrieval(large, { Columns: columns, Rows: [...rows, rows[0]] }),
          ),
        ).toMatchObject({ code: "retrieval-incomplete" });
        const missing = yield* decodeTraceRetrieval(large, {
          Columns: columns,
          Rows: rows.slice(0, -1),
        });
        expect(yield* Effect.flip(inspectLocalTrace(large, missing))).toMatchObject({
          code: "identity-mismatch",
        });
        expect((yield* traceRetrievalPlan(receipt)).args[0]).toBe("trace");
        for (const excess of [
          { ...large, retainedSpanCount: 16_386 },
          { ...receipt, aggregateEventCount: 513 },
        ])
          expect(yield* Effect.flip(traceRetrievalPlan(excess))).toMatchObject({
            code: "producer-loss",
          });
      }),
  );

  it.effect(
    "decodes correlated projected logs and refuses malformed, foreign, duplicate or orphaned rows",
    () =>
      Effect.gen(function* () {
        const { receipt } = fixture();
        const large = {
          ...receipt,
          mode: "detail",
          detailSelection: { kinds: ["io"], phase: null },
          retainedSpanCount: 10_000,
        };
        const columns = [
          "traceId",
          "spanId",
          "parentSpanId",
          "isSpan",
          "message",
          "elapsedMs",
          "c0",
          "c1",
          "c2",
          "c3",
          "c4",
          "c5",
          "c6",
          "c7",
        ];
        const root = [
          traceId,
          rootId,
          null,
          true,
          "axm.cli.invocation",
          10,
          { "axm.command.route": "list" },
          ...Object.values(resources),
        ];
        const owner = [
          traceId,
          ownerId,
          rootId,
          true,
          "axm.cli.operation",
          2,
          {},
          ...Object.values(resources),
        ];
        const log = [
          traceId,
          ownerId,
          null,
          false,
          "axm.work.summary",
          null,
          { axm: { work: { executed: 0, reused: false } } },
          ...Object.values(resources),
        ];
        expect(
          yield* decodeTraceRetrieval(large, { Columns: columns, Rows: [log, owner, root] }),
        ).toMatchObject({
          traceId,
          complete: true,
          root: {
            spanId: rootId,
            children: [
              {
                spanId: ownerId,
                elapsedMs: 2,
                children: [
                  {
                    type: "log",
                    spanId: ownerId,
                    columns: { "@Properties": { axm: { work: { executed: 0, reused: false } } } },
                  },
                ],
              },
            ],
          },
        });
        const failures = [
          { code: "identity-mismatch", rows: [["f".repeat(32), ...root.slice(1)]] },
          { code: "duplicate-span", rows: [root, owner, owner] },
          {
            code: "topology-mismatch",
            rows: [root, [traceId, ownerId, "f".repeat(16), ...owner.slice(3)]],
          },
          { code: "topology-mismatch", rows: [root, log] },
          {
            code: "topology-mismatch",
            rows: [
              root,
              [traceId, ownerId, waitId, ...owner.slice(3)],
              [traceId, waitId, ownerId, ...owner.slice(3)],
            ],
          },
        ];
        for (const failure of failures)
          expect(
            yield* Effect.flip(
              decodeTraceRetrieval(large, { Columns: columns, Rows: failure.rows }),
            ),
          ).toMatchObject({ code: failure.code });
        expect(
          yield* Effect.flip(
            decodeTraceRetrieval(large, { Columns: columns.slice(1), Rows: [root] }),
          ),
        ).toMatchObject({ code: "invalid-input" });
        const failure = yield* Effect.flip(
          decodeTraceRetrieval(large, { Columns: columns, Rows: [root], Error: "PRIVATE" }),
        );
        expect(failure.code).toBe("retrieval-incomplete");
        expect(JSON.stringify(failure)).not.toContain("PRIVATE");
      }),
  );

  it.effect("rejects inconsistent modes, repeated categories, and phase-only selections", () =>
    Effect.gen(function* () {
      const { tree, receipt } = fixture();
      for (const selection of [
        { mode: "summary", detailSelection: { kinds: ["io"], phase: null } },
        { mode: "detail", detailSelection: { kinds: [], phase: null } },
        { mode: "detail", detailSelection: { kinds: ["io", "io"], phase: null } },
        { mode: "summary", detailSelection: { kinds: [], phase: "planning" } },
      ])
        expect(
          yield* Effect.flip(inspectLocalTrace({ ...receipt, ...selection }, tree)),
        ).toMatchObject({ code: "invalid-input" });
    }),
  );

  it.effect("rejects primitive spans outside declared categories or phase ancestry", () =>
    Effect.gen(function* () {
      const { tree, receipt, operation } = fixture();
      const detailId = "0000000000000004";
      operation.children.push(span(detailId, "axm.io.read-file", ownerId));
      const identity = {
        ...receipt,
        retainedSpanCount: 4,
        spanIdsSha256: idsDigest([rootId, ownerId, waitId, detailId]),
      };
      for (const selection of [
        { mode: "summary", detailSelection: { kinds: [], phase: null } },
        { mode: "detail", detailSelection: { kinds: ["hash"], phase: null } },
        { mode: "detail", detailSelection: { kinds: ["io"], phase: "planning" } },
      ])
        expect(
          yield* Effect.flip(inspectLocalTrace({ ...identity, ...selection }, tree)),
        ).toMatchObject({ code: "selection-mismatch" });
      const selected = {
        ...identity,
        mode: "detail",
        detailSelection: { kinds: ["io"], phase: "planning" },
      };
      operation.columns["@Properties"] = { "axm.operation.phase": "apply" };
      expect(yield* Effect.flip(inspectLocalTrace(selected, tree))).toMatchObject({
        code: "selection-mismatch",
      });
      operation.columns["@Properties"] = { "axm.operation.phase": "planning" };
      expect((yield* inspectLocalTrace(selected, tree)).evidence).toMatchObject({
        detailCoverage: "selected-span-delivery-only",
        retainedDetailSpanCount: 1,
      });
    }),
  );

  it.effect("keeps aggregate-only accounting distinct from a complete interval history", () =>
    Effect.gen(function* () {
      const { tree, receipt } = fixture();
      const report = yield* inspectLocalTrace(
        { ...receipt, mode: "detail", detailSelection: { kinds: ["io"], phase: null } },
        tree,
        { expected },
      );
      expect(report.evidence).toMatchObject({
        detailCoverage: "selected-span-delivery-only",
        retainedDetailSpanCount: 0,
        aggregateIdentityVerified: true,
        expectations: "verified",
      });
      expect(report.work.find((row) => row.kind === "axm.io.read-file")?.count).toBe(2);
    }),
  );

  it.effect.each([
    ["starting", "producer-incomplete"],
    ["disabled", "export-disabled"],
    ["invalid-endpoint", "invalid-endpoint"],
    ["setup-failed", "setup-failed"],
  ])("reports capture state %s independently of receiver availability", ([captureState, code]) =>
    Effect.gen(function* () {
      expect(
        yield* Effect.flip(
          inspectLocalTrace({ schemaVersion: 2, service: "axm", captureState }, undefined),
        ),
      ).toMatchObject({ code });
    }),
  );

  it.effect(
    "verifies spans and aggregate facts independently of product success without adding nested latency",
    () =>
      Effect.gen(function* () {
        const { tree, receipt } = fixture();
        const report = yield* inspectLocalTrace(receipt, tree, { expected });
        expect(report).toMatchObject({
          schemaVersion: 2,
          build,
          timings,
          detailSelection: { kinds: [], phase: null },
          evidence: {
            producerComplete: true,
            retrievalComplete: true,
            spanIdentityVerified: true,
            aggregateIdentityVerified: true,
            aggregateEventCount: 3,
            expectations: "verified",
          },
          invocation: {
            elapsedMs: 10,
            attributes: { "axm.outcome": "failure", "axm.exit.code": 1 },
          },
          scope: { kind: "invocation", spanId: rootId },
        });
        expect(report.work.find((row) => row.kind === "axm.io.read-file")).toMatchObject({
          count: 2,
          executed: 2,
          bytes: 12,
          workDurationMs: 30,
          measurements: { "axm.work.bytes": { total: 12, measured: 2, occurrences: 2 } },
        });
        expect(report.waits).toEqual([
          expect.objectContaining({ name: "axm.wait.workspace-lock", elapsedMs: 10 }),
        ]);
      }),
  );

  it.effect.each([
    { code: "producer-incomplete", change: { producerComplete: false } },
    { code: "producer-incomplete", change: { timings: null } },
    ...[
      "droppedSpanCount",
      "droppedAggregateEventCount",
      "unrecognizedSpanCount",
      "unrecognizedAttributeCount",
      "summaryOverflowCount",
    ].map((key) => ({ code: "producer-loss", change: { [key]: 1 } })),
    { code: "identity-mismatch", change: { retainedSpanCount: 4 } },
    { code: "identity-mismatch", change: { spanIdsSha256: "a".repeat(64) } },
    { code: "identity-mismatch", change: { aggregateEventCount: 4 } },
    { code: "identity-mismatch", change: { aggregateEventsSha256: "a".repeat(64) } },
    { code: "invalid-input", change: { schemaVersion: 1 } },
  ])("rejects $code receipt evidence", ({ code, change }) =>
    Effect.gen(function* () {
      const { tree, receipt } = fixture();
      expect(yield* Effect.flip(inspectLocalTrace({ ...receipt, ...change }, tree))).toMatchObject({
        code,
      });
    }),
  );

  it.effect("rejects receiver truncation, wrong trace identity, and a missing aggregate", () =>
    Effect.gen(function* () {
      const { tree, receipt, operation } = fixture();
      expect(
        yield* Effect.flip(inspectLocalTrace(receipt, { ...tree, complete: false })),
      ).toMatchObject({ code: "retrieval-incomplete" });
      expect(
        yield* Effect.flip(inspectLocalTrace(receipt, { ...tree, traceId: "f".repeat(32) })),
      ).toMatchObject({ code: "identity-mismatch" });
      operation.children.pop();
      expect(yield* Effect.flip(inspectLocalTrace(receipt, tree))).toMatchObject({
        code: "identity-mismatch",
      });
    }),
  );

  it.effect.each(Object.keys(resources))(
    "rejects mismatched root or aggregate build resource %s",
    (column) =>
      Effect.gen(function* () {
        const { tree, receipt, logs, operation } = fixture();
        expect(
          yield* Effect.flip(
            inspectLocalTrace(receipt, {
              ...tree,
              root: { ...tree.root, columns: { ...tree.root.columns, [column]: "mismatched" } },
            }),
          ),
        ).toMatchObject({ code: "identity-mismatch" });
        const log = logs[0];
        if (log === undefined) throw new Error("Missing fixture aggregate");
        operation.children[1] = { ...log, columns: { ...log.columns, [column]: "mismatched" } };
        expect(yield* Effect.flip(inspectLocalTrace(receipt, tree))).toMatchObject({
          code: "identity-mismatch",
        });
      }),
  );

  it.effect(
    "preserves known partial totals and unknown duration instead of certifying them as zero",
    () =>
      Effect.gen(function* () {
        const { tree, receipt, logs, attest } = fixture();
        const log = logs[1];
        if (log === undefined) throw new Error("Missing fixture aggregate");
        const attrs = log.columns["@Properties"];
        attrs["axm.measured.work.bytes"] = 1;
        attrs["axm.summary.duration-measured"] = 0;
        delete attrs["axm.summary.work-duration-us"];
        attest();
        const report = yield* inspectLocalTrace(receipt, tree);
        expect(report.work.find((row) => row.kind === "axm.io.read-file")).toMatchObject({
          bytes: null,
          workDurationMs: null,
          measurements: { "axm.work.bytes": { total: 12, measured: 1, occurrences: 2 } },
        });
        for (const bytes of [0, 12])
          expect(
            yield* Effect.flip(
              inspectLocalTrace(receipt, tree, {
                expected: { work: [{ kind: "axm.io.read-file", bytes }] },
              }),
            ),
          ).toMatchObject({ code: "expectation-mismatch" });
        const network = logs[0];
        if (network === undefined) throw new Error("Missing fixture aggregate");
        expect(report.work.find((row) => row.kind === "axm.registry.attempt")?.bytes).toBeNull();
        network.columns["@Properties"]["axm.work.bytes"] = 0;
        network.columns["@Properties"]["axm.measured.work.bytes"] = 1;
        attest();
        expect(
          (yield* inspectLocalTrace(receipt, tree, {
            expected: { work: [{ kind: "axm.registry.attempt", bytes: 0 }] },
          })).work.find((row) => row.kind === "axm.registry.attempt")?.bytes,
        ).toBe(0);
      }),
  );

  it.effect.each([
    { "axm.work.executed": 0.5 },
    { "axm.measured.work.executed": 0 },
    { "axm.measured.work.executed": 2 },
    { "axm.summary.duration-measured": 2 },
    { "axm.summary.duration-measured": 0 },
    { "axm.summary.schema-version": 2 },
  ])("rejects malformed or inconsistent measurement coverage %#", (change) =>
    Effect.gen(function* () {
      const { tree, receipt, logs, attest } = fixture();
      const log = logs[0];
      if (log === undefined) throw new Error("Missing fixture aggregate");
      Object.assign(log.columns["@Properties"], change);
      attest();
      expect(yield* Effect.flip(inspectLocalTrace(receipt, tree))).toMatchObject({
        code: "invalid-summary",
      });
    }),
  );

  it.effect("detects changed values, duplicate groups, and inconsistent owner correlation", () =>
    Effect.gen(function* () {
      const { tree, receipt, logs, operation, attest } = fixture();
      const log = logs[0];
      if (log === undefined) throw new Error("Missing fixture aggregate");
      log.columns["@Properties"]["axm.work.executed"] = 2;
      expect(yield* Effect.flip(inspectLocalTrace(receipt, tree))).toMatchObject({
        code: "identity-mismatch",
      });
      attest();
      operation.children.push(log);
      logs.push(log);
      attest();
      expect(yield* Effect.flip(inspectLocalTrace(receipt, tree))).toMatchObject({
        code: "invalid-summary",
      });
      operation.children.pop();
      logs.pop();
      attest();
      for (const owner of [waitId, rootId, "f".repeat(16)]) {
        log.columns["@Properties"]["axm.summary.owner"] = owner;
        expect(yield* Effect.flip(inspectLocalTrace(receipt, tree))).toMatchObject({
          code: "invalid-summary",
        });
      }
    }),
  );

  it.effect("rejects duplicate span identities and a wrong independent semantic owner", () =>
    Effect.gen(function* () {
      const { tree, receipt, operation, logs, attest } = fixture();
      tree.root.children.push(operation);
      expect(yield* Effect.flip(inspectLocalTrace(receipt, tree))).toMatchObject({
        code: "duplicate-span",
      });
      tree.root.children.pop();
      const log = logs[0];
      if (log === undefined) throw new Error("Missing fixture aggregate");
      operation.children.splice(1, 1);
      tree.root.children.push(log);
      log.spanId = rootId;
      log.columns["@Properties"]["axm.summary.owner"] = rootId;
      attest();
      expect(yield* Effect.flip(inspectLocalTrace(receipt, tree, { expected }))).toMatchObject({
        code: "expectation-mismatch",
      });
      expect(
        yield* Effect.flip(
          inspectLocalTrace(receipt, tree, {
            expected: {
              spans: [
                { name: "axm.wait.workspace-lock", count: 1, parentName: "axm.cli.invocation" },
              ],
            },
          }),
        ),
      ).toMatchObject({ code: "expectation-mismatch" });
    }),
  );

  it.effect.each([
    {
      label: "duplicated network attempt",
      index: 0,
      kind: "axm.registry.attempt",
      counters: { "axm.work.executed": 2 },
      count: 2,
    },
    {
      label: "missing live I/O",
      index: 1,
      kind: "axm.io.read-file",
      counters: { "axm.work.executed": 1, "axm.work.bytes": 6 },
      count: 1,
    },
    {
      label: "incorrect reuse accounting",
      index: 2,
      kind: "axm.observation.reuse",
      counters: { "axm.work.requested": 3, "axm.work.executed": 3, "axm.work.reused-count": 0 },
      count: 3,
    },
  ])(
    "rejects $label against an external oracle despite valid receipt integrity",
    ({ index, kind, counters, count }) =>
      Effect.gen(function* () {
        const { tree, receipt, logs, operation, attest } = fixture();
        const log = aggregate(kind, counters, count);
        logs[index] = log;
        operation.children[index + 1] = log;
        attest();
        expect(yield* Effect.flip(inspectLocalTrace(receipt, tree, { expected }))).toMatchObject({
          code: "expectation-mismatch",
        });
      }),
  );

  it.effect(
    "requires substantive, admitted selectors and refuses unmeasured false-zero expectations",
    () =>
      Effect.gen(function* () {
        const { tree, receipt } = fixture();
        for (const expected of [
          {},
          { work: [{ kind: "axm.registry.attempt" }] },
          ...[
            { "axm.regsitry.purpose": "eligibility" },
            { "axm.registry.purpose": "eligiblity" },
            { "axm.registry.purpose": true },
          ].map((dimensions) => ({
            work: [{ kind: "axm.registry.attempt", dimensions, executed: 0 }],
          })),
        ])
          expect(yield* Effect.flip(inspectLocalTrace(receipt, tree, { expected }))).toMatchObject({
            code: "invalid-input",
          });
        for (const selector of [
          { dimensions: { "axm.registry.purpose": "eligibility" } },
          { ownerAttributes: { "axm.operation.mode": "apply" } },
        ])
          expect(
            yield* Effect.flip(
              inspectLocalTrace(receipt, tree, {
                expected: { work: [{ kind: "axm.registry.attempt", ...selector, executed: 0 }] },
              }),
            ),
          ).toMatchObject({ code: "expectation-mismatch" });
        expect(
          (yield* inspectLocalTrace(receipt, tree, {
            expected: {
              work: [
                {
                  kind: "axm.registry.attempt",
                  dimensions: { "axm.outcome": "failure", "axm.registry.purpose": "eligibility" },
                  count: 0,
                  executed: 0,
                },
              ],
            },
          })).evidence.expectations,
        ).toBe("verified");
      }),
  );

  it.effect("verifies the whole invocation before selecting a bounded subtree", () =>
    Effect.gen(function* () {
      const { tree, receipt, operation } = fixture();
      const report = yield* inspectLocalTrace(receipt, tree, { spanId: ownerId });
      expect(report.scope).toEqual({ kind: "subtree", spanId: ownerId });
      expect(report.work).toHaveLength(3);
      expect(report.evidence.expectations).toBe("not-supplied");
      expect(
        yield* Effect.flip(
          inspectLocalTrace(receipt, { ...tree, root: operation }, { spanId: ownerId }),
        ),
      ).toMatchObject({ code: "topology-mismatch" });
      expect(yield* Effect.flip(inspectLocalTrace(receipt, tree, { maxNodes: 2 }))).toMatchObject({
        code: "traversal-limit",
      });
    }),
  );

  it.effect(
    "admits nested Seq log properties without exporting arbitrary logs or receiver private fields",
    () =>
      Effect.gen(function* () {
        const { tree, receipt, logs, operation, wait } = fixture();
        const log = logs[0];
        if (log === undefined) throw new Error("Missing fixture aggregate");
        operation.children[1] = {
          ...log,
          columns: {
            ...log.columns,
            "@Properties": {
              axm: {
                summary: {
                  "schema-version": 1,
                  kind: "axm.registry.attempt",
                  owner: ownerId,
                  count: 1,
                  "duration-measured": 1,
                  "work-duration-us": 30_000,
                  private: "PRIVATE",
                },
                work: { executed: 1 },
                measured: { work: { executed: 1 } },
                outcome: "success",
              },
            },
          },
        };
        wait.columns["@Properties"] = {
          axm: {
            summary: { kind: "PRIVATE", owner: "PRIVATE" },
            command: { route: "private-customer" },
          },
        };
        operation.children.push({
          type: "log",
          message: "PRIVATE",
          columns: { "@Properties": { secret: "PRIVATE" } },
        });
        const report = yield* inspectLocalTrace(receipt, tree, { expected });
        expect(report.evidence.logCount).toBe(4);
        expect(JSON.stringify(report)).not.toContain("PRIVATE");
        expect(JSON.stringify(report)).not.toContain("private-customer");
        expect(report.waits[0]?.attributes).toEqual({});
        const failure = yield* Effect.flip(
          inspectLocalTrace(receipt, {
            ...tree,
            root: {
              ...tree.root,
              columns: {
                ...tree.root.columns,
                "@Properties": { axm: { command: { route: "private-customer" } } },
              },
            },
          }),
        );
        expect(failure.code).toBe("identity-mismatch");
        expect(JSON.stringify(failure)).not.toContain("private-customer");
      }),
  );

  it.effect("does not count selected detail spans again as aggregate work", () =>
    Effect.gen(function* () {
      const { tree, receipt, operation } = fixture();
      const detailId = "0000000000000004";
      operation.children.push(
        span(detailId, "axm.io.read-file", ownerId, {
          "axm.work.executed": 1,
          "axm.work.bytes": 6,
        }),
      );
      const report = yield* inspectLocalTrace(
        {
          ...receipt,
          mode: "detail",
          detailSelection: { kinds: ["io"], phase: null },
          retainedSpanCount: 4,
          spanIdsSha256: idsDigest([rootId, ownerId, waitId, detailId]),
        },
        tree,
        { expected },
      );
      expect(report.work.find((row) => row.kind === "axm.io.read-file")?.executed).toBe(2);
    }),
  );
});
