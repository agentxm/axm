import { describe, expect, it } from "@effect/vitest";
import {
  CurrentWorkObserver,
  withWork,
  type WorkFact,
} from "@agentxm/host-primitives/work-observation";
import {
  publishPhaseStarted,
  publishWaiting,
  publishWaitEnded,
} from "@agentxm/workspace-kernel/operations";
import * as Deferred from "effect/Deferred";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Tracer from "effect/Tracer";
import { withLiveOperation } from "../operation-lifecycle.js";
import { TestRenderer } from "../test-support/presenter-test.js";
import { TraceInvocation, type InvocationTraceAttributes } from "./trace-invocation.js";

const recording = () => {
  const spans: Tracer.NativeSpan[] = [];
  const attributes: InvocationTraceAttributes[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  return { spans, attributes, tracer };
};

describe("Lifecycle trace projection", () => {
  it.effect(
    "projects waits without inventing phase ownership from asynchronous notifications",
    () =>
      Effect.gen(function* () {
        const recorded = recording();
        const renderer = TestRenderer.make();
        yield* withLiveOperation(
          {
            name: "private-registry-host/private-extension",
            mode: "preview",
            successOutcome: "previewed",
          },
          Effect.gen(function* () {
            yield* publishPhaseStarted("planning");
            yield* publishPhaseStarted("confirmation");
            yield* publishWaiting({
              blockingClass: "human-required",
              subject: "private-subject",
              detail: "private-detail",
            });
            yield* publishWaitEnded("private-subject");
            yield* publishPhaseStarted("verification");
          }),
        ).pipe(
          Effect.provide(renderer.layer),
          Effect.provideService(TraceInvocation, (attributes) =>
            recorded.attributes.push(attributes),
          ),
          Effect.withTracer(recorded.tracer),
        );
        const operation = recorded.spans.find((span) => span.name === "axm.cli.operation");
        const phases = recorded.spans.filter((span) => span.name === "axm.operation.phase");
        const waits = recorded.spans.filter((span) => span.name === "axm.operation.wait");
        expect(phases).toEqual([]);
        expect(waits).toHaveLength(1);
        expect(waits[0]?.attributes.get("axm.wait.class")).toBe("human-required");
        for (const span of [...phases, ...waits]) {
          expect(span.parent).toEqual(expect.objectContaining({ value: operation }));
          expect(span.status._tag).toBe("Ended");
        }
        expect(recorded.attributes).toContainEqual({ "axm.operation.outcome": "previewed" });
        expect(
          JSON.stringify(
            recorded.spans.map((span) => ({ name: span.name, attributes: [...span.attributes] })),
          ),
        ).not.toContain("private");
      }),
  );

  it.effect(
    "keeps actual phase work parented and closes its interval and wait on interruption",
    () =>
      Effect.gen(function* () {
        const recorded = recording();
        const work: Array<{ fact: WorkFact; parent: Tracer.AnySpan | undefined }> = [];
        const renderer = TestRenderer.make();
        const ready = yield* Deferred.make<void>();
        const fiber = yield* withLiveOperation(
          { name: "private-operation", mode: "apply" },
          Effect.gen(function* () {
            yield* publishPhaseStarted("acquisition");
            yield* publishWaiting({
              blockingClass: "external-blocked",
              subject: "private-subject",
              detail: "private-detail",
            });
            return yield* withWork(
              "axm.io.read-file",
              Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never)),
              { attributes: { "axm.work.executed": 1 } },
            );
          }).pipe(
            Effect.withSpan("axm.operation.phase", {
              attributes: { "axm.operation.phase": "acquisition" },
            }),
          ),
        ).pipe(
          Effect.provide(renderer.layer),
          Effect.provideService(TraceInvocation, (attributes) =>
            recorded.attributes.push(attributes),
          ),
          Effect.provideService(CurrentWorkObserver, {
            record: (fact, parent) => work.push({ fact, parent }),
            detailSelected: () => false,
          }),
          Effect.withTracer(recorded.tracer),
          Effect.withTracerEnabled(true),
          Effect.forkChild,
        );
        yield* Deferred.await(ready);
        yield* Fiber.interrupt(fiber);
        const intervals = recorded.spans.filter(
          (span) => span.name === "axm.operation.phase" || span.name === "axm.operation.wait",
        );
        expect(intervals).toHaveLength(2);
        for (const span of intervals) {
          expect(span.status._tag).toBe("Ended");
        }
        const phase = intervals.find((span) => span.name === "axm.operation.phase");
        const wait = intervals.find((span) => span.name === "axm.operation.wait");
        expect(wait?.attributes.get("axm.outcome")).toBe("interrupted");
        expect(
          phase?.status._tag === "Ended" &&
            Exit.isFailure(phase.status.exit) &&
            Cause.hasInterruptsOnly(phase.status.exit.cause),
        ).toBe(true);
        expect(work).toHaveLength(1);
        expect(work[0]?.parent).toBe(phase);
        expect(work[0]?.fact.outcome).toBe("interrupted");
        expect(recorded.spans.some((span) => span.name === "axm.io.read-file")).toBe(false);
        expect(recorded.attributes).toContainEqual({ "axm.operation.outcome": "interrupted" });
      }),
  );

  it.effect("does not attach the diagnostic observer while tracing is disabled", () =>
    Effect.gen(function* () {
      const recorded = recording();
      const renderer = TestRenderer.make();
      yield* withLiveOperation(
        { name: "private-operation", mode: "query" },
        publishPhaseStarted("planning"),
      ).pipe(Effect.provide(renderer.layer), Effect.withTracer(recorded.tracer));
      expect(recorded.spans.filter((span) => span.name === "axm.operation.phase")).toHaveLength(0);
    }),
  );
});
