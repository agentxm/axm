import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { writeFileAtomic } from "@agentxm/host-primitives";
import { withWork } from "@agentxm/host-primitives/work-observation";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  captureContainerIdentity,
  readContainerReceipts,
  updateContainerReceipts,
  type ContainerReceipt,
} from "@agentxm/workspace-kernel/locations";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import {
  recordFilePublication,
  runWorkspaceTransaction,
} from "@agentxm/workspace-kernel/settlement";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import { WorkspaceTransactionScopeTest } from "@agentxm/workspace-kernel/settlement/testing";
import {
  computePackageContentHash,
  withWorkspaceObservationReadView,
} from "@agentxm/workspace-kernel/workspace-state";
import { WorkspaceStateLive } from "@agentxm/workspace-kernel/workspace-state/live";
import {
  inspectLocalTrace,
  observedFileSystem,
  TraceReceiptSchema,
  traceRetrievalColumns,
  withLocalTracing,
  type TraceExpectation,
} from "./index.js";
import { localTracingCollector } from "../test-support/local-tracing-collector.js";

type ReceivedSpan = ReturnType<
  Effect.Success<ReturnType<typeof localTracingCollector>>["spans"]
>[number];
type ReceivedLog = ReturnType<
  Effect.Success<ReturnType<typeof localTracingCollector>>["logs"]
>[number];
const values = (attributes: ReceivedSpan["attributes"]) =>
  Object.fromEntries(
    attributes.map(({ key, value }) => [
      key,
      value["stringValue"] ?? value["boolValue"] ?? value["intValue"] ?? value["doubleValue"],
    ]),
  );

const aggregateDigest = (logs: ReadonlyArray<ReceivedLog>) =>
  createHash("sha256")
    .update(
      logs
        .map((log) =>
          JSON.stringify([
            "axm.work.summary",
            Object.entries(values(log.attributes)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
          ]),
        )
        .sort()
        .join("\n"),
    )
    .digest("hex");

// This projection proves exporter/inspector composition against actual wire data.
// It does not establish Seq's translation of OTLP; the real Seq E2E owns that boundary.
const receiverTree = (spans: ReadonlyArray<ReceivedSpan>, logs: ReadonlyArray<ReceivedLog>) => {
  const root = spans.find((span) => span.name === "axm.cli.invocation");
  if (root === undefined) throw new Error("Invocation was not received");
  const node = (span: ReceivedSpan): unknown => {
    const resource = values(span.resource);
    return {
      type: "span",
      spanId: span.spanId,
      ...(span.parentSpanId === undefined ? {} : { parentSpanId: span.parentSpanId }),
      message: span.name,
      elapsedMs: (span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000,
      columns: {
        "@Properties": values(span.attributes),
        ...Object.fromEntries(
          traceRetrievalColumns
            .slice(1)
            .map((column) => [column, resource[column.slice("@Resource.".length)]]),
        ),
      },
      children: [
        ...spans.filter((child) => child.parentSpanId === span.spanId).map(node),
        ...logs
          .filter((log) => log.spanId === span.spanId)
          .map((log) => {
            const resource = values(log.resource);
            return {
              type: "log",
              spanId: log.spanId,
              message: log.name,
              columns: {
                "@Properties": values(log.attributes),
                ...Object.fromEntries(
                  traceRetrievalColumns
                    .slice(1)
                    .map((column) => [column, resource[column.slice("@Resource.".length)]]),
                ),
              },
            };
          }),
      ],
    };
  };
  return { traceId: root.traceId, complete: true, root: node(root) };
};

const content = "Local fixture bytes.\n";
const contentBytes = Buffer.byteLength(content);
const hashRequests = 2;
const fixtureHash = createHash("sha256")
  .update(
    createHash("sha256").update(`file:0\0note.txt\0${contentBytes}\0${content}`).digest("hex"),
  )
  .digest("hex");

const capture = (mode: "summary" | "detail", fault?: "unobserved-read" | "missing-owner") =>
  Effect.gen(function* () {
    const native = yield* FileSystem.FileSystem;
    const directory = yield* native.makeTempDirectoryScoped();
    const packageDirectory = join(directory, "package");
    const file = join(packageDirectory, "note.txt");
    yield* native.makeDirectory(packageDirectory);
    yield* native.writeFileString(file, content);
    yield* native.chmod(file, 0o644);
    const receiver = yield* localTracingCollector();
    let readCalls = 0;
    let readBytes = 0;
    const counted = FileSystem.make({
      ...native,
      readFile: (target) =>
        native.readFile(target).pipe(
          Effect.tap((bytes) =>
            Effect.sync(() => {
              readCalls++;
              readBytes += bytes.byteLength;
            }),
          ),
        ),
    });
    const platform = WorkspaceFileWriteLocksLive.pipe(
      Layer.provideMerge(
        Layer.merge(
          NativePlatformTest,
          Layer.succeed(FileSystem.FileSystem, observedFileSystem(counted)),
        ),
      ),
    );
    const services = yield* Layer.build(
      WorkspaceStateLive({
        scope: "project",
        projectRoot: decodeAbsolutePathSync(directory),
        allowUninitialized: true,
      }).pipe(Layer.provideMerge(platform)),
    ).pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { AXM_USER_HOME: join(directory, "home") } }),
        ),
      ),
    );
    // Composition reads are outside the measured operation; the independent port
    // counters below account only for the workload that the receipt describes.
    readCalls = 0;
    readBytes = 0;
    const work = withWorkspaceObservationReadView(
      Effect.gen(function* () {
        const hashes = [];
        for (let request = 0; request < hashRequests; request++)
          hashes.push(yield* computePackageContentHash(packageDirectory));
        expect(hashes).toEqual([fixtureHash, fixtureHash]);
        if (fault === "unobserved-read") yield* counted.readFile(file);
      }),
    );
    const receiptPath = join(directory, "receipt.json");
    yield* withLocalTracing(
      (fault === "missing-owner" ? work : work.pipe(Effect.withSpan("axm.cli.operation"))).pipe(
        Effect.provideContext(services),
      ),
      {
        AXM_TRACE: "1",
        AXM_TRACE_DETAIL: mode === "detail" ? "io,hash,reuse" : "",
        AXM_TRACE_ENDPOINT: receiver.endpoint,
        AXM_TRACE_RECEIPT: receiptPath,
      },
    );
    expect(readCalls).toBe(fault === "unobserved-read" ? 2 : 1);
    expect(readBytes).toBe(contentBytes * readCalls);
    const receipt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(TraceReceiptSchema))(
      yield* native.readFileString(receiptPath),
    );
    expect(receipt.producerComplete).toBe(true);
    const spans = receiver.spans();
    expect(spans).toHaveLength(receipt.retainedSpanCount);
    expect(
      createHash("sha256")
        .update(
          spans
            .map((span) => span.spanId)
            .sort()
            .join("\n"),
        )
        .digest("hex"),
    ).toBe(receipt.spanIdsSha256);
    const receivedRoot = spans.find((span) => span.spanId === receipt.spanId);
    expect(receivedRoot).toBeDefined();
    if (receivedRoot === undefined) return yield* Effect.die("Missing invocation root");
    expect(values(receivedRoot.resource)).toMatchObject({
      "service.name": receipt.service,
      "service.version": receipt.build.version,
      "axm.build.revision": receipt.build.revision,
      "axm.build.dirty": receipt.build.dirty,
      "axm.execution.kind": receipt.build.execution,
      "process.runtime.name": receipt.build.runtime,
      "process.runtime.version": receipt.build.runtimeVersion,
    });
    const expected: TraceExpectation = {
      spans: [
        { name: "axm.cli.operation", count: 1, parentName: "axm.cli.invocation" },
        { name: "axm.observation.phase", count: 1, parentName: "axm.cli.operation" },
      ],
      work: [
        {
          kind: "axm.io.read-file",
          ownerName: "axm.cli.operation",
          count: readCalls,
          executed: readCalls,
          ioBytes: readBytes,
        },
        {
          kind: "axm.hash.package",
          ownerName: "axm.cli.operation",
          count: hashRequests,
          bytes: contentBytes * hashRequests,
        },
        {
          kind: "axm.hash.content",
          ownerName: "axm.cli.operation",
          count: hashRequests,
          bytes: 64 * hashRequests,
        },
        {
          kind: "axm.observation.reuse",
          ownerName: "axm.cli.operation",
          dimensions: { "axm.observation.operation": "read-file" },
          requested: hashRequests,
          executed: 1,
          reused: hashRequests - 1,
        },
      ],
    };
    return { receipt, spans, logs: receiver.logs(), expected };
  });

describe("Local work through the exporter and inspector", () => {
  it.live("accounts exactly for receipt publication with different native identity widths", () =>
    Effect.gen(function* () {
      const native = yield* FileSystem.FileSystem;
      const directory = yield* native.makeTempDirectoryScoped();
      const runtimeDirectory = join(directory, ".axm");
      yield* native.makeDirectory(runtimeDirectory);
      const target = join(runtimeDirectory, "projection-containers.json");
      const captured = yield* captureContainerIdentity({
        nativeRoot: directory,
        target: runtimeDirectory,
      });
      const results: Array<{
        mode: string;
        inode: string;
        beforeBytes: number;
        afterBytes: number;
        readBytes: number;
        writeBytes: number;
        hashBytes: number;
      }> = [];
      for (const mode of ["summary", "detail"]) {
        for (const inode of ["529366", "1312118"]) {
          // These controlled proof values exercise serialization, not native
          // identity authority. Native proof validation has separate owner evidence.
          const identity = { ...captured, entry: { ...captured.entry, inode } };
          const prior: ContainerReceipt = { unit: "before", kind: "created-directory", identity };
          const added: ContainerReceipt = { unit: "added", kind: "created-directory", identity };
          const before =
            JSON.stringify({ version: 1, entries: [prior], createdDirectories: [] }, null, 2) +
            "\n";
          const after =
            JSON.stringify(
              { version: 1, entries: [prior, added], createdDirectories: [] },
              null,
              2,
            ) + "\n";
          const beforeBytes = Buffer.byteLength(before);
          const afterBytes = Buffer.byteLength(after);
          yield* native.writeFileString(target, before);
          const reads: Array<{ target: string; bytes: number }> = [];
          const writes: Array<{ target: string; bytes: number }> = [];
          const observed = observedFileSystem(
            FileSystem.make({
              ...native,
              readFile: (file) =>
                native.readFile(file).pipe(
                  Effect.tap((bytes) =>
                    Effect.sync(() => {
                      reads.push({ target: file, bytes: bytes.byteLength });
                    }),
                  ),
                ),
              writeFile: (file, bytes, options) =>
                native.writeFile(file, bytes, options).pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      writes.push({ target: file, bytes: bytes.byteLength });
                    }),
                  ),
                ),
            }),
          );
          const receiver = yield* localTracingCollector();
          const receiptPath = join(directory, `${mode}-${inode}.json`);
          yield* withLocalTracing(
            runWorkspaceTransaction({
              claimDefaultTargets: false,
              targets: [target],
              transition: Effect.gen(function* () {
                yield* updateContainerReceipts(runtimeDirectory, (entries) => [...entries, added], {
                  // The enclosing transaction owns this single caller. This
                  // test does not exercise competing receipt writers.
                  withLock: (_target, effect) => effect,
                  createDirectory: () => Effect.die("Receipt directory already exists"),
                  retire: () => Effect.die("This publication must not retire entries"),
                  write: (file, content) =>
                    writeFileAtomic(observed, {
                      targetPath: file,
                      content,
                      onPublished: (publication) =>
                        recordFilePublication({ path: file, change: "modified" }, publication),
                      mapError: ({ cause }) => cause,
                    }).pipe(Effect.asVoid),
                });
                expect((yield* readContainerReceipts(runtimeDirectory)).entries).toEqual([
                  prior,
                  added,
                ]);
              }),
              validate: () => Effect.void,
            }).pipe(
              // Substitute only admission/claims; snapshot and publication use
              // the real filesystem and transaction implementation.
              Effect.provide(
                WorkspaceTransactionScopeTest({
                  workspaceDir: runtimeDirectory,
                  settingsPath: join(directory, "axm.json"),
                  lockPath: join(directory, "axm.lock"),
                }),
              ),
              Effect.provideService(FileSystem.FileSystem, observed),
              Effect.withSpan("axm.cli.operation"),
            ),
            {
              AXM_TRACE: "1",
              AXM_TRACE_DETAIL: mode === "detail" ? "io,hash" : "",
              AXM_TRACE_ENDPOINT: receiver.endpoint,
              AXM_TRACE_RECEIPT: receiptPath,
            },
          );
          // Snapshot, receipt decode, published-file verification, final decode.
          expect(reads).toEqual([
            { target, bytes: beforeBytes },
            { target, bytes: beforeBytes },
            { target, bytes: afterBytes },
            { target, bytes: afterBytes },
          ]);
          expect(writes).toHaveLength(1);
          expect(writes[0]?.target.startsWith(target + ".tmp.")).toBe(true);
          expect(writes[0]?.bytes).toBe(afterBytes);
          expect(yield* native.readFileString(target)).toBe(after);
          const readBytes = reads.reduce((total, entry) => total + entry.bytes, 0);
          const writeBytes = writes.reduce((total, entry) => total + entry.bytes, 0);
          // One prior-file hash and two publication hashes (actual and expected).
          const hashBytes = beforeBytes + afterBytes * 2;
          const receipt = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(TraceReceiptSchema),
          )(yield* native.readFileString(receiptPath));
          const inspected = yield* inspectLocalTrace(
            receipt,
            receiverTree(receiver.spans(), receiver.logs()),
            {
              expected: {
                work: [
                  { kind: "axm.io.read-file", count: 4, executed: 4, ioBytes: readBytes },
                  { kind: "axm.io.write-file", count: 1, executed: 1, ioBytes: writeBytes },
                  { kind: "axm.hash.preimage", count: 3, workCount: 3, bytes: hashBytes },
                ],
              },
            },
          );
          expect(inspected.evidence.expectations).toBe("verified");
          results.push({ mode, inode, beforeBytes, afterBytes, readBytes, writeBytes, hashBytes });
        }
      }
      const [summarySix, summarySeven, detailSix, detailSeven] = results;
      if (
        summarySix === undefined ||
        summarySeven === undefined ||
        detailSix === undefined ||
        detailSeven === undefined
      )
        return yield* Effect.die("Missing paired receipt evidence");
      expect(detailSix).toEqual({ ...summarySix, mode: "detail" });
      expect(detailSeven).toEqual({ ...summarySeven, mode: "detail" });
      expect(summarySeven.beforeBytes - summarySix.beforeBytes).toBe(1);
      expect(summarySeven.afterBytes - summarySix.afterBytes).toBe(2);
      expect(summarySeven.readBytes - summarySix.readBytes).toBe(6);
      expect(summarySeven.writeBytes - summarySix.writeBytes).toBe(2);
      expect(summarySeven.hashBytes - summarySix.hashBytes).toBe(5);
      // Exact accounting for this controlled owner does not retrospectively
      // attribute byte differences inside mixed assembled-operation aggregates.
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.live(
    "retains each cache scan and its own physical stat accounting in summary and detail",
    () =>
      Effect.gen(function* () {
        const native = yield* FileSystem.FileSystem;
        const directory = yield* native.makeTempDirectoryScoped();
        const files = ["one", "two", "three"].map((name) => join(directory, name));
        for (const file of files) yield* native.writeFileString(file, "fixture");
        const scans = [
          { trigger: "automatic", files: files.slice(0, 2) },
          { trigger: "automatic", files },
          { trigger: "explicit", files: files.slice(0, 1) },
        ];
        for (const detail of ["", "io"]) {
          const receiver = yield* localTracingCollector();
          const receiptPath = join(directory, detail === "" ? "summary.json" : "detail.json");
          const called: string[] = [];
          const observed = observedFileSystem(
            FileSystem.make({
              ...native,
              stat: (target) =>
                native.stat(target).pipe(Effect.tap(() => Effect.sync(() => called.push(target)))),
            }),
          );
          // Controlled semantic intervals exercise admission and serialization;
          // Registry cache owner tests independently establish production inventory.
          yield* withLocalTracing(
            Effect.forEach(scans, (scan) =>
              Effect.forEach(scan.files, (file) => observed.stat(file)).pipe(
                Effect.withSpan("axm.archive.cache-prune", {
                  attributes: {
                    "axm.cache.prune.trigger": scan.trigger,
                    "axm.cache.entries-scanned": scan.files.length,
                    "axm.cache.entries-removed": 0,
                    "axm.cache.bytes-freed": 0,
                  },
                }),
              ),
            ).pipe(
              Effect.withSpan("axm.archive.admit"),
              Effect.withSpan("axm.operation.phase", {
                attributes: { "axm.operation.phase": "acquisition" },
              }),
            ),
            {
              AXM_TRACE: "1",
              AXM_TRACE_DETAIL: detail,
              AXM_TRACE_ENDPOINT: receiver.endpoint,
              AXM_TRACE_RECEIPT: receiptPath,
            },
          );
          expect(called).toEqual(scans.flatMap((scan) => scan.files));
          const receipt = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(TraceReceiptSchema),
          )(yield* native.readFileString(receiptPath));
          expect(receipt.unrecognizedAttributeCount).toBe(0);
          expect(receipt.producerComplete).toBe(true);
          const spans = receiver.spans();
          const logs = receiver.logs();
          const report = yield* inspectLocalTrace(receipt, receiverTree(spans, logs));
          expect(report.cacheMaintenance).toHaveLength(scans.length);
          expect(new Set(report.cacheMaintenance.map((span) => span.spanId)).size).toBe(
            scans.length,
          );
          expect(spans.filter((span) => span.name === "axm.io.stat")).toHaveLength(
            detail === "io" ? called.length : 0,
          );
          for (const scan of scans) {
            const owner = report.cacheMaintenance.find(
              (span) =>
                span.attributes["axm.cache.prune.trigger"] === scan.trigger &&
                span.attributes["axm.cache.entries-scanned"] === scan.files.length,
            );
            expect(owner).toBeDefined();
            if (owner === undefined)
              return yield* Effect.die("Missing independently expected scan");
            expect(owner.attributes).toMatchObject({
              "axm.outcome": "success",
              "axm.cache.entries-removed": 0,
              "axm.cache.bytes-freed": 0,
            });
            const stats = report.work.filter(
              (row) => row.kind === "axm.io.stat" && row.owner === owner.spanId,
            );
            expect(stats).toHaveLength(1);
            expect(stats[0]).toMatchObject({
              ownerName: "axm.archive.cache-prune",
              count: scan.files.length,
              executed: scan.files.length,
              measurements: {
                "axm.work.executed": {
                  total: scan.files.length,
                  measured: scan.files.length,
                  occurrences: scan.files.length,
                },
              },
            });
          }
          const wrongOwner = spans.find((span) => span.name === "axm.archive.admit");
          const firstOwner = report.cacheMaintenance[0];
          if (wrongOwner === undefined || firstOwner === undefined)
            return yield* Effect.die("Missing owner-control spans");
          let changed = 0;
          const corrupted = logs.map((log) => {
            if (
              log.spanId !== firstOwner.spanId ||
              values(log.attributes)["axm.summary.kind"] !== "axm.io.stat"
            )
              return log;
            changed++;
            return {
              ...log,
              spanId: wrongOwner.spanId,
              attributes: log.attributes.map((attribute) =>
                attribute.key === "axm.summary.owner"
                  ? { ...attribute, value: { stringValue: wrongOwner.spanId } }
                  : attribute,
              ),
            };
          });
          expect(changed).toBe(1);
          expect(
            yield* Effect.flip(
              inspectLocalTrace(
                { ...receipt, aggregateEventsSha256: aggregateDigest(corrupted) },
                receiverTree(spans, corrupted),
              ),
            ),
          ).toMatchObject({ code: "invalid-summary" });
        }
      }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.live("rejects unbounded cache scan attributes without exporting their private values", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped();
      const receiptPath = join(directory, "receipt.json");
      const receiver = yield* localTracingCollector();
      const invalid = [
        { "axm.cache.prune.trigger": "PRIVATE-cache-path" },
        { "axm.cache.prune.trigger": "scheduled" },
        { "axm.cache.entries-scanned": -1 },
        { "axm.cache.entries-removed": 1.5 },
        { "axm.cache.bytes-freed": Number.NaN },
        { "axm.cache.bytes-freed": Number.POSITIVE_INFINITY },
        { "axm.cache.entries-scanned": Number.MAX_SAFE_INTEGER + 1 },
        { "axm.cache.entries-removed": "PRIVATE-cache-value" },
      ];
      yield* withLocalTracing(
        Effect.forEach(invalid, (attributes) => Effect.annotateCurrentSpan(attributes)).pipe(
          Effect.withSpan("axm.archive.cache-prune"),
        ),
        { AXM_TRACE: "1", AXM_TRACE_ENDPOINT: receiver.endpoint, AXM_TRACE_RECEIPT: receiptPath },
      );
      const receipt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(TraceReceiptSchema))(
        yield* fs.readFileString(receiptPath),
      );
      expect(receipt.unrecognizedAttributeCount).toBe(invalid.length);
      expect(receiver.bodies.join("")).not.toContain("PRIVATE-cache");
      const prune = receiver.spans().find((span) => span.name === "axm.archive.cache-prune");
      expect(prune).toBeDefined();
      expect(prune?.attributes.some((attribute) => attribute.key.startsWith("axm.cache."))).toBe(
        false,
      );
      expect(
        yield* Effect.flip(
          inspectLocalTrace(receipt, receiverTree(receiver.spans(), receiver.logs())),
        ),
      ).toMatchObject({ code: "producer-loss" });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.live("preserves owner work units and batch totals separately from span occurrences", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped();
      const receiptPath = join(directory, "receipt.json");
      const groups = [
        { kind: "axm.hash.package", attribute: "axm.work.count" },
        { kind: "axm.registry.request", attribute: "axm.registry.batch-size" },
        { kind: "axm.registry.metadata-batch", attribute: "axm.batch.count" },
        { kind: "axm.archive.admit", attribute: "axm.archive.entries" },
        { kind: "axm.registry.eligibility", attribute: "axm.registry.denied" },
      ];
      // Controlled owner observations prove the aggregation/inspection boundary.
      // Existing owner fixtures separately prove these measurements in production.
      const expected = {
        work: [
          { kind: "axm.hash.package", count: 2, workCount: 8 },
          { kind: "axm.registry.request", count: 2, registryBatchItems: 8 },
          { kind: "axm.registry.metadata-batch", count: 2, batchItems: 8 },
          { kind: "axm.archive.admit", count: 2, archiveEntries: 8 },
          { kind: "axm.registry.eligibility", count: 2, deniedItems: 8 },
        ],
      };
      for (const mode of ["summary", "detail"]) {
        const receiver = yield* localTracingCollector();
        yield* withLocalTracing(
          Effect.forEach(groups, ({ kind, attribute }) =>
            Effect.forEach([3, 5], (units, index) =>
              kind === "axm.hash.package"
                ? withWork(kind, Effect.void, { attributes: { "axm.work.count": units } })
                : Effect.void.pipe(
                    Effect.withSpan(kind, {
                      attributes: { [attribute]: units, "axm.registry.attempt": index + 1 },
                    }),
                  ),
            ),
          ),
          {
            AXM_TRACE: "1",
            AXM_TRACE_DETAIL: mode === "detail" ? "io,hash,reuse" : "",
            AXM_TRACE_ENDPOINT: receiver.endpoint,
            AXM_TRACE_RECEIPT: receiptPath + mode,
          },
        );
        const receipt = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(TraceReceiptSchema),
        )(yield* fs.readFileString(receiptPath + mode));
        const spans = receiver.spans();
        const report = yield* inspectLocalTrace(receipt, receiverTree(spans, receiver.logs()), {
          expected,
        });
        expect(report.evidence.expectations).toBe("verified");
        expect(report.work).toHaveLength(groups.length);
        expect(
          receiver
            .logs()
            .some((log) => values(log.attributes)["axm.registry.attempt"] !== undefined),
        ).toBe(false);
        expect(
          yield* Effect.flip(
            inspectLocalTrace(receipt, receiverTree(spans, receiver.logs()), {
              expected: { work: [{ kind: "axm.registry.request", registryBatchItems: 2 }] },
            }),
          ),
        ).toMatchObject({ code: "expectation-mismatch" });
      }
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
  for (const mode of ["summary", "detail"] as const) {
    it.live(
      `reconciles ${mode} work with real filesystem calls, package bytes, and query reuse`,
      () =>
        Effect.gen(function* () {
          const { receipt, spans, logs, expected } = yield* capture(mode);
          const report = yield* inspectLocalTrace(receipt, receiverTree(spans, logs), { expected });
          expect(report.evidence.expectations).toBe("verified");
          expect(report.evidence.spanIdentityVerified).toBe(true);
          expect(spans.filter((span) => span.name === "axm.io.read-file")).toHaveLength(
            mode === "detail" ? 1 : 0,
          );
        }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
    );
  }
  for (const fault of ["unobserved-read", "missing-owner"] as const) {
    it.live(`refuses complete exported evidence with ${fault}`, () =>
      Effect.gen(function* () {
        const { receipt, spans, logs, expected } = yield* capture("summary", fault);
        const tree = receiverTree(spans, logs);
        expect((yield* inspectLocalTrace(receipt, tree)).evidence.spanIdentityVerified).toBe(true);
        expect(yield* Effect.flip(inspectLocalTrace(receipt, tree, { expected }))).toMatchObject({
          code: "expectation-mismatch",
        });
      }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
    );
  }
  it.live(
    "refuses incorrect reuse accounting even when receipt and received identities match",
    () =>
      Effect.gen(function* () {
        const { receipt, spans, logs, expected } = yield* capture("summary");
        let changed = 0;
        const corrupted = logs.map((log) => {
          const attrs = values(log.attributes);
          if (
            log.name !== "axm.work.summary" ||
            attrs["axm.summary.kind"] !== "axm.observation.reuse" ||
            attrs["axm.observation.operation"] !== "read-file" ||
            attrs["axm.work.reused-count"] !== 1
          )
            return log;
          changed++;
          return {
            ...log,
            attributes: log.attributes.map((attribute) =>
              attribute.key === "axm.work.reused-count"
                ? { ...attribute, value: { intValue: 0 } }
                : attribute,
            ),
          };
        });
        expect(changed).toBe(1);
        const tree = receiverTree(spans, corrupted);
        expect(yield* Effect.flip(inspectLocalTrace(receipt, tree))).toMatchObject({
          code: "identity-mismatch",
        });
        // A producer that actually reported the wrong reuse total has a matching
        // digest; the independently counted lookup still rejects that evidence.
        const resigned = {
          ...receipt,
          aggregateEventsSha256: aggregateDigest(corrupted),
        };
        expect((yield* inspectLocalTrace(resigned, tree)).evidence.aggregateIdentityVerified).toBe(
          true,
        );
        expect(yield* Effect.flip(inspectLocalTrace(resigned, tree, { expected }))).toMatchObject({
          code: "expectation-mismatch",
        });
      }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
