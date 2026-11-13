import { expect, it } from "@effect/vitest";
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
          Effect.withTracer(
            Tracer.make({
              span(options) {
                const span = new Tracer.NativeSpan(options);
                const end = span.end.bind(span);
                span.end = (time, exit) => {
                  end(time, exit);
                  if (span.name === "axm.wait.transaction-ledger") fiber.interruptUnsafe();
                };
                return span;
              },
            }),
          ),
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
      ).pipe(Effect.withTracer(tracer), Effect.forkChild);
      yield* Effect.yieldNow;
      const wait = spans.find((span) => span.name === "axm.wait.transaction-ledger");
      expect(wait?.status._tag).toBe("Started");
      if (outcome === "released") {
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        yield* Deferred.await(admitted);
        expect(wait?.status._tag === "Ended" && wait.status.exit._tag).toBe("Success");
        expect((yield* SynchronizedRef.get(ledger)).snapshotSequence).toBe(7);
        yield* Deferred.succeed(finish, undefined);
        yield* Fiber.join(writer);
        expect((yield* SynchronizedRef.get(ledger)).snapshotSequence).toBe(10);
      } else {
        yield* Fiber.interrupt(writer);
        expect(wait?.status._tag === "Ended" && wait.status.exit._tag).toBe("Failure");
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        expect((yield* SynchronizedRef.get(ledger)).snapshotSequence).toBe(7);
        yield* updateTransactionLedger(ledger, (current) =>
          Effect.succeed({ ...current, snapshotSequence: 11 }),
        );
        expect((yield* SynchronizedRef.get(ledger)).snapshotSequence).toBe(11);
      }
    }),
  );
}
