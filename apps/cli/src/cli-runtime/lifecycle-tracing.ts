import {
  subscribeLossless,
  type OperationLifecycleService,
} from "@agentxm/workspace-kernel/operations";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import * as Tracer from "effect/Tracer";
import { TraceInvocation } from "./trace-invocation.js";

/** A projection of existing lifecycle facts; never an alternative lifecycle owner. */
export const observeLifecycleForTracing = (
  lifecycle: OperationLifecycleService,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const annotateInvocation = yield* TraceInvocation;
    if (annotateInvocation === undefined) return;
    const tracer = yield* Tracer.Tracer;
    const parent = yield* Effect.option(Effect.currentSpan);
    const clock = yield* Clock.Clock;
    const waits = new Map<string, Tracer.Span>();
    const start = (name: string, attributes: Record<string, string>, atMs: number) => {
      const eventTime = BigInt(Math.trunc(atMs)) * 1_000_000n;
      const parentTime =
        Option.isSome(parent) && parent.value._tag === "Span"
          ? parent.value.status.startTime
          : eventTime;
      const span = tracer.span({
        name,
        parent,
        annotations: Context.empty(),
        links: [],
        // Lifecycle timestamps have millisecond resolution; rounding cannot
        // place an interval before the operation that produced the event.
        startTime: eventTime < parentTime ? parentTime : eventTime,
        kind: "internal",
        root: false,
        sampled: true,
      });
      for (const [key, value] of Object.entries(attributes)) span.attribute(key, value);
      return span;
    };
    const finish = (
      span: Tracer.Span | undefined,
      at: bigint,
      outcome?: "failure" | "interrupted",
    ) => {
      if (span === undefined || span.status._tag === "Ended") return;
      if (outcome !== undefined) span.attribute("axm.outcome", outcome);
      span.end(at < span.status.startTime ? span.status.startTime : at, Exit.void);
    };
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        const now = clock.currentTimeNanosUnsafe();
        for (const span of waits.values()) finish(span, now, "interrupted");
        waits.clear();
      }),
    );
    yield* subscribeLossless(lifecycle, (event) =>
      Effect.sync(() => {
        const at = BigInt(Math.trunc(event.atMs)) * 1_000_000n;
        switch (event._tag) {
          case "OperationStarted":
            annotateInvocation({ "axm.operation.mode": event.mode });
            if (Option.isSome(parent) && parent.value._tag === "Span")
              parent.value.attribute("axm.operation.mode", event.mode);
            break;
          case "PhaseStarted":
            // Phase intervals and causal context belong to the executing
            // effect. An asynchronous notification cannot establish either.
            break;
          case "Waiting":
            // Subjects only correlate local starts/ends; they never enter telemetry.
            finish(waits.get(event.subject), at);
            waits.set(
              event.subject,
              start("axm.operation.wait", { "axm.wait.class": event.blockingClass }, event.atMs),
            );
            break;
          case "WaitEnded":
            finish(waits.get(event.subject), at);
            waits.delete(event.subject);
            break;
          case "OperationSettled": {
            annotateInvocation({ "axm.operation.outcome": event.outcome });
            if (Option.isSome(parent) && parent.value._tag === "Span")
              parent.value.attribute("axm.operation.outcome", event.outcome);
            const outcome =
              event.outcome === "interrupted"
                ? "interrupted"
                : event.outcome === "failed" ||
                    event.outcome === "partial" ||
                    event.outcome === "blocked"
                  ? "failure"
                  : undefined;
            for (const span of waits.values()) finish(span, at, outcome);
            waits.clear();
            break;
          }
        }
      }),
    );
  });
