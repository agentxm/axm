import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { withLocalTracing } from "./index.js";
import { localTracingCollector } from "../test-support/local-tracing-collector.js";

export const specification = defineSpecification({
  requirement: "cli/local-tracing-describes-operation-work",
  title: "Local traces nest actual work under its operation",
  statement:
    "An explicitly activated local trace shall represent an invocation and its meaningful operation phases with correctly nested spans, distinguishing actual work from reuse and complete Registry requests from header arrival without reporting every implementation helper.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "The real Effect OTLP exporter sends completed spans to a loopback HTTP receiver.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Local operation traces", () => {
  it.live("flushes nested work and reuses its owner parent across unexported helpers", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const receiver = yield* localTracingCollector();
        let executions = 0;
        const work = Effect.sync(() => {
          executions += 1;
          return "prepared";
        }).pipe(
          Effect.withSpan("axm.archive.admit", { attributes: { "axm.work.count": 1 } }),
          Effect.withSpan("implementation-helper"),
        );
        const program = Effect.gen(function* () {
          const prepared = yield* work;
          yield* Effect.annotateCurrentSpan("axm.work.reused", true);
          return [prepared, prepared];
        }).pipe(Effect.withSpan("axm.publish.prepare"));
        expect(
          yield* withLocalTracing(program, {
            AXM_TRACE: "1",
            AXM_TRACE_ENDPOINT: receiver.endpoint,
          }),
        ).toEqual(["prepared", "prepared"]);
        expect(executions).toBe(1);
        const spans = receiver.spans();
        expect(spans.map((span) => span.name).sort()).toEqual([
          "axm.archive.admit",
          "axm.cli.invocation",
          "axm.publish.prepare",
        ]);
        const root = spans.find((span) => span.name === "axm.cli.invocation");
        const phase = spans.find((span) => span.name === "axm.publish.prepare");
        const actual = spans.find((span) => span.name === "axm.archive.admit");
        expect(root?.parentSpanId).toBeUndefined();
        expect(phase?.parentSpanId).toBe(root?.spanId);
        expect(actual?.parentSpanId).toBe(phase?.spanId);
        expect(new Set(spans.map((span) => span.traceId)).size).toBe(1);
        expect(actual?.attributes).toContainEqual({
          key: "axm.work.count",
          value: { intValue: 1 },
        });
        expect(phase?.attributes).toContainEqual({
          key: "axm.work.reused",
          value: { boolValue: true },
        });
        expect(receiver.headers.every((header) => header["traceparent"] === undefined)).toBe(true);
      }),
    ),
  );
});

// Boundary evidence for the owner span names; request-policy tests govern
// lifetime through success, body failure, and interruption.
it.live("exports nested complete-request and archive-body spans with bounded byte counts", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const receiver = yield* localTracingCollector();
      yield* withLocalTracing(
        Effect.annotateCurrentSpan("axm.archive.bytes", 128).pipe(
          Effect.withSpan("axm.registry.archive-body"),
          Effect.withSpan("axm.registry.attempt"),
          Effect.withSpan("axm.registry.request"),
        ),
        { AXM_TRACE: "1", AXM_TRACE_ENDPOINT: receiver.endpoint },
      );
      const spans = receiver.spans();
      const request = spans.find((span) => span.name === "axm.registry.request");
      const attempt = spans.find((span) => span.name === "axm.registry.attempt");
      const body = spans.find((span) => span.name === "axm.registry.archive-body");
      expect(request).toBeDefined();
      expect(attempt).toBeDefined();
      expect(body).toBeDefined();
      expect(attempt?.parentSpanId).toBe(request?.spanId);
      expect(body?.parentSpanId).toBe(attempt?.spanId);
      expect(body?.attributes).toContainEqual({
        key: "axm.archive.bytes",
        value: { intValue: 128 },
      });
    }),
  ),
);
