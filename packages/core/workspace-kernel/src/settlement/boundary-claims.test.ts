import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

import { makeBoundaryClaims } from "./boundary-claims.js";

describe("physical boundary admission timing", () => {
  it.effect("finishes actual OS-lock contention while application time remains frozen", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temporary = yield* fs.makeTempDirectoryScoped();
      const root = yield* fs.realPath(temporary);
      const namespace = path.join(root, "runtime");
      const admissionHolder = path.join(
        namespace,
        "admission",
        "tmp",
        "workspace-transition.lock",
        "holder.json",
      );
      const publishing = yield* Deferred.make<void>();
      const publish = yield* Deferred.make<void>();
      const contending = yield* Deferred.make<void>();
      const completed = yield* Deferred.make<void>();
      const finishFirst = yield* Deferred.make<void>();
      const finishSecond = yield* Deferred.make<void>();
      const firstWrite = yield* Ref.make(true);
      const applicationTimerRan = yield* Ref.make(false);
      const frozenTime = yield* Clock.currentTimeMillis;
      const timer = yield* Effect.sleep("1 second").pipe(
        Effect.andThen(Ref.set(applicationTimerRan, true)),
        Effect.forkChild,
      );
      const first = yield* Effect.scoped(
        makeBoundaryClaims(path.join(root, "first"), namespace).pipe(
          Effect.andThen(Deferred.await(finishFirst)),
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            writeFileString: (target, data, options) =>
              Effect.gen(function* () {
                if (
                  path.dirname(target) === namespace &&
                  target.endsWith(".tmp") &&
                  (yield* Ref.getAndSet(firstWrite, false))
                ) {
                  // Hold the real admission mutex before its initial publication.
                  yield* Deferred.succeed(publishing, undefined);
                  yield* Deferred.await(publish);
                }
                return yield* fs.writeFileString(target, data, options);
              }),
          }),
        ),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(publishing);
      const second = yield* Effect.scoped(
        makeBoundaryClaims(path.join(root, "second"), namespace).pipe(
          Effect.andThen(Deferred.succeed(completed, undefined)),
          Effect.andThen(Deferred.await(finishSecond)),
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            readFileString: (target, encoding) =>
              fs.readFileString(target, encoding).pipe(
                // A holder read is reached only after the OS mutex refused admission.
                Effect.tap(() =>
                  target === admissionHolder
                    ? Deferred.succeed(contending, undefined)
                    : Effect.void,
                ),
              ),
          }),
        ),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(contending);
      yield* Deferred.succeed(publish, undefined);
      yield* Deferred.await(completed);
      expect(yield* Clock.currentTimeMillis).toBe(frozenTime);
      expect(yield* Ref.get(applicationTimerRan)).toBe(false);
      yield* Deferred.succeed(finishSecond, undefined);
      yield* Fiber.join(second);
      yield* Deferred.succeed(finishFirst, undefined);
      yield* Fiber.join(first);
      expect(yield* fs.exists(path.join(namespace, "active.json"))).toBe(false);
      yield* TestClock.adjust("1 second");
      yield* Fiber.join(timer);
      expect(yield* Ref.get(applicationTimerRan)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
