import { expect, it } from "@effect/vitest";
import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as SynchronizedRef from "effect/SynchronizedRef";
import * as Tracer from "effect/Tracer";
import { emptyLedger } from "./ledger.js";
import { updateTransactionLedger } from "./ledger-admission.js";

it.effect(
  "retains ledger exclusion and state when cancellation arrives at diagnostic admission",
  () =>
    Effect.gen(function* () {
      const ledger = yield* SynchronizedRef.make(emptyLedger);
      const pending = yield* Effect.withFiber((fiber) =>
        updateTransactionLedger(ledger, (current) =>
          Effect.succeed({ ...current, snapshotSequence: 7 }),
        ).pipe(
          Effect.provideService(CurrentWorkObserver, {
            record(fact) {
              if (fact.kind === "axm.admission.transaction-ledger") fiber.interruptUnsafe();
            },
            detailSelected: () => false,
          }),
        ),
      ).pipe(Effect.forkChild);
      expect(Exit.hasInterrupts(yield* Fiber.await(pending))).toBe(true);
      expect((yield* SynchronizedRef.get(ledger)).snapshotSequence).toBe(0);
      yield* updateTransactionLedger(ledger, (current) =>
        Effect.succeed({ ...current, snapshotSequence: 11 }),
      );
      expect((yield* SynchronizedRef.get(ledger)).snapshotSequence).toBe(11);
    }),
);

for (const outcome of ["released", "interrupted"] as const) {
  it.effect(`ends ledger admission at callback entry or ${outcome} cancellation`, () =>
    Effect.gen(function* () {
      const ledger = yield* SynchronizedRef.make(emptyLedger);
      const holding = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const admitted = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      const holder = yield* SynchronizedRef.updateEffect(ledger, (current) =>
        Deferred.succeed(holding, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.as({ ...current, snapshotSequence: 7 }),
        ),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(holding);
      const spans: Tracer.NativeSpan[] = [];
      const facts: WorkFact[] = [];
      let pendingAdmissions = 0;
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const writer = yield* updateTransactionLedger(ledger, (current) =>
        Deferred.succeed(admitted, undefined).pipe(
          Effect.andThen(Deferred.await(finish)),
          Effect.as({ ...current, snapshotSequence: current.snapshotSequence + 3 }),
        ),
      ).pipe(
        Effect.withTracer(tracer),
        Effect.provideService(CurrentWorkObserver, {
          record: (fact) => facts.push(fact),
          detailSelected: () => false,
          started() {
            pendingAdmissions += 1;
            return () => {
              pendingAdmissions -= 1;
            };
          },
        }),
        Effect.forkChild,
      );
      yield* Effect.yieldNow;
      expect(pendingAdmissions).toBe(1);
      expect(facts).toEqual([]);
      if (outcome === "released") {
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        yield* Deferred.await(admitted);
        expect(facts).toHaveLength(1);
        expect(facts[0]?.outcome).toBe("success");
        expect(pendingAdmissions).toBe(0);
        expect((yield* SynchronizedRef.get(ledger)).snapshotSequence).toBe(7);
        yield* Deferred.succeed(finish, undefined);
        yield* Fiber.join(writer);
        expect((yield* SynchronizedRef.get(ledger)).snapshotSequence).toBe(10);
      } else {
        yield* Fiber.interrupt(writer);
        expect(facts).toHaveLength(1);
        expect(facts[0]?.outcome).toBe("interrupted");
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        expect((yield* SynchronizedRef.get(ledger)).snapshotSequence).toBe(7);
        yield* updateTransactionLedger(ledger, (current) =>
          Effect.succeed({ ...current, snapshotSequence: 11 }),
        );
        expect((yield* SynchronizedRef.get(ledger)).snapshotSequence).toBe(11);
      }
      expect(facts).toHaveLength(1);
      expect(facts[0]?.kind).toBe("axm.admission.transaction-ledger");
      expect(facts[0]?.attributes["axm.work.executed"]).toBeUndefined();
      expect(pendingAdmissions).toBe(0);
      expect(spans).toEqual([]);
    }),
  );
}
