import { hostname } from "node:os";
import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Clock from "effect/Clock";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import { withLocalPublicationLock } from "./local-publication-lock.js";

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-publication-lock-" });
  const lockPath = path.join(directory, ".publish.lock");
  const withLock = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    target = lockPath,
    overrides: Partial<FileSystem.FileSystem> = {},
  ) =>
    withLocalPublicationLock(
      FileSystem.FileSystem.of({ ...fs, ...overrides }),
      path,
      target,
      effect,
    );
  return { fs, path, directory, lockPath, withLock };
});

const ownerRecord = (pid: number, acquiredAt: number) =>
  JSON.stringify({
    token: globalThis.crypto.randomUUID(),
    pid,
    host: hostname(),
    acquiredAt,
  });

describe("Local publication lock lifetime", () => {
  it.live(
    "coordinates independent callers, permits distinct keys, and releases after the last use",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const held = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const inside = yield* Ref.make(0);
        const maximum = yield* Ref.make(0);
        const first = yield* Effect.forkChild(
          f.withLock(
            Effect.gen(function* () {
              yield* Ref.update(inside, (n) => n + 1);
              yield* Deferred.succeed(held, undefined);
              yield* Deferred.await(release);
              yield* Ref.update(inside, (n) => n - 1);
            }),
          ),
        );
        yield* Deferred.await(held);
        const waiting = yield* Effect.forkChild(
          f.withLock(
            Effect.gen(function* () {
              yield* Ref.updateAndGet(inside, (n) => n + 1).pipe(
                Effect.flatMap((n) => Ref.update(maximum, (m) => Math.max(n, m))),
              );
              yield* Ref.update(inside, (n) => n - 1);
            }),
          ),
        );
        expect(
          yield* f.withLock(Effect.succeed("independent"), f.path.join(f.directory, ".other.lock")),
        ).toBe("independent");
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(first);
        yield* Fiber.join(waiting);
        expect(yield* Ref.get(maximum)).toBe(1);
        for (let invocation = 0; invocation < 3; invocation++) yield* f.withLock(Effect.void);
        expect(yield* f.fs.readDirectory(f.directory)).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("interrupts a waiting caller promptly without entering or releasing the holder", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const held = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const attempted = yield* Deferred.make<void>();
      const entered = yield* Ref.make(false);
      const first = yield* Effect.forkChild(
        f.withLock(Deferred.succeed(held, undefined).pipe(Effect.andThen(Deferred.await(release)))),
      );
      yield* Deferred.await(held);
      const ownerBefore = yield* f.fs.readFileString(f.lockPath);
      const waiter = yield* Effect.forkChild(
        f.withLock(Ref.set(entered, true), f.lockPath, {
          link: (from, to) =>
            f.fs.link(from, to).pipe(Effect.tapError(() => Deferred.succeed(attempted, undefined))),
        }),
      );
      yield* Deferred.await(attempted);
      yield* Fiber.interrupt(waiter).pipe(Effect.timeout("1 second"));
      expect(yield* Ref.get(entered)).toBe(false);
      expect(yield* f.fs.readFileString(f.lockPath)).toBe(ownerBefore);
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(first);
      expect(yield* f.fs.readDirectory(f.directory)).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("registers release even when interruption arrives during the atomic grant", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const granted = yield* Deferred.make<void>();
      const finishGrant = yield* Deferred.make<void>();
      const entered = yield* Ref.make(false);
      const holder = yield* Effect.forkChild(
        f.withLock(Ref.set(entered, true), f.lockPath, {
          link: (from, to) =>
            f.fs.link(from, to).pipe(
              Effect.tap(() => Deferred.succeed(granted, undefined)),
              Effect.andThen(Deferred.await(finishGrant)),
            ),
        }),
      );
      yield* Deferred.await(granted);
      const interrupting = yield* Effect.forkChild(Fiber.interrupt(holder));
      yield* Effect.yieldNow;
      yield* Deferred.succeed(finishGrant, undefined);
      expect(Exit.hasInterrupts(yield* Fiber.await(holder))).toBe(true);
      yield* Fiber.join(interrupting);
      expect(yield* Ref.get(entered)).toBe(false);
      expect(yield* f.fs.readDirectory(f.directory)).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("does not remove a successor's lock when an old owner finishes", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const successor = ownerRecord(process.pid, yield* Clock.currentTimeMillis);
      yield* f.withLock(
        f.fs
          .remove(f.lockPath)
          .pipe(Effect.andThen(f.fs.writeFileString(f.lockPath, successor, { flag: "wx" }))),
      );
      expect(yield* f.fs.readFileString(f.lockPath)).toBe(successor);
      expect(yield* f.fs.readDirectory(f.directory)).toEqual([".publish.lock"]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("never steals an aged live owner's lock", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const active = ownerRecord(process.pid, (yield* Clock.currentTimeMillis) - 600_000);
      yield* f.fs.writeFileString(f.lockPath, active);
      const waiting = yield* Effect.forkChild(f.withLock(Effect.fail("must not enter")));
      yield* Effect.sleep("75 millis");
      yield* Fiber.interrupt(waiting).pipe(Effect.timeout("1 second"));
      expect(yield* f.fs.readFileString(f.lockPath)).toBe(active);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("serializes competing stale reapers without deleting a successor", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const dead = ownerRecord(2_147_483_647, (yield* Clock.currentTimeMillis) - 600_000);
      yield* f.fs.writeFileString(f.lockPath, dead);
      const inside = yield* Ref.make(0);
      const maximum = yield* Ref.make(0);
      yield* Effect.forEach(
        [1, 2, 3],
        () =>
          f.withLock(
            Effect.gen(function* () {
              const n = yield* Ref.updateAndGet(inside, (value) => value + 1);
              yield* Ref.update(maximum, (value) => Math.max(n, value));
              yield* Effect.sleep("30 millis");
              yield* Ref.update(inside, (value) => value - 1);
            }),
          ),
        { concurrency: 3 },
      );
      expect(yield* Ref.get(maximum)).toBe(1);
      expect(yield* f.fs.readDirectory(f.directory)).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  for (const operation of ["link", "readFileString"] as const) {
    it.live("reports operational " + operation + " failures instead of waiting", () =>
      Effect.gen(function* () {
        const f = yield* fixture;
        const cause = PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method: operation,
          pathOrDescriptor: f.lockPath,
        });
        yield* f.fs.writeFileString(
          f.lockPath,
          ownerRecord(process.pid, yield* Clock.currentTimeMillis),
        );
        const error = yield* f
          .withLock(Effect.void, f.lockPath, {
            link: (from, to) => (operation === "link" ? Effect.fail(cause) : f.fs.link(from, to)),
            readFileString: (path, options) =>
              operation === "readFileString"
                ? Effect.fail(cause)
                : f.fs.readFileString(path, options),
          })
          .pipe(Effect.flip);
        expect(error).toMatchObject({ _tag: "RegistryOperationFailed", cause });
        expect(yield* f.fs.readDirectory(f.directory)).toEqual([".publish.lock"]);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  }

  it.live("reports an abandoned recovery gate without deleting either owner's record", () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const dead = ownerRecord(2_147_483_647, (yield* Clock.currentTimeMillis) - 600_000);
      yield* f.fs.writeFileString(f.lockPath, dead);
      yield* f.fs.writeFileString(`${f.lockPath}.recovery`, dead);
      const error = yield* f.withLock(Effect.void).pipe(Effect.flip);
      expect(error).toMatchObject({ _tag: "RegistryOperationFailed", category: "conflict" });
      expect(yield* f.fs.readFileString(f.lockPath)).toBe(dead);
      expect(yield* f.fs.readFileString(`${f.lockPath}.recovery`)).toBe(dead);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
