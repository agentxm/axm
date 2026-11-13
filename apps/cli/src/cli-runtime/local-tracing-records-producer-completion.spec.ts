import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { captureWork } from "@agentxm/host-primitives/work-observation";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import {
  withLocalTracing,
  LocalTraceExporter,
  TraceReceiptSchema,
  TraceReceiptDocumentSchema,
  traceSpanIdsSha256,
  traceAggregateEventsSha256,
} from "./index.js";
import { localTracingCollector } from "../test-support/local-tracing-collector.js";
import { annotateInvocationTrace } from "./trace-invocation.js";

export const specification = defineSpecification({
  requirement: "cli/local-tracing-records-producer-completion",
  title: "Diagnostic receipts distinguish completed production from trace identity",
  statement:
    "An explicitly requested local trace receipt shall identify disabled or incomplete capture and completed production with its admitted command route and exact retained span set, explicit detail selection and complete aggregate payload multiset separately from product success and collector delivery, recording diagnostic losses without changing the product outcome.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "The real OTLP exporter sends to a loopback receiver and the invocation owns a real exclusive receipt file.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Completed producer receipts", () => {
  it.live("refuses completion while a captured native observation remains unfinished", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.promise(() => mkdtemp(join(tmpdir(), "axm-unfinished-work-"))),
          (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
        );
        const receiver = yield* localTracingCollector();
        const receipt = join(directory, "receipt.json");
        expect(
          yield* withLocalTracing(
            Effect.gen(function* () {
              const capture = yield* captureWork;
              if (capture === undefined) return yield* Effect.die("Missing active observer");
              capture.begin("axm.native.lock-io", { attributes: { "axm.work.executed": 1 } });
              return 42;
            }),
            { AXM_TRACE: "1", AXM_TRACE_ENDPOINT: receiver.endpoint, AXM_TRACE_RECEIPT: receipt },
          ),
        ).toBe(42);
        const actual = Schema.decodeUnknownSync(Schema.fromJsonString(TraceReceiptSchema))(
          yield* Effect.promise(() => readFile(receipt, "utf8")),
        );
        expect(actual.producerComplete).toBe(false);
        expect(actual.aggregateEventCount).toBe(0);
        expect(receiver.logs()).toEqual([]);
      }),
    ),
  );
  it.live("does not start product work when interrupted during exporter construction", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.promise(() => mkdtemp(join(tmpdir(), "axm-capture-interrupted-"))),
          (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
        );
        const receipt = join(directory, "receipt.json");
        const constructing = yield* Deferred.make<void>();
        let productExecutions = 0;
        const child = yield* withLocalTracing(
          Effect.sync(() => ++productExecutions),
          {
            AXM_TRACE: "1",
            AXM_TRACE_RECEIPT: receipt,
          },
        ).pipe(
          Effect.provideService(LocalTraceExporter, () =>
            Deferred.succeed(constructing, undefined).pipe(Effect.andThen(Effect.never)),
          ),
          Effect.forkScoped,
        );
        yield* Deferred.await(constructing);
        yield* Fiber.interrupt(child);
        expect(productExecutions).toBe(0);
        expect(
          Schema.decodeUnknownSync(Schema.fromJsonString(TraceReceiptDocumentSchema))(
            yield* Effect.promise(() => readFile(receipt, "utf8")),
          ),
        ).toEqual({ schemaVersion: 2, service: "axm", captureState: "starting" });
      }),
    ),
  );
  it.live(
    "records exporter construction failure at its service boundary while the product still executes once",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* Effect.acquireRelease(
            Effect.promise(() => mkdtemp(join(tmpdir(), "axm-capture-setup-"))),
            (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
          );
          const receipt = join(directory, "receipt.json");
          let productExecutions = 0;
          expect(
            yield* withLocalTracing(
              Effect.sync(() => ++productExecutions),
              {
                AXM_TRACE: "1",
                AXM_TRACE_RECEIPT: receipt,
              },
            ).pipe(
              Effect.provideService(LocalTraceExporter, () =>
                Effect.die("PRIVATE_EXPORTER_FAILURE"),
              ),
            ),
          ).toBe(1);
          expect(productExecutions).toBe(1);
          const text = yield* Effect.promise(() => readFile(receipt, "utf8"));
          expect(
            Schema.decodeUnknownSync(Schema.fromJsonString(TraceReceiptDocumentSchema))(text),
          ).toEqual({
            schemaVersion: 2,
            service: "axm",
            captureState: "setup-failed",
          });
          expect(text).not.toContain("PRIVATE_EXPORTER_FAILURE");
        }),
      ),
  );
  it.live(
    "records disabled and rejected activation without exporter traffic or changed product results",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* Effect.acquireRelease(
            Effect.promise(() => mkdtemp(join(tmpdir(), "axm-capture-state-"))),
            (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
          );
          const receiver = yield* localTracingCollector();
          for (const [captureState, activation, endpoint] of [
            ["disabled", "0", receiver.endpoint],
            ["invalid-endpoint", "1", receiver.endpoint + "?PRIVATE"],
          ]) {
            const receipt = join(directory, String(captureState) + ".json");
            expect(
              yield* withLocalTracing(Effect.succeed(42), {
                AXM_TRACE: activation,
                AXM_TRACE_ENDPOINT: endpoint,
                AXM_TRACE_RECEIPT: receipt,
              }),
            ).toBe(42);
            const actual = Schema.decodeUnknownSync(
              Schema.fromJsonString(TraceReceiptDocumentSchema),
            )(yield* Effect.promise(() => readFile(receipt, "utf8")));
            expect(actual).toEqual({ schemaVersion: 2, service: "axm", captureState });
          }
          expect(receiver.bodies).toHaveLength(0);
        }),
      ),
  );
  it.live(
    "reconciles the final receipt with decoded wire span identities and command aggregates",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* Effect.acquireRelease(
            Effect.promise(() => mkdtemp(join(tmpdir(), "axm-observation-proof-"))),
            (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
          );
          const receiver = yield* localTracingCollector();
          const receipt = join(directory, "receipt.json");
          yield* withLocalTracing(
            annotateInvocationTrace({ "axm.command.route": "list" }).pipe(
              Effect.withSpan("axm.cli.command"),
            ),
            {
              AXM_TRACE: "1",
              AXM_TRACE_ENDPOINT: receiver.endpoint,
              AXM_TRACE_RECEIPT: receipt,
              AXM_TRACE_BUILD_REVISION: "1234567890123456789012345678901234567890",
              AXM_TRACE_BUILD_DIRTY: "1",
            },
            { commandRoutes: ["list"] },
          );
          const actual = Schema.decodeUnknownSync(Schema.fromJsonString(TraceReceiptSchema))(
            yield* Effect.promise(() => readFile(receipt, "utf8")),
          );
          const received = receiver.spans();
          expect(actual.commandRoute).toBe("list");
          expect(
            received.find((span) => span.name === "axm.cli.invocation")?.attributes,
          ).toContainEqual({
            key: "axm.command.route",
            value: { stringValue: "list" },
          });
          expect(actual.producerComplete).toBe(true);
          expect(actual.retainedSpanCount).toBe(received.length);
          expect(actual.spanIdsSha256).toBe(
            traceSpanIdsSha256(received.map((span) => span.spanId)),
          );
          const aggregates = receiver.logs();
          expect(aggregates).toHaveLength(1);
          expect(aggregates[0]?.attributes).toContainEqual({
            key: "axm.summary.kind",
            value: { stringValue: "axm.cli.command" },
          });
          expect(aggregates[0]?.attributes).toContainEqual({
            key: "axm.command.route",
            value: { stringValue: "list" },
          });
          expect(actual.aggregateEventCount).toBe(aggregates.length);
          const scalar = Schema.decodeUnknownSync(
            Schema.Union([Schema.String, Schema.Number, Schema.Boolean]),
          );
          expect(actual.aggregateEventsSha256).toBe(
            traceAggregateEventsSha256(
              aggregates.map(
                (log) =>
                  new Map(
                    log.attributes.map(({ key, value }) => [
                      key,
                      scalar(
                        value["stringValue"] ??
                          value["boolValue"] ??
                          value["intValue"] ??
                          value["doubleValue"],
                      ),
                    ]),
                  ),
              ),
            ),
          );
          expect(actual.droppedSpanCount).toBe(0);
          expect(actual.droppedAggregateEventCount).toBe(0);
          expect(actual.unrecognizedSpanCount).toBe(0);
          expect(actual.unrecognizedAttributeCount).toBe(0);
          expect(actual.summaryOverflowCount).toBe(0);
          expect(actual.build).toMatchObject({
            revision: "1234567890123456789012345678901234567890",
            dirty: true,
            execution: "source",
          });
          expect(received[0]?.resource).toContainEqual({
            key: "axm.build.revision",
            value: { stringValue: actual.build.revision },
          });
          expect(actual.timings).not.toBeNull();
          if (actual.timings === null)
            return yield* Effect.die("Missing completed timing evidence");
          expect(actual.timings.runtimeElapsedAtExecutionEndMillis).toBeGreaterThanOrEqual(
            actual.timings.startupMillis,
          );
          expect(actual.timings.executionMillis).toBeGreaterThanOrEqual(0);
          expect(actual.timings.exportFinalizationMillis).toBeGreaterThanOrEqual(0);
        }),
      ),
  );

  for (const owner of ["axm.unadmitted-private-operand", "AuthClient.unadmitted-private-operand"])
    it.live(
      `records unadmitted owner ${owner.split(".")[0]} without exporting its private name`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const directory = yield* Effect.acquireRelease(
              Effect.promise(() => mkdtemp(join(tmpdir(), "axm-observation-proof-"))),
              (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
            );
            const receiver = yield* localTracingCollector();
            const receipt = join(directory, "receipt.json");
            expect(
              yield* withLocalTracing(Effect.succeed(42).pipe(Effect.withSpan(owner)), {
                AXM_TRACE: "1",
                AXM_TRACE_ENDPOINT: receiver.endpoint,
                AXM_TRACE_RECEIPT: receipt,
              }),
            ).toBe(42);
            const actual = Schema.decodeUnknownSync(Schema.fromJsonString(TraceReceiptSchema))(
              yield* Effect.promise(() => readFile(receipt, "utf8")),
            );
            expect(actual.unrecognizedSpanCount).toBe(1);
            expect(receiver.bodies.join("")).not.toContain("unadmitted-private-operand");
          }),
        ),
    );

  it.live("refuses silent producer attribute drift without exporting rejected keys or values", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.promise(() => mkdtemp(join(tmpdir(), "axm-attribute-proof-"))),
          (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
        );
        const receiver = yield* localTracingCollector();
        const receipt = join(directory, "receipt.json");
        yield* withLocalTracing(
          Effect.annotateCurrentSpan({
            "axm.private-unrecognized": "PRIVATE_VALUE",
            "axm.work.count": -1,
            "axm.command.route": "private-customer-route",
          }).pipe(Effect.withSpan("axm.publish.file")),
          {
            AXM_TRACE: "1",
            AXM_TRACE_ENDPOINT: receiver.endpoint,
            AXM_TRACE_RECEIPT: receipt,
          },
        );
        const actual = Schema.decodeUnknownSync(Schema.fromJsonString(TraceReceiptSchema))(
          yield* Effect.promise(() => readFile(receipt, "utf8")),
        );
        expect(actual.unrecognizedAttributeCount).toBe(3);
        expect(receiver.bodies.join("")).not.toContain("PRIVATE_VALUE");
        expect(receiver.bodies.join("")).not.toContain("private-customer-route");
        expect(receiver.bodies.join("")).not.toContain("axm.private-unrecognized");
      }),
    ),
  );
});
