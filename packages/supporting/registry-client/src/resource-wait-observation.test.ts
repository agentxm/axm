import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Tracer from "effect/Tracer";
import { makeOperationExtractionBudget } from "./extraction-budget.js";
import {
  BUFFERED_ARCHIVE_RESERVATION_BYTES,
  makeOperationBufferedArchiveBudget,
} from "./buffered-archive-budget.js";

// The real budget is exercised with gated work; no wall-clock scheduling assumption.
for (const kind of ["extraction", "buffered-archive"] as const) {
  it.effect(`${kind} returns its permit when cancelled exactly as admission ends`, () =>
    Effect.gen(function* () {
      const run =
        kind === "extraction"
          ? (yield* makeOperationExtractionBudget(1)).withExtraction
          : (yield* makeOperationBufferedArchiveBudget(BUFFERED_ARCHIVE_RESERVATION_BYTES))
              .withBufferedArchive;
      let executed = false;
      let ends = 0;
      const victim = yield* Effect.withFiber((fiber) =>
        run(
          Effect.sync(() => {
            executed = true;
          }),
        ).pipe(
          Effect.withTracer(
            Tracer.make({
              span(options) {
                const span = new Tracer.NativeSpan(options);
                const end = span.end.bind(span);
                if (span.name === `axm.wait.${kind}`)
                  span.end = (time, exit) => {
                    end(time, exit);
                    ends += 1;
                    fiber.interruptUnsafe();
                  };
                return span;
              },
            }),
          ),
          Effect.withTracerEnabled(true),
        ),
      ).pipe(Effect.forkChild);
      expect(Exit.hasInterrupts(yield* Fiber.await(victim))).toBe(true);
      expect(executed).toBe(false);
      expect(ends).toBe(1);
      const probe = yield* run(Effect.succeed("available")).pipe(
        Effect.forkChild({ startImmediately: true }),
      );
      expect(probe.pollUnsafe()).toEqual(Exit.succeed("available"));
    }),
  );
  for (const interrupt of [false, true]) {
    it.effect(
      `${kind} distinguishes admission from work and releases interrupted waits (${interrupt})`,
      () =>
        Effect.gen(function* () {
          const run =
            kind === "extraction"
              ? (yield* makeOperationExtractionBudget(1)).withExtraction
              : (yield* makeOperationBufferedArchiveBudget(BUFFERED_ARCHIVE_RESERVATION_BYTES))
                  .withBufferedArchive;
          const spans: Tracer.NativeSpan[] = [];
          const tracer = Tracer.make({
            span(options) {
              const span = new Tracer.NativeSpan(options);
              spans.push(span);
              return span;
            },
          });
          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          let secondExecuted = false;
          yield* Effect.gen(function* () {
            const first = yield* run(
              Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release))),
            ).pipe(Effect.forkChild({ startImmediately: true }));
            yield* Deferred.await(started);
            const second = yield* run(
              Effect.sync(() => {
                secondExecuted = true;
              }),
            ).pipe(Effect.forkChild({ startImmediately: true }));
            const waits = spans.filter((span) => span.name === `axm.wait.${kind}`);
            expect(waits).toHaveLength(2);
            expect(waits[0]?.status._tag).toBe("Ended");
            expect(waits[1]?.status._tag).toBe("Started");
            expect(secondExecuted).toBe(false);
            if (interrupt) yield* Fiber.interrupt(second);
            yield* Deferred.succeed(release, undefined);
            yield* Fiber.join(first);
            if (!interrupt) yield* Fiber.join(second);
            expect(secondExecuted).toBe(!interrupt);
            expect(waits[1]?.status._tag).toBe("Ended");
            if (waits[1]?.status._tag === "Ended")
              expect(waits[1].status.exit._tag).toBe(interrupt ? "Failure" : "Success");
            // A canceled waiter must not consume capacity and strand later work.
            expect(yield* run(Effect.succeed("available"))).toBe("available");
          }).pipe(Effect.withTracer(tracer), Effect.withTracerEnabled(true));
        }),
    );
  }
}
