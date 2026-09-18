/**
 * The credential home's locks, against the real filesystem.
 *
 * Every other test of the store substitutes an in-memory permit for the
 * refresh lock. These run `proper-lockfile` over a temporary credential home,
 * because the file lock is the only thing standing between two invocations and
 * one refresh token.
 */

import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import { AuthEnvironment } from "../adapters/environment.js";
import { RegistryAccessFailed } from "../authentication/errors.js";
import { CredentialStore, CredentialStoreLive, withFileLock } from "./credential-store.js";

/**
 * One invocation's store over `home`. `SSH_TTY` selects the restricted-file
 * tier, so nothing here reaches an operating-system keychain.
 */
const storeOver = (home: string) =>
  Layer.fresh(CredentialStoreLive).pipe(
    Layer.provide(
      Layer.succeed(
        AuthEnvironment,
        ConfigProvider.fromEnvRecord({ AXM_USER_HOME: home, SSH_TTY: "/dev/ttys000" }),
      ),
    ),
  );

const withStore = <A, E>(
  home: string,
  use: (store: CredentialStore["Service"]) => Effect.Effect<A, E>,
) => Effect.flatMap(CredentialStore, use).pipe(Effect.provide(storeOver(home)));

const temporaryHome = Effect.flatMap(FileSystem.FileSystem, (fs) =>
  fs.makeTempDirectoryScoped({ prefix: "axm-refresh-lock-" }),
);

describe("the credential home's refresh lock", () => {
  it.live("admits one invocation at a time", () =>
    Effect.gen(function* () {
      const home = yield* temporaryHome;
      const inside = yield* Ref.make(0);
      const mostInside = yield* Ref.make(0);
      const section = Effect.gen(function* () {
        const now = yield* Ref.updateAndGet(inside, (count) => count + 1);
        yield* Ref.update(mostInside, (most) => Math.max(most, now));
        yield* Effect.sleep("40 millis");
        yield* Ref.update(inside, (count) => count - 1);
      });

      // Each invocation builds its own store, as separate processes do.
      yield* Effect.forEach(
        [1, 2, 3, 4],
        () => withStore(home, (store) => store.withRefreshLock(section)),
        { concurrency: 4 },
      );

      expect(yield* Ref.get(mostInside)).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("is given back when the protected effect fails", () =>
    Effect.gen(function* () {
      const home = yield* temporaryHome;
      const failure = yield* withStore(home, (store) =>
        store.withRefreshLock(Effect.fail("renewal failed" as const)),
      ).pipe(Effect.flip);
      expect(failure).toBe("renewal failed");

      yield* withStore(home, (store) => store.withRefreshLock(Effect.void));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("is given back by a waiter that stopped waiting", () =>
    Effect.gen(function* () {
      const home = yield* temporaryHome;
      const held = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const holder = yield* Effect.forkChild(
        withStore(home, (store) =>
          store.withRefreshLock(
            Deferred.succeed(held, undefined).pipe(Effect.andThen(Deferred.await(release))),
          ),
        ),
      );
      yield* Deferred.await(held);

      const waiter = yield* Effect.forkChild(
        withStore(home, (store) => store.withRefreshLock(Effect.void)),
      );
      yield* Effect.sleep("100 millis");
      // The interruption returns while the holder still has the lock: a caller's
      // deadline is not extended by another invocation's turn.
      yield* Fiber.interrupt(waiter);

      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(holder);
      yield* withStore(home, (store) => store.withRefreshLock(Effect.void));
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("a compromised file lock", () => {
  it.live(
    "interrupts the protected effect and fails instead of throwing from a timer",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* temporaryHome;
        const target = path.join(home, "guarded");
        yield* fs.writeFileString(target, "");

        const interrupted = yield* Deferred.make<void>();
        const failure = yield* withFileLock(
          target,
          { stale: 2_000, update: 1_000 },
          (cause) =>
            new RegistryAccessFailed({ category: "auth", detail: "Lock was compromised", cause }),
          // Taking the lock directory away is what another process does after
          // it decides this holder is stale.
          fs.remove(`${target}.lock`, { recursive: true }).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
          ),
        ).pipe(Effect.flip);

        expect(failure).toBeInstanceOf(RegistryAccessFailed);
        expect(failure instanceof RegistryAccessFailed ? failure.detail : null).toBe(
          "Lock was compromised",
        );
        yield* Deferred.await(interrupted);
      }).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 10_000 },
  );
});
