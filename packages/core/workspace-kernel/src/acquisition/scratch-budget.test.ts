import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Tracer from "effect/Tracer";
import { makeOperationScratchBudget } from "./scratch-budget.js";

for (const outcome of ["released", "interrupted"] as const) {
  it.effect(`attributes scratch admission waits through ${outcome}`, () =>
    Effect.gen(function* () {
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      yield* Effect.gen(function* () {
        const budget = yield* makeOperationScratchBudget(6);
        const first = yield* budget.reserve(3);
        const second = yield* budget.reserve(3);
        let admitted = false;
        const waiter = yield* Effect.scoped(
          budget.reserve(4).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                admitted = true;
              }),
            ),
          ),
        ).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        const wait = spans.find((span) => span.name === "axm.wait.scratch-budget");
        expect(admitted).toBe(false);
        expect(wait?.status._tag).toBe("Started");
        expect(wait?.attributes.get("axm.wait.requested-bytes")).toBe(4);
        // The first wake cannot admit four bytes; it must not close or duplicate the wait.
        yield* first.settle(2);
        yield* Effect.yieldNow;
        expect(admitted).toBe(false);
        expect(wait?.status._tag).toBe("Started");
        expect(spans.filter((span) => span.name === "axm.wait.scratch-budget")).toHaveLength(1);
        if (outcome === "released") {
          yield* second.settle(0);
          yield* Fiber.join(waiter);
        } else {
          yield* Fiber.interrupt(waiter);
          yield* second.settle(0);
        }
        expect(admitted).toBe(outcome === "released");
        expect(wait?.status._tag).toBe("Ended");
        if (wait?.status._tag === "Ended")
          expect(wait.status.exit._tag).toBe(outcome === "released" ? "Success" : "Failure");
        yield* Effect.scoped(budget.reserve(4));
        expect(spans.filter((span) => span.name === "axm.wait.scratch-budget")).toHaveLength(1);
      }).pipe(Effect.withTracer(tracer));
    }).pipe(Effect.scoped),
  );
}
