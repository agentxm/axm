import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Tracer from "effect/Tracer";
import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";
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
          Effect.provideService(CurrentWorkObserver, {
            record: (fact) => {
              if (fact.kind !== `axm.admission.${kind}`) return;
              ends += 1;
              fiber.interruptUnsafe();
            },
            detailSelected: () => false,
          }),
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
  for (const detail of [false, true])
    for (const interrupt of [false, true]) {
      it.effect(
        `${kind} distinguishes admission from work and releases queued capacity (interrupt=${interrupt}, detail=${detail})`,
        () =>
          Effect.gen(function* () {
            const run =
              kind === "extraction"
                ? (yield* makeOperationExtractionBudget(1)).withExtraction
                : (yield* makeOperationBufferedArchiveBudget(BUFFERED_ARCHIVE_RESERVATION_BYTES))
                    .withBufferedArchive;
            const spans: Tracer.NativeSpan[] = [];
            const facts: WorkFact[] = [];
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
              const admissions = spans.filter((span) => span.name === `axm.admission.${kind}`);
              expect(admissions).toHaveLength(detail ? 2 : 0);
              if (detail) {
                expect(admissions[0]?.status._tag).toBe("Ended");
                expect(admissions[1]?.status._tag).toBe("Started");
              }
              expect(facts).toHaveLength(1);
              expect(facts[0]).toMatchObject({
                kind: `axm.admission.${kind}`,
                outcome: "success",
                attributes: {
                  "axm.admission.capacity":
                    kind === "extraction" ? 1 : BUFFERED_ARCHIVE_RESERVATION_BYTES,
                  "axm.admission.unit": kind === "extraction" ? "permits" : "bytes",
                },
              });
              expect(secondExecuted).toBe(false);
              if (interrupt) yield* Fiber.interrupt(second);
              yield* Deferred.succeed(release, undefined);
              yield* Fiber.join(first);
              if (!interrupt) yield* Fiber.join(second);
              expect(secondExecuted).toBe(!interrupt);
              expect(facts).toHaveLength(2);
              expect(facts[1]?.outcome).toBe(interrupt ? "interrupted" : "success");
              if (detail) {
                expect(admissions[1]?.status._tag).toBe("Ended");
                if (admissions[1]?.status._tag === "Ended")
                  expect(admissions[1].status.exit._tag).toBe(interrupt ? "Failure" : "Success");
              }
              // A canceled waiter must not consume capacity and strand later work.
              expect(yield* run(Effect.succeed("available"))).toBe("available");
            }).pipe(
              Effect.provideService(CurrentWorkObserver, {
                record: (fact) => {
                  facts.push(fact);
                },
                detailSelected: () => detail,
              }),
              Effect.withTracer(tracer),
              Effect.withTracerEnabled(true),
            );
            expect(facts).toHaveLength(3);
            expect(spans.some((span) => span.name.startsWith("axm.wait."))).toBe(false);
            expect(spans.filter((span) => span.name === "axm.archive.extraction")).toHaveLength(
              kind === "extraction" ? (interrupt ? 2 : 3) : 0,
            );
          }),
      );
    }
}
