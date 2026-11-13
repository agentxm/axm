import { withWork } from "@agentxm/host-primitives/work-observation";
import { parseZipCentralDirectory } from "@agentxm/extension-content";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as References from "effect/References";
import { observedFileSystem, withLocalTracing } from "./index.js";
import { localTracingCollector } from "../test-support/local-tracing-collector.js";

export const specification = defineSpecification({
  requirement: "cli/local-tracing-summarizes-work",
  title: "Default summaries preserve work accounting as item counts grow",
  statement:
    "Local tracing shall aggregate completed work by stable operation ownership and bounded semantic dimensions, preserving exact counts, known measured totals and measurement coverage in summary and explicitly selected detail modes without constructing per-occurrence summary spans or allocating a summary group for every repeated item.",
  class: "quality",
  characteristic: "performance",
  role: "experience",
  goals: ["actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "The real exporter sends observed filesystem-port calls to a loopback OTLP receiver; independent adapter records own the expected calls and bytes.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Work summary scaling", () => {
  it.live("connects portable archive facts to their executing owner without primitive spans", () =>
    Effect.scoped(
      Effect.gen(function* () {
        // A stored ZIP containing hello.txt; exercise the public parser and its real completion fact.
        const archive = Buffer.from(
          "UEsDBBQAAAAAAAAAIVyGphA2BQAAAAUAAAAJAAAAaGVsbG8udHh0aGVsbG9QSwECFAMUAAAAAAAAACFchqYQNgUAAAAFAAAACQAAAAAAAAAAAAAAgAEAAAAAaGVsbG8udHh0UEsFBgAAAAABAAEANwAAACwAAAAAAA==",
          "base64",
        );
        for (const detail of ["", "parse"]) {
          const receiver = yield* localTracingCollector();
          const entries = yield* withLocalTracing(
            parseZipCentralDirectory(archive).pipe(
              Effect.withSpan("axm.operation.phase", {
                attributes: { "axm.operation.phase": "planning" },
              }),
            ),
            { AXM_TRACE: "1", AXM_TRACE_ENDPOINT: receiver.endpoint, AXM_TRACE_DETAIL: detail },
          );
          expect(entries.map((entry) => entry.fileName)).toEqual(["hello.txt"]);
          expect(receiver.spans().some((span) => span.name === "axm.archive.parse")).toBe(false);
          const phase = receiver.spans().find((span) => span.name === "axm.operation.phase");
          const aggregate = receiver
            .logs()
            .find((log) =>
              log.attributes.some(
                ({ key, value }) =>
                  key === "axm.summary.kind" && value["stringValue"] === "axm.archive.parse",
              ),
            );
          expect(phase).toBeDefined();
          expect(aggregate?.spanId).toBe(phase?.spanId);
          expect(aggregate?.attributes).toContainEqual({
            key: "axm.summary.count",
            value: { intValue: 1 },
          });
          expect(aggregate?.attributes).toContainEqual({
            key: "axm.archive.entries",
            value: { intValue: 1 },
          });
        }
      }),
    ),
  );

  it.live("selects detail before recording only the requested category and executing phase", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const receiver = yield* localTracingCollector();
        yield* withLocalTracing(
          Effect.gen(function* () {
            yield* Effect.gen(function* () {
              yield* withWork("axm.io.read-file", Effect.void, {
                attributes: { "axm.work.executed": 1, "axm.io.bytes": 3 },
              });
              yield* withWork("axm.hash.content", Effect.void, {
                attributes: { "axm.work.count": 1, "axm.work.bytes": 3 },
              });
            }).pipe(
              Effect.withSpan("axm.operation.phase", {
                attributes: { "axm.operation.phase": "planning" },
              }),
            );
            yield* withWork("axm.io.read-file", Effect.void, {
              attributes: { "axm.work.executed": 1, "axm.io.bytes": 4 },
            });
          }),
          {
            AXM_TRACE: "1",
            AXM_TRACE_ENDPOINT: receiver.endpoint,
            AXM_TRACE_DETAIL: "io",
            AXM_TRACE_DETAIL_PHASE: "planning",
          },
        );
        const spans = receiver.spans();
        const phase = spans.find((span) => span.name === "axm.operation.phase");
        const details = spans.filter((span) => span.name === "axm.io.read-file");
        expect(details).toHaveLength(1);
        expect(details[0]?.parentSpanId).toBe(phase?.spanId);
        expect(spans.some((span) => span.name === "axm.hash.content")).toBe(false);
        const totals = receiver
          .logs()
          .filter((record) =>
            record.attributes.some(
              (attribute) =>
                attribute.key === "axm.summary.kind" &&
                attribute.value["stringValue"] === "axm.io.read-file",
            ),
          );
        expect(totals).toHaveLength(2);
        expect(
          totals
            .flatMap((record) =>
              record.attributes.filter((attribute) => attribute.key === "axm.io.bytes"),
            )
            .map((attribute) => attribute.value["intValue"])
            .sort(),
        ).toEqual([3, 4]);
      }),
    ),
  );
  it.live("retains known partial measurements when ordinary logging is disabled", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const receiver = yield* localTracingCollector();
        yield* withLocalTracing(
          Effect.gen(function* () {
            yield* Effect.void.pipe((effect) =>
              withWork("axm.hash.package", effect, {
                attributes: { "axm.work.count": 1, "axm.work.bytes": 10 },
              }),
            );
            yield* Effect.void.pipe((effect) =>
              withWork("axm.hash.package", effect, { attributes: { "axm.work.count": 1 } }),
            );
          }),
          { AXM_TRACE: "1", AXM_TRACE_ENDPOINT: receiver.endpoint },
        ).pipe(Effect.provideService(References.MinimumLogLevel, "None"));
        const summary = receiver.logs().find((span) => span.name === "axm.work.summary");
        expect(summary?.attributes).toContainEqual({
          key: "axm.summary.count",
          value: { intValue: 2 },
        });
        expect(summary?.attributes).toContainEqual({
          key: "axm.work.count",
          value: { intValue: 2 },
        });
        expect(summary?.attributes).toContainEqual({
          key: "axm.work.bytes",
          value: { intValue: 10 },
        });
        expect(summary?.attributes).toContainEqual({
          key: "axm.measured.work.bytes",
          value: { intValue: 1 },
        });
      }),
    ),
  );
  for (const size of [1, 10, 50])
    it.live(`reconciles ${size} repeated publication items in both modes`, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const observed: Array<Readonly<Record<string, number>>> = [];
          for (const mode of ["summary", "detail"]) {
            const receiver = yield* localTracingCollector();
            const writes: Uint8Array[] = [];
            const reads: string[] = [];
            const content = new TextEncoder().encode("fixture");
            const fs = observedFileSystem(
              FileSystem.makeNoop({
                readFile: (file) =>
                  Effect.sync(() => {
                    reads.push(file);
                    return content;
                  }),
                writeFile: (_file, bytes) =>
                  Effect.sync(() => {
                    writes.push(bytes);
                  }),
              }),
            );
            yield* withLocalTracing(
              Effect.forEach(
                Array.from({ length: size }, (_, index) => index),
                (index) =>
                  Effect.gen(function* () {
                    const bytes = yield* fs.readFile("private-input-" + index);
                    yield* fs.writeFile("private-output-" + index, bytes);
                  }).pipe(Effect.withSpan("axm.publish.file")),
              ).pipe(Effect.withSpan("axm.cli.operation")),
              {
                AXM_TRACE: "1",
                AXM_TRACE_DETAIL: mode === "detail" ? "io" : "",
                AXM_TRACE_ENDPOINT: receiver.endpoint,
              },
            );
            const summaries = receiver.logs().filter((span) => span.name === "axm.work.summary");
            const totals: Record<string, number> = {};
            for (const summary of summaries) {
              const kind = summary.attributes.find((a) => a.key === "axm.summary.kind")?.value[
                "stringValue"
              ];
              if (typeof kind !== "string") return yield* Effect.die("Missing summary kind");
              for (const name of ["axm.work.executed", "axm.io.bytes"]) {
                const value =
                  summary.attributes.find((a) => a.key === name)?.value["intValue"] ?? 0;
                if (typeof value !== "number") return yield* Effect.die("Invalid work counter");
                totals[kind + "/" + name] = (totals[kind + "/" + name] ?? 0) + value;
              }
            }
            expect(reads).toHaveLength(size);
            expect(writes).toHaveLength(size);
            expect(totals["axm.io.read-file/axm.work.executed"]).toBe(reads.length);
            expect(totals["axm.io.write-file/axm.work.executed"]).toBe(writes.length);
            expect(totals["axm.io.write-file/axm.io.bytes"]).toBe(
              writes.reduce((sum, bytes) => sum + bytes.byteLength, 0),
            );
            // One group per kind/owner, independent of each file's private identity.
            expect(summaries).toHaveLength(4);
            expect(receiver.bodies.join("")).not.toContain("private-input-");
            expect(receiver.bodies.join("")).not.toContain("private-output-");
            observed.push(totals);
          }
          expect(observed[0]).toEqual(observed[1]);
        }),
      ),
    );
});
