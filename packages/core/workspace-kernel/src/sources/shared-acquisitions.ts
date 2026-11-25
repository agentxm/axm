/**
 * Acquisitions one caller shares across the source operations it makes.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Scope from "effect/Scope";

import type { GitRemoteRefs } from "./git/operations.js";

/**
 * Values acquired once per key. Only successful acquisitions are shared: the
 * first request for a key runs `attempt`, and a waiter whose awaited attempt
 * failed or was interrupted runs its own `retry` without coalescing, so
 * waiters retry concurrently and every failure belongs to the attempt that
 * met it. `shared`, when given, turns the first request's value into the one
 * every request receives; it runs once that attempt has succeeded and cannot
 * be interrupted, so a value that was acquired is always shared.
 */
const coalesceSuccessful = <V>(shared?: (value: V) => V) => {
  const attempts = new Map<string, Deferred.Deferred<Option.Option<V>>>();
  return <E, R>(
    key: string,
    attempt: Effect.Effect<V, E, R>,
    retry: Effect.Effect<V, E, R>,
  ): Effect.Effect<V, E, R> =>
    Effect.uninterruptibleMask((restore) =>
      Effect.suspend((): Effect.Effect<V, E, R> => {
        const pending = attempts.get(key);
        if (pending !== undefined)
          return restore(
            Deferred.await(pending).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () => retry,
                  onSome: (value) => Effect.succeed(value),
                }),
              ),
            ),
          );
        const own = Deferred.makeUnsafe<Option.Option<V>>();
        attempts.set(key, own);
        const acquired = restore(attempt);
        return (shared === undefined ? acquired : Effect.map(acquired, shared)).pipe(
          Effect.onExit((exit) =>
            Effect.suspend(() => {
              if (exit._tag === "Success") return Deferred.succeed(own, Option.some(exit.value));
              attempts.delete(key);
              return Deferred.succeed(own, Option.none());
            }),
          ),
        );
      }),
    );
};

/**
 * Directories acquired once per key in `scope`. Only successful acquisitions
 * are shared: a waiter whose awaited attempt failed or was interrupted makes
 * its own attempt without coalescing, so waiters retry concurrently and every
 * failure belongs to the attempt that met it.
 */
export const sharedDirectories = (scope: Scope.Scope) => {
  const coalesce = coalesceSuccessful<string>();
  return <E, R>(key: string, acquire: Effect.Effect<string, E, R>): Effect.Effect<string, E, R> =>
    coalesce(key, Effect.provideService(acquire, Scope.Scope, scope), acquire);
};

/**
 * Accepted source content one caller shares across the fetches it makes.
 *
 * While a caller provides this service, a fetch of accepted content keyed by
 * exactly the same immutable input (a Git commit of one clone URL under one
 * transport context, or one digest-pinned HTTP artifact snapshot) retrieves
 * it once and hands every later fetch of that input the same read-only
 * directory; each fetch still checks and selects its own package within it.
 * Only successful retrievals are shared, as with discovery checkouts.
 * Discovery never uses it.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class AcceptedSourceAcquisitions extends Context.Service<
  AcceptedSourceAcquisitions,
  {
    readonly acquire: <E, R>(
      key: string,
      acquire: Effect.Effect<string, E, R>,
    ) => Effect.Effect<string, E, R>;
  }
>()("@agentxm/workspace-kernel/sources/providers/git/AcceptedSourceAcquisitions") {}

/**
 * Run `self` with accepted source content shared across its fetches. Shared
 * content is retrieved in the scope `self` runs in and released with it, as
 * each fetch's own content would be; the record of what was retrieved ends
 * with `self`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const withSharedAcceptedSourceAcquisitions = <A, E, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, AcceptedSourceAcquisitions> | Scope.Scope> =>
  Effect.provideServiceEffect(
    self,
    AcceptedSourceAcquisitions,
    Effect.gen(function* () {
      return { acquire: sharedDirectories(yield* Scope.Scope) };
    }),
  );

/**
 * Remote ref listings one caller shares across the Git selectors it assesses.
 *
 * While a caller provides this service, each exact URL's advertised branches
 * and tags are listed once and every later listing of the same URL receives
 * that frozen result. Only successful listings are shared: each listing that
 * awaited one that failed or was interrupted makes its own unshared attempt,
 * so every failure belongs to the listing that attempted it.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class GitRemoteRefListings extends Context.Service<
  GitRemoteRefListings,
  {
    readonly list: <E, R>(
      url: string,
      acquire: Effect.Effect<GitRemoteRefs, E, R>,
    ) => Effect.Effect<GitRemoteRefs, E, R>;
  }
>()("@agentxm/workspace-kernel/sources/providers/git/GitRemoteRefListings") {}

/**
 * Run `self` with remote ref listings shared across its Git selector
 * assessments. The record of which listings exist ends with `self`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const withSharedGitRemoteRefListings = <A, E, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, GitRemoteRefListings>> =>
  Effect.provideServiceEffect(
    self,
    GitRemoteRefListings,
    Effect.sync(() => {
      const coalesce = coalesceSuccessful<GitRemoteRefs>((listed) =>
        Object.freeze({
          branches: Object.freeze([...listed.branches]),
          tags: Object.freeze([...listed.tags]),
        }),
      );
      const list = <E2, R2>(
        url: string,
        acquire: Effect.Effect<GitRemoteRefs, E2, R2>,
      ): Effect.Effect<GitRemoteRefs, E2, R2> =>
        // A listing whose awaited attempt failed makes its own attempt.
        coalesce(url, acquire, acquire);
      return { list };
    }),
  );
