import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import {
  OperationEventSchema,
  OperationLifecycle,
  awaitDrained,
  lifecycleEvents,
  makeOperationLifecycle,
  makeThrottledUnitProgress,
  observeUnit,
  publishOperationEvent,
  publishPhaseStarted,
  publishUnitProgress,
  settleOperation,
  subscribeLossless,
  type OperationEvent,
} from "./operation-events.js";

const tags = (events: ReadonlyArray<OperationEvent>) => events.map((event) => event._tag);

describe("operation lifecycle events", () => {
  it.effect("assigns strictly increasing sequence numbers and wall-clock times", () =>
    Effect.gen(function* () {
      const lifecycle = yield* makeOperationLifecycle({ name: "Install skill", mode: "apply" });
      const observed: Array<OperationEvent> = [];
      yield* subscribeLossless(lifecycle, (event) => Effect.sync(() => void observed.push(event)));

      yield* TestClock.setTime(1_000);
      yield* publishPhaseStarted("planning").pipe(
        Effect.provideService(OperationLifecycle, lifecycle),
      );
      yield* TestClock.setTime(2_500);
      yield* observeUnit({ id: "one", label: "one" }, Effect.void).pipe(
        Effect.provideService(OperationLifecycle, lifecycle),
      );
      yield* lifecycle.settle("applied");
      yield* lifecycle.drained.await;

      expect(tags(observed)).toEqual([
        "PhaseStarted",
        "UnitStarted",
        "UnitResolved",
        "OperationSettled",
      ]);
      expect(observed.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
      expect(observed.map((event) => event.atMs)).toEqual([1_000, 2_500, 2_500, 2_500]);
      expect(observed[1]).toMatchObject({ unitId: "one", index: 0 });
      expect(observed[2]).toMatchObject({ unitId: "one", state: "committed", index: 0 });
    }).pipe(Effect.scoped),
  );

  it.effect("producers are no-ops without a broadcast", () =>
    Effect.gen(function* () {
      yield* publishPhaseStarted("apply");
      yield* publishUnitProgress({ done: 1, unit: "bytes" });
      const value = yield* observeUnit({ id: "one", label: "one" }, Effect.succeed(42));
      yield* settleOperation("completed");
      yield* awaitDrained;
      expect(value).toBe(42);
    }),
  );

  it.effect(
    "keeps every event for a lagging lossless subscriber and drains only after its ack",
    () =>
      Effect.gen(function* () {
        const lifecycle = yield* makeOperationLifecycle({ name: "Sync workspace", mode: "apply" });
        const release = yield* Deferred.make<void>();
        const observed: Array<OperationEvent> = [];
        // The subscriber blocks on its first event; the publisher must not.
        yield* subscribeLossless(lifecycle, (event) =>
          Effect.gen(function* () {
            if (observed.length === 0) yield* Deferred.await(release);
            observed.push(event);
          }),
        );

        const publisher = Effect.forEach(
          Array.from({ length: 50 }, (_, index) => index),
          (index) =>
            lifecycle.publish((seq, atMs) => ({
              _tag: "UnitStarted",
              seq,
              atMs,
              unitId: `unit-${String(index)}`,
              label: `unit ${String(index)}`,
              index,
              total: 50,
            })),
          { discard: true },
        ).pipe(
          Effect.andThen(lifecycle.settle("applied")),
          Effect.provideService(OperationLifecycle, lifecycle),
        );
        const publishing = yield* Effect.forkChild(publisher);
        yield* Fiber.join(publishing);

        expect(yield* lifecycle.settled).toBe(true);
        expect(lifecycle.drained.isOpen()).toBe(false);
        expect(observed).toHaveLength(0);

        yield* Deferred.succeed(release, undefined);
        yield* lifecycle.drained.await;

        expect(observed).toHaveLength(51);
        expect(observed.map((event) => event.seq)).toEqual(
          Array.from({ length: 51 }, (_, index) => index + 1),
        );
        expect(observed.at(-1)?._tag).toBe("OperationSettled");
      }).pipe(Effect.scoped),
  );

  it.effect("settles exactly once", () =>
    Effect.gen(function* () {
      const lifecycle = yield* makeOperationLifecycle({ name: "Upgrade", mode: "apply" });
      const observed: Array<OperationEvent> = [];
      yield* subscribeLossless(lifecycle, (event) => Effect.sync(() => void observed.push(event)));
      yield* lifecycle.settle("completed");
      yield* lifecycle.settle("failed");
      yield* settleOperation("interrupted").pipe(
        Effect.provideService(OperationLifecycle, lifecycle),
      );
      yield* lifecycle.drained.await;
      expect(observed).toHaveLength(1);
      expect(observed[0]).toMatchObject({ _tag: "OperationSettled", outcome: "completed" });
    }).pipe(Effect.scoped),
  );

  it.effect("an interrupted lossless subscriber still acknowledges", () =>
    Effect.gen(function* () {
      const lifecycle = yield* makeOperationLifecycle({ name: "Publish", mode: "apply" });
      const started = yield* Deferred.make<void>();
      const ack = yield* lifecycle.registerLossless;
      const subscriber = yield* Effect.forkChild(
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(ack),
        ),
      );
      yield* Deferred.await(started);
      yield* lifecycle.settle("failed");
      expect(lifecycle.drained.isOpen()).toBe(false);
      yield* Fiber.interrupt(subscriber);
      yield* lifecycle.drained.await;
      expect(lifecycle.drained.isOpen()).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.effect("the event stream ends with the terminal event", () =>
    Effect.gen(function* () {
      const lifecycle = yield* makeOperationLifecycle({ name: "Sync", mode: "preview" });
      const stream = yield* lifecycleEvents(lifecycle);
      const collecting = yield* Effect.forkChild(Stream.runCollect(stream));
      yield* publishPhaseStarted("preview").pipe(
        Effect.provideService(OperationLifecycle, lifecycle),
      );
      yield* lifecycle.settle("previewed");
      yield* publishPhaseStarted("apply").pipe(
        Effect.provideService(OperationLifecycle, lifecycle),
      );
      const collected = yield* Fiber.join(collecting);
      expect(tags(collected)).toEqual(["PhaseStarted", "OperationSettled"]);
    }).pipe(Effect.scoped),
  );

  it.effect("throttles continuous progress at the producer", () =>
    Effect.gen(function* () {
      const lifecycle = yield* makeOperationLifecycle({ name: "Install", mode: "apply" });
      const observed: Array<OperationEvent> = [];
      yield* subscribeLossless(lifecycle, (event) => Effect.sync(() => void observed.push(event)));
      yield* observeUnit(
        { id: "archive", label: "archive" },
        Effect.gen(function* () {
          const report = yield* makeThrottledUnitProgress({ unit: "bytes", intervalMs: 100 });
          for (let done = 0; done <= 1_000; done += 10) {
            yield* report(done, 1_000);
            yield* TestClock.adjust(1);
          }
        }),
      ).pipe(Effect.provideService(OperationLifecycle, lifecycle));
      yield* lifecycle.settle("applied");
      yield* lifecycle.drained.await;

      const progress = observed.filter((event) => event._tag === "UnitProgress");
      expect(progress.length).toBeGreaterThanOrEqual(2);
      expect(progress.length).toBeLessThanOrEqual(12);
      expect(progress.at(-1)).toMatchObject({ unitId: "archive", done: 1_000, total: 1_000 });
    }).pipe(Effect.scoped),
  );

  it.effect("every event round-trips through the published schema", () =>
    Effect.gen(function* () {
      const lifecycle = yield* makeOperationLifecycle({ name: "Install skill", mode: "apply" });
      const observed: Array<OperationEvent> = [];
      yield* subscribeLossless(lifecycle, (event) => Effect.sync(() => void observed.push(event)));
      const provided = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.provideService(effect, OperationLifecycle, lifecycle);
      yield* provided(
        publishOperationEvent((seq, atMs) => ({
          _tag: "OperationStarted",
          seq,
          atMs,
          operationId: lifecycle.operationId,
          name: lifecycle.name,
          mode: lifecycle.mode,
        })),
      );
      yield* provided(publishPhaseStarted("resolution"));
      yield* provided(
        observeUnit(
          { id: "@acme/skills/review", label: "review", index: 0, total: 1 },
          publishUnitProgress({ done: 10, total: 100, unit: "bytes" }),
        ),
      );
      yield* provided(
        publishOperationEvent((seq, atMs) => ({
          _tag: "Waiting",
          seq,
          atMs,
          blockingClass: "resource-conflict",
          subject: "workspace-transition",
          detail: "axm sync (pid 1)",
        })),
      );
      yield* provided(
        publishOperationEvent((seq, atMs) => ({
          _tag: "WaitEnded",
          seq,
          atMs,
          subject: "workspace-transition",
        })),
      );
      yield* lifecycle.settle("applied");
      yield* lifecycle.drained.await;

      expect(tags(observed)).toEqual([
        "OperationStarted",
        "PhaseStarted",
        "UnitStarted",
        "UnitProgress",
        "UnitResolved",
        "Waiting",
        "WaitEnded",
        "OperationSettled",
      ]);
      const encode = Schema.encodeSync(OperationEventSchema);
      const decode = Schema.decodeUnknownSync(OperationEventSchema);
      for (const event of observed) {
        const wire: unknown = JSON.parse(JSON.stringify(encode(event)));
        expect(decode(wire)).toEqual(event);
      }
    }).pipe(Effect.scoped),
  );
});
