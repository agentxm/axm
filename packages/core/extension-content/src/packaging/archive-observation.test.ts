import { expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { CurrentArchiveWorkObserver, type ArchiveWorkFact } from "../index.js";
import { observeArchiveWork } from "./archive-observation.js";

const Invocation = Context.Reference<string>("archive-observation-test", {
  defaultValue: () => "absent",
});

it.effect(
  "does not consult the clock without an observer or replace results when observation defects",
  () =>
    Effect.gen(function* () {
      const clock = yield* Clock.Clock;
      let clockReads = 0;
      expect(
        yield* observeArchiveWork("parse", Effect.succeed(3)).pipe(
          Effect.provideService(Clock.Clock, {
            ...clock,
            monotonicTimeNanosUnsafe: () => {
              clockReads += 1;
              return 0n;
            },
          }),
        ),
      ).toBe(3);
      expect(clockReads).toBe(0);
      const failingObserver = { record: () => Effect.die("observer failed") };
      expect(
        yield* observeArchiveWork("parse", Effect.succeed(3)).pipe(
          Effect.provideService(CurrentArchiveWorkObserver, failingObserver),
        ),
      ).toBe(3);
      const failure = { reason: "original archive failure" };
      expect(
        yield* observeArchiveWork("parse", Effect.fail(failure)).pipe(
          Effect.provideService(CurrentArchiveWorkObserver, failingObserver),
          Effect.flip,
        ),
      ).toBe(failure);
    }),
);

it.effect(
  "records completed and interrupted archive work once in the executing Effect context",
  () =>
    Effect.gen(function* () {
      const observations: Array<{ fact: ArchiveWorkFact; invocation: string }> = [];
      const observer = {
        record: (fact: ArchiveWorkFact) =>
          Effect.gen(function* () {
            observations.push({ fact, invocation: yield* Invocation });
          }),
      };
      yield* Effect.gen(function* () {
        expect(
          yield* observeArchiveWork("parse", Effect.succeed([1, 2]), (entries) => entries.length),
        ).toEqual([1, 2]);
        const started = yield* Deferred.make<void>();
        const running = yield* observeArchiveWork(
          "read-member",
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        ).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        yield* Fiber.interrupt(running);
      }).pipe(
        Effect.provideService(CurrentArchiveWorkObserver, observer),
        Effect.provideService(Invocation, "current"),
      );
      expect(observations).toMatchObject([
        { invocation: "current", fact: { kind: "parse", outcome: "success", entries: 2 } },
        { invocation: "current", fact: { kind: "read-member", outcome: "interrupted" } },
      ]);
      expect(observations).toHaveLength(2);
      expect(observations[1]?.fact.entries).toBeUndefined();
    }),
);
