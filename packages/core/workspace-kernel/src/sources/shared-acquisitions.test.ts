import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";

import type { GitRemoteRefs } from "./git/operations.js";
import { GitRemoteRefListings, withSharedGitRemoteRefListings } from "./shared-acquisitions.js";

describe("shared Git remote ref listings", () => {
  const url = "git://git.example.invalid/extensions.git";

  /** Run `use` with the listing operation of one sharing call. */
  const withListing = <A, E>(
    use: (
      list: (
        url: string,
        acquire: Effect.Effect<GitRemoteRefs, string>,
      ) => Effect.Effect<GitRemoteRefs, string>,
    ) => Effect.Effect<A, E>,
  ) =>
    withSharedGitRemoteRefListings(
      Effect.gen(function* () {
        const shared = yield* GitRemoteRefListings;
        return yield* use((listedUrl, acquire) => shared.list(listedUrl, acquire));
      }),
    );

  /** A listing that counts its attempts and lists `tags`. */
  const counted = () => {
    let attempts = 0;
    const acquire = (tags: ReadonlyArray<string>) =>
      Effect.sync((): GitRemoteRefs => {
        attempts += 1;
        return { branches: ["main"], tags: [...tags] };
      });
    return { acquire, attempts: () => attempts };
  };

  it.effect("lists one URL once and hands every listing the same frozen refs", () =>
    Effect.gen(function* () {
      const listing = counted();
      const [first, second] = yield* withListing((list) =>
        Effect.all([list(url, listing.acquire(["v1"])), list(url, listing.acquire(["v2"]))]),
      );
      expect(listing.attempts()).toBe(1);
      expect(first).toEqual({ branches: ["main"], tags: ["v1"] });
      expect(second).toBe(first);
      expect([Object.isFrozen(first), Object.isFrozen(first?.tags)]).toEqual([true, true]);
    }),
  );

  it.effect("lists each URL separately and ends sharing with the call that provided it", () =>
    Effect.gen(function* () {
      const listing = counted();
      yield* withListing((list) =>
        Effect.all([
          list(url, listing.acquire(["v1"])),
          list(`${url}/other`, listing.acquire(["v1"])),
        ]),
      );
      expect(listing.attempts()).toBe(2);
      yield* withListing((list) => list(url, listing.acquire(["v1"])));
      expect(listing.attempts()).toBe(3);
    }),
  );

  it.effect("never shares a failed listing: each waiting listing makes its own attempt", () =>
    Effect.gen(function* () {
      const ownerStarted = yield* Deferred.make<void>();
      const ownerMayFail = yield* Deferred.make<void>();
      let attempts = 0;
      const failing = (failure: string) =>
        Effect.suspend(() => {
          attempts += 1;
          return Effect.fail(failure);
        });
      const outcome = yield* withListing((list) =>
        Effect.gen(function* () {
          const owner = yield* Effect.forkChild(
            Effect.exit(
              list(
                url,
                Deferred.succeed(ownerStarted, undefined).pipe(
                  Effect.andThen(Deferred.await(ownerMayFail)),
                  Effect.andThen(failing("owner failed")),
                ),
              ),
            ),
            { startImmediately: true },
          );
          yield* Deferred.await(ownerStarted);
          const waiters = [
            yield* Effect.forkChild(Effect.exit(list(url, failing("first failed"))), {
              startImmediately: true,
            }),
            yield* Effect.forkChild(Effect.exit(list(url, failing("second failed"))), {
              startImmediately: true,
            }),
          ];
          yield* Deferred.succeed(ownerMayFail, undefined);
          return { owner: yield* Fiber.join(owner), waiters: yield* Fiber.joinAll(waiters) };
        }),
      );
      expect(outcome).toEqual({
        owner: Exit.fail("owner failed"),
        waiters: [Exit.fail("first failed"), Exit.fail("second failed")],
      });
      expect(attempts).toBe(3);
    }),
  );

  it.effect("lets a listing that awaited an interrupted one list for itself", () =>
    Effect.gen(function* () {
      const ownerStarted = yield* Deferred.make<void>();
      const listing = counted();
      const outcome = yield* withListing((list) =>
        Effect.gen(function* () {
          const owner = yield* Effect.forkChild(
            list(url, Deferred.succeed(ownerStarted, undefined).pipe(Effect.andThen(Effect.never))),
            { startImmediately: true },
          );
          yield* Deferred.await(ownerStarted);
          const waiter = yield* Effect.forkChild(list(url, listing.acquire(["waiter"])), {
            startImmediately: true,
          });
          yield* Fiber.interrupt(owner);
          const awaited = yield* Fiber.join(waiter);
          // The interrupted attempt no longer holds the URL: a later listing
          // lists afresh, and the listing after it shares that result.
          const later = yield* list(url, listing.acquire(["later"]));
          const latest = yield* list(url, listing.acquire(["latest"]));
          return [awaited.tags, later.tags, latest.tags];
        }),
      );
      expect(outcome).toEqual([["waiter"], ["later"], ["later"]]);
      expect(listing.attempts()).toBe(2);
    }),
  );
});
