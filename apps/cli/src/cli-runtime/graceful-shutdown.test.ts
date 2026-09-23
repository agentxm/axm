import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import * as TestClock from "effect/testing/TestClock";

import { makeSignalShutdown } from "./graceful-shutdown.js";

describe("makeSignalShutdown", () => {
  it.effect("keeps a reported interruption intact and suppresses duplicate fallback output", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const reported = yield* Ref.make(Option.none<number>());
      const finalized = yield* Deferred.make<void>();
      const services = yield* Effect.context<never>();
      const terminated: Array<number> = [];
      const fiber = yield* Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Ref.set(reported, Option.some(130))),
        Effect.forkChild,
      );
      yield* Deferred.await(started);
      const onSignal = makeSignalShutdown({
        fiber,
        // eslint-disable-next-line no-restricted-syntax -- Mirrors the process signal callback adapter.
        runFork: Effect.runForkWith(services),
        reportedExitCode: Ref.get(reported),
        finalized: Deferred.succeed(finalized, undefined).pipe(Effect.asVoid),
        terminate: (code) => {
          terminated.push(code);
        },
      });
      onSignal(130, "SIGINT");
      yield* Deferred.await(finalized);
      const exit = yield* Fiber.await(fiber);
      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      expect(terminated).toEqual([]);
    }),
  );
  // The first signal interrupts and then waits for finalizers to finish —
  // there is no forced-exit bound. Restoration and settlement recording take
  // the time they take; truncating them is what loses workspaces.
  it.effect("the first signal lets finalizers finish with no forced-exit bound", () =>
    Effect.gen(function* () {
      const programStarted = yield* Deferred.make<void>();
      const finalizerEntered = yield* Deferred.make<void>();
      const finalizerGate = yield* Deferred.make<void>();
      let finalized = false;
      const terminated: Array<number> = [];
      const services = yield* Effect.context<never>();
      const program = Deferred.succeed(programStarted, void 0).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(
          Deferred.succeed(finalizerEntered, void 0).pipe(
            Effect.andThen(Deferred.await(finalizerGate)),
            Effect.andThen(
              Effect.sync(() => {
                finalized = true;
              }),
            ),
          ),
        ),
      );
      const fiber = yield* Effect.forkChild(program);
      yield* Deferred.await(programStarted);
      const onSignal = makeSignalShutdown({
        fiber,
        // eslint-disable-next-line no-restricted-syntax -- The production signal adapter forks outside the fiber; the test mirrors it.
        runFork: Effect.runForkWith(services),
        terminate: (exitCode) => {
          terminated.push(exitCode);
        },
      });
      onSignal(130, "SIGINT");
      yield* Deferred.await(finalizerEntered);
      // Well beyond the retired five-second bound: nothing may force exit
      // while the finalizer still runs.
      yield* TestClock.adjust("60 seconds");
      expect(terminated).toEqual([]);
      expect(finalized).toBe(false);
      yield* Deferred.succeed(finalizerGate, void 0);
      yield* Fiber.await(fiber);
      expect(finalized).toBe(true);
      // The fiber ended interrupted without resolving itself, so the minimal
      // termination notice fires — exactly once, and only now.
      yield* Effect.yieldNow;
      expect(terminated).toEqual([130]);
    }),
  );

  // A second signal is the user's insistence: force the termination notice
  // and exit without waiting for finalizers.
  it.effect("a second signal forces abort while finalizers still run", () =>
    Effect.gen(function* () {
      const programStarted = yield* Deferred.make<void>();
      const finalizerEntered = yield* Deferred.make<void>();
      const finalizerGate = yield* Deferred.make<void>();
      const terminated: Array<number> = [];
      const services = yield* Effect.context<never>();
      const program = Deferred.succeed(programStarted, void 0).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(
          Deferred.succeed(finalizerEntered, void 0).pipe(
            Effect.andThen(Deferred.await(finalizerGate)),
          ),
        ),
      );
      const fiber = yield* Effect.forkChild(program);
      yield* Deferred.await(programStarted);
      const onSignal = makeSignalShutdown({
        fiber,
        // eslint-disable-next-line no-restricted-syntax -- The production signal adapter forks outside the fiber; the test mirrors it.
        runFork: Effect.runForkWith(services),
        terminate: (exitCode) => {
          terminated.push(exitCode);
        },
      });
      onSignal(143, "SIGTERM");
      yield* Deferred.await(finalizerEntered);
      expect(terminated).toEqual([]);
      onSignal(143, "SIGTERM");
      expect(terminated).toEqual([143]);
      yield* Deferred.succeed(finalizerGate, void 0);
      yield* Fiber.await(fiber);
    }),
  );
});
