import { describe, expect, it } from "@effect/vitest";
import * as TestClock from "effect/testing/TestClock";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as Tracer from "effect/Tracer";

import { makeOperationRequestBudget } from "./request-budget.js";

describe("OperationRequestBudget", () => {
  for (const boundary of ["origin", "invocation"] as const) {
    it.effect(`keeps queued work admissible when cancelled at ${boundary} acquisition`, () =>
      Effect.gen(function* () {
        const budget = yield* makeOperationRequestBudget({
          invocation: 1,
          origin: boundary === "origin" ? 1 : 3,
        });
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const origin = "https://registry.example.test";
        const holder = yield* budget
          .withAttempt(
            origin,
            Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release))),
          )
          .pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.await(started);
        let executed = false;
        let ends = 0;
        const victim = yield* Effect.withFiber((fiber) =>
          budget
            .withAttempt(
              origin,
              Effect.sync(() => {
                executed = true;
              }),
            )
            .pipe(
              Effect.withTracer(
                Tracer.make({
                  span(options) {
                    const span = new Tracer.NativeSpan(options);
                    const end = span.end.bind(span);
                    if (span.name === `axm.wait.request-${boundary}`)
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
        ).pipe(Effect.forkChild({ startImmediately: true }));
        // Keep the same RcMap origin entry borrowed while the victim is cancelled.
        const probe = yield* budget
          .withAttempt(origin, Effect.succeed("available"))
          .pipe(Effect.timeout("1 second"), Effect.forkChild({ startImmediately: true }));
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        expect(Exit.hasInterrupts(yield* Fiber.await(victim))).toBe(true);
        expect(executed).toBe(false);
        expect(ends).toBe(1);
        yield* TestClock.adjust("1 second");
        expect(yield* Fiber.await(probe)).toEqual(Exit.succeed("available"));
      }),
    );
  }
  it.effect("admits another origin while one origin is at capacity", () =>
    Effect.gen(function* () {
      const budget = yield* makeOperationRequestBudget({ invocation: 2, origin: 1 });
      const firstStarted = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const sameOriginStarted = yield* Ref.make(false);
      const otherOriginStarted = yield* Deferred.make<void>();

      const first = yield* budget
        .withAttempt(
          "https://registry-one.test",
          Deferred.succeed(firstStarted, undefined).pipe(
            Effect.andThen(Deferred.await(releaseFirst)),
          ),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(firstStarted);

      const sameOrigin = yield* budget
        .withAttempt("https://registry-one.test", Ref.set(sameOriginStarted, true))
        .pipe(Effect.forkChild);
      const otherOrigin = yield* budget
        .withAttempt("https://registry-two.test", Deferred.succeed(otherOriginStarted, undefined))
        .pipe(Effect.forkChild);

      yield* Deferred.await(otherOriginStarted);
      expect(yield* Ref.get(sameOriginStarted)).toBe(false);
      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Fiber.join(first);
      yield* Fiber.join(sameOrigin);
      yield* Fiber.join(otherOrigin);
      expect(yield* Ref.get(sameOriginStarted)).toBe(true);
    }),
  );
});
