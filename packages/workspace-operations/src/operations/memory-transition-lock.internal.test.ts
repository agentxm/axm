import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import { makeMemoryTransitionLockWorld } from "./memory-transition-lock.js";

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

describe("makeMemoryTransitionLockWorld", () => {
  it.effect("reports contention under virtual time and releases on interruption", () =>
    Effect.gen(function* () {
      const world = makeMemoryTransitionLockWorld();
      const first = world.invocation();
      const second = world.invocation();
      const acquired = yield* Deferred.make<void>();
      const waiting = yield* Deferred.make<void>();
      const owner = yield* Effect.scoped(
        Effect.gen(function* () {
          yield* first.acquire({
            workspaceDir: "/workspace",
            holder: { command: "first", pid: 1 },
          });
          yield* Deferred.succeed(acquired, undefined);
          return yield* Effect.never;
        }),
      ).pipe(Effect.forkChild);

      yield* Deferred.await(acquired);
      expect(first.held("/workspace")).toBeDefined();
      expect(second.held("/workspace")).toBeUndefined();

      const contender = yield* Effect.scoped(
        second.acquire({
          workspaceDir: "/workspace",
          holder: { command: "second", pid: 2 },
          waitBoundMillis: 250,
          onWaiting: () => Deferred.succeed(waiting, undefined).pipe(Effect.asVoid),
        }),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(waiting);
      yield* TestClock.adjust("250 millis");

      const blocked = yield* Fiber.join(contender);
      expect(Option.isSome(blocked)).toBe(true);
      if (Option.isSome(blocked)) {
        expect(blocked.value.waitedMillis).toBe(250);
        expect(blocked.value.holder).toEqual(Option.some({ command: "first", pid: 1 }));
      }

      yield* Fiber.interrupt(owner);
      expect(first.held("/workspace")).toBeUndefined();
      yield* Effect.scoped(
        second.acquire({ workspaceDir: "/workspace", holder: { command: "second", pid: 2 } }),
      );
      expect(world.counts()).toEqual({ acquisitions: 2, releases: 2 });
    }).pipe(Effect.provide(platformLayer)),
  );
});
