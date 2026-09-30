import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";

import { makeWorkspaceFileWriteLocks } from "./file-write-locks.js";

describe("workspace file write locks", () => {
  it.effect("keeps same-path waiters exclusive while other paths proceed", () =>
    Effect.gen(function* () {
      const locks = yield* makeWorkspaceFileWriteLocks;
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const waiterEntered = yield* Deferred.make<void>();
      const releaseWaiter = yield* Deferred.make<void>();
      const events = yield* Ref.make<ReadonlyArray<string>>([]);
      const owner = yield* locks.service
        .withLock(
          "/workspace/config.json",
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const waiter = yield* locks.service
        .withLock(
          "/workspace/child/../config.json",
          Ref.update(events, (values) => [...values, "waiter"]).pipe(
            Effect.andThen(Deferred.succeed(waiterEntered, undefined)),
            Effect.andThen(Deferred.await(releaseWaiter)),
          ),
        )
        .pipe(Effect.forkChild({ startImmediately: true }));
      yield* locks.service.withLock(
        "/workspace/independent.json",
        Ref.update(events, (values) => [...values, "independent"]),
      );
      expect(yield* Ref.get(events)).toEqual(["independent"]);
      expect(Array.from(yield* locks.retainedPaths)).toEqual(["/workspace/config.json"]);

      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(owner);
      yield* Deferred.await(waiterEntered);
      expect(Array.from(yield* locks.retainedPaths)).toEqual(["/workspace/config.json"]);
      const third = yield* locks.service
        .withLock(
          "/workspace/config.json",
          Ref.update(events, (values) => [...values, "third"]),
        )
        .pipe(Effect.forkChild({ startImmediately: true }));
      expect(yield* Ref.get(events)).toEqual(["independent", "waiter"]);
      yield* Deferred.succeed(releaseWaiter, undefined);
      yield* Fiber.join(waiter);
      yield* Fiber.join(third);
      expect(yield* Ref.get(events)).toEqual(["independent", "waiter", "third"]);
      expect(Array.from(yield* locks.retainedPaths)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a queued alias retarget before its read or mutation", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const first = path.join(root, "first.json");
      const second = path.join(root, "second.json");
      const alias = path.join(root, "alias.json");
      yield* fs.writeFileString(first, "first");
      yield* fs.writeFileString(second, "second");
      yield* fs.symlink(first, alias);
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const aliasResolved = yield* Deferred.make<void>();
      const read = yield* Ref.make(false);
      const locks = yield* makeWorkspaceFileWriteLocks.pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          realPath: (target) =>
            fs
              .realPath(target)
              .pipe(
                Effect.tap(() =>
                  target === alias ? Deferred.succeed(aliasResolved, undefined) : Effect.void,
                ),
              ),
        }),
      );
      const owner = yield* locks.service
        .withLock(
          first,
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const waiter = yield* locks.service
        .withLock(alias, Ref.set(read, true))
        .pipe(Effect.result, Effect.forkChild);
      yield* Deferred.await(aliasResolved);
      yield* fs.remove(alias);
      yield* fs.symlink(second, alias);
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(owner);
      const result = yield* Fiber.join(waiter);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure.cause).toBe("native-alias-changed");
      expect(yield* Ref.get(read)).toBe(false);
      expect(yield* fs.readFileString(first)).toBe("first");
      expect(yield* fs.readFileString(second)).toBe("second");
      yield* locks.service.withLock(alias, Ref.set(read, true));
      expect(yield* Ref.get(read)).toBe(true);
      expect(Array.from(yield* locks.retainedPaths)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("cancels a waiting writer without executing its mutation or evicting its owner", () =>
    Effect.gen(function* () {
      const locks = yield* makeWorkspaceFileWriteLocks;
      const entered = yield* Deferred.make<void>();
      const changed = yield* Ref.make(false);
      const owner = yield* locks.service
        .withLock(
          "/workspace/config.json",
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const waiter = yield* locks.service
        .withLock("/workspace/config.json", Ref.set(changed, true))
        .pipe(Effect.forkChild({ startImmediately: true }));
      yield* Fiber.interrupt(waiter);
      expect(yield* Ref.get(changed)).toBe(false);
      expect(Array.from(yield* locks.retainedPaths)).toEqual(["/workspace/config.json"]);
      yield* Fiber.interrupt(owner);
      expect(Array.from(yield* locks.retainedPaths)).toEqual([]);
      yield* locks.service.withLock("/workspace/config.json", Ref.set(changed, true));
      expect(yield* Ref.get(changed)).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps the permit until an interrupted writer's asynchronous cleanup finishes", () =>
    Effect.gen(function* () {
      const locks = yield* makeWorkspaceFileWriteLocks;
      const entered = yield* Deferred.make<void>();
      const cleaning = yield* Deferred.make<void>();
      const finishCleanup = yield* Deferred.make<void>();
      const events = yield* Ref.make<ReadonlyArray<string>>([]);
      const owner = yield* locks.service
        .withLock(
          "/workspace/config.json",
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Deferred.succeed(cleaning, undefined).pipe(
                Effect.andThen(Deferred.await(finishCleanup)),
                Effect.andThen(Ref.update(events, (values) => [...values, "cleanup"])),
              ),
            ),
          ),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const interrupt = yield* Fiber.interrupt(owner).pipe(Effect.forkChild);
      yield* Deferred.await(cleaning);
      const waiter = yield* locks.service
        .withLock(
          "/workspace/config.json",
          Ref.update(events, (values) => [...values, "next-write"]),
        )
        .pipe(Effect.forkChild({ startImmediately: true }));
      expect(yield* Ref.get(events)).toEqual([]);
      yield* Deferred.succeed(finishCleanup, undefined);
      yield* Fiber.join(interrupt);
      yield* Fiber.join(waiter);
      expect(yield* Ref.get(events)).toEqual(["cleanup", "next-write"]);
      expect(Array.from(yield* locks.retainedPaths)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "preserves failures and retains no history across distinct paths or owner lifetimes",
    () =>
      Effect.gen(function* () {
        const ownerScope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(ownerScope, Exit.void));
        const locks = yield* makeWorkspaceFileWriteLocks.pipe(
          Effect.provideService(Scope.Scope, ownerScope),
        );
        const failure = { _tag: "WriteFailed", step: "publish" } as const;
        const failed = yield* locks.service
          .withLock("/workspace/config.json", Effect.fail(failure))
          .pipe(Effect.exit);
        expect(failed).toEqual(Exit.fail(failure));
        yield* locks.service.withLock("/workspace/config.json", Effect.void);
        for (let index = 0; index < 200; index++) {
          yield* locks.service.withLock(`/workspace/${index}.json`, Effect.void);
          expect(Array.from(yield* locks.retainedPaths)).toEqual([]);
        }
        yield* Scope.close(ownerScope, Exit.void);
        const closed = yield* locks.service
          .withLock("/workspace/config.json", Effect.void)
          .pipe(Effect.forkChild);
        expect(Exit.hasInterrupts(yield* Fiber.await(closed))).toBe(true);
        const next = yield* makeWorkspaceFileWriteLocks;
        yield* next.service.withLock("/workspace/config.json", Effect.void);
        expect(Array.from(yield* next.retainedPaths)).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
