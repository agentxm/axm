import { describe, expect, it } from "@effect/vitest";
import * as TestClock from "effect/testing/TestClock";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as Tracer from "effect/Tracer";

import { makeOperationRequestBudget } from "./request-budget.js";
import { CurrentWorkObserver, type WorkFact } from "./work-observation.js";

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
              Effect.provideService(CurrentWorkObserver, {
                record: (fact) => {
                  if (fact.kind !== `axm.admission.request-${boundary}`) return;
                  ends += 1;
                  fiber.interruptUnsafe();
                },
                detailSelected: () => false,
              }),
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
  for (const boundary of ["origin", "invocation"] as const) {
    it.effect(
      `records queued ${boundary} cancellation without summary spans or leaked capacity`,
      () =>
        Effect.gen(function* () {
          const budget = yield* makeOperationRequestBudget({
            invocation: 1,
            origin: boundary === "origin" ? 1 : 3,
          });
          const facts: WorkFact[] = [];
          const spans: string[] = [];
          const tracer = Tracer.make({
            span(options) {
              spans.push(options.name);
              return new Tracer.NativeSpan(options);
            },
          });
          const started = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const origin = "https://registry.example.test";
          let executed = false;
          yield* Effect.gen(function* () {
            const first = yield* budget
              .withAttempt(
                origin,
                Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release))),
              )
              .pipe(Effect.forkChild({ startImmediately: true }));
            yield* Deferred.await(started);
            const queued = yield* budget
              .withAttempt(
                origin,
                Effect.sync(() => {
                  executed = true;
                }),
              )
              .pipe(Effect.forkChild({ startImmediately: true }));
            expect(executed).toBe(false);
            expect(facts).toHaveLength(boundary === "origin" ? 2 : 3);
            yield* Fiber.interrupt(queued);
            expect(facts).toHaveLength(boundary === "origin" ? 3 : 4);
            expect(facts.at(-1)).toMatchObject({
              kind: `axm.admission.request-${boundary}`,
              outcome: "interrupted",
              attributes: { "axm.admission.capacity": 1, "axm.admission.unit": "permits" },
            });
            yield* Deferred.succeed(release, undefined);
            yield* Fiber.join(first);
            // The permit was admitted successfully even when protected work later fails.
            expect(
              yield* budget.withAttempt(origin, Effect.fail("body failed")).pipe(Effect.flip),
            ).toBe("body failed");
            expect(facts.slice(-2).map((fact) => fact.outcome)).toEqual(["success", "success"]);
            expect(yield* budget.withAttempt(origin, Effect.succeed("available"))).toBe(
              "available",
            );
          }).pipe(
            Effect.provideService(CurrentWorkObserver, {
              record: (fact) => {
                facts.push(fact);
              },
              detailSelected: () => false,
            }),
            Effect.withTracer(tracer),
            Effect.withTracerEnabled(true),
          );
          expect(executed).toBe(false);
          expect(spans).toEqual([]);
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
