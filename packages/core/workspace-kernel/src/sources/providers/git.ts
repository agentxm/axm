/**
 * Source provider for generic git repositories.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Scope from "effect/Scope";

import { SourceNetworkFailure, SourceNotResolvable, type SourceError } from "../errors.js";
import {
  getTreeSha,
  shallowClone,
  shallowFetchCommit,
  type GitRemoteRefs,
} from "../git/operations.js";
import type { SourceHostProvider } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";
import { discoverConventionRefs } from "./convention-discovery.js";
import { gitTransportContextFingerprint } from "../../acquisition/index.js";

/**
 * Discovery checkouts one caller shares across the Git finds it makes.
 *
 * While a caller provides this service, Git discovery checks out each clone
 * URL and revision once and hands every later find of the same pair the same
 * read-only checkout directory. Only successful checkouts are shared: each
 * find that awaited a checkout that failed or was interrupted makes its own
 * unshared attempt, concurrently with the others, so every failure belongs to
 * the find that attempted it. Fetches never use it.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class GitDiscoveryCheckouts extends Context.Service<
  GitDiscoveryCheckouts,
  {
    readonly checkout: <E, R>(
      cloneUrl: string,
      ref: Option.Option<string>,
      acquire: Effect.Effect<string, E, R>,
    ) => Effect.Effect<string, E, R>;
  }
>()("@agentxm/workspace-kernel/sources/providers/git/GitDiscoveryCheckouts") {}

/**
 * Run `self` with Git discovery checkouts shared across its finds. Shared
 * checkouts are acquired in the scope `self` runs in, so they outlive any
 * narrower scope of the find that made them and are released with that scope
 * exactly as an unshared checkout would be; the record of which checkouts
 * exist ends with `self`. A find's own retry after a failed shared attempt is
 * acquired in the find's own scope, as without sharing.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const withSharedGitDiscoveryCheckouts = <A, E, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, GitDiscoveryCheckouts> | Scope.Scope> =>
  Effect.provideServiceEffect(
    self,
    GitDiscoveryCheckouts,
    Effect.gen(function* () {
      const shared = sharedDirectories(yield* Scope.Scope);
      return {
        checkout: <E2, R2>(
          cloneUrl: string,
          ref: Option.Option<string>,
          acquire: Effect.Effect<string, E2, R2>,
        ) => shared(JSON.stringify([cloneUrl, Option.getOrNull(ref)]), acquire),
      };
    }),
  );

/**
 * Directories acquired once per key in `scope`. Only successful acquisitions
 * are shared: a waiter whose awaited attempt failed or was interrupted makes
 * its own attempt without coalescing, so waiters retry concurrently and every
 * failure belongs to the attempt that met it.
 */
const sharedDirectories = (scope: Scope.Scope) => {
  const attempts = new Map<string, Deferred.Deferred<Option.Option<string>>>();
  return <E, R>(key: string, acquire: Effect.Effect<string, E, R>): Effect.Effect<string, E, R> =>
    Effect.uninterruptibleMask((restore) =>
      Effect.suspend((): Effect.Effect<string, E, R> => {
        const pending = attempts.get(key);
        if (pending !== undefined)
          return restore(
            Deferred.await(pending).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () => acquire,
                  onSome: (directory) => Effect.succeed(directory),
                }),
              ),
            ),
          );
        const own = Deferred.makeUnsafe<Option.Option<string>>();
        attempts.set(key, own);
        return restore(Effect.provideService(acquire, Scope.Scope, scope)).pipe(
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
      const attempts = new Map<string, Deferred.Deferred<Option.Option<GitRemoteRefs>>>();
      const list = <E2, R2>(
        url: string,
        acquire: Effect.Effect<GitRemoteRefs, E2, R2>,
      ): Effect.Effect<GitRemoteRefs, E2, R2> =>
        Effect.uninterruptibleMask((restore) =>
          Effect.suspend((): Effect.Effect<GitRemoteRefs, E2, R2> => {
            const pending = attempts.get(url);
            if (pending !== undefined)
              // A listing whose awaited attempt failed makes its own attempt.
              return restore(
                Deferred.await(pending).pipe(
                  Effect.flatMap(
                    Option.match({
                      onNone: () => acquire,
                      onSome: (listed) => Effect.succeed(listed),
                    }),
                  ),
                ),
              );
            const own = Deferred.makeUnsafe<Option.Option<GitRemoteRefs>>();
            attempts.set(url, own);
            return restore(acquire).pipe(
              Effect.map((listed): GitRemoteRefs =>
                Object.freeze({
                  branches: Object.freeze([...listed.branches]),
                  tags: Object.freeze([...listed.tags]),
                }),
              ),
              Effect.onExit((exit) =>
                Effect.suspend(() => {
                  if (exit._tag === "Success")
                    return Deferred.succeed(own, Option.some(exit.value));
                  attempts.delete(url);
                  return Deferred.succeed(own, Option.none());
                }),
              ),
            );
          }),
        );
      return { list };
    }),
  );

/**
 * Source host provider for generic git URLs.
 *
 * Self-describing — no host config needed.
 * `match` returns true for git://, ssh://, and git@... URL schemes.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createGitSourceHostProvider = (): SourceHostProvider<
  GitSource,
  FileSystem.FileSystem | Path.Path | Scope.Scope,
  SourceError
> => ({
  type: "git",

  match: (url: URL) =>
    Effect.succeed(
      url.protocol === "git:" || url.protocol === "ssh:" || url.href.startsWith("git@"),
    ),

  find: (source, options) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const acquire = Effect.gen(function* () {
        const tempDir = yield* Effect.acquireRelease(
          fs.makeTempDirectory({ prefix: "axm-source-discovery-" }).pipe(
            Effect.mapError(
              (error) =>
                new SourceNetworkFailure({
                  detail: "Temporary source directory could not be created",
                  cause: error,
                }),
            ),
          ),
          (dir) => fs.remove(dir, { recursive: true }).pipe(Effect.ignore),
        );
        yield* shallowClone(source.url.href, tempDir, Option.getOrUndefined(source.ref));
        return tempDir;
      });
      const shared = yield* Effect.serviceOption(GitDiscoveryCheckouts);
      const checkout = Option.isSome(shared)
        ? yield* shared.value.checkout(source.url.href, source.ref, acquire)
        : yield* acquire;
      return yield* discoverConventionRefs(source, checkout, options);
    }),

  fetch: (source, ref) => {
    if (ref.refType !== "git-hosted") {
      return Effect.fail(
        new SourceNetworkFailure({
          detail: "Expected ref with location for git source, but none was provided",
        }),
      );
    }
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const fetchCommit = Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          fs.makeTempDirectory({ prefix: "axm-source-commit-" }).pipe(
            Effect.mapError(
              (cause) =>
                new SourceNetworkFailure({
                  detail: `Temporary directory for ${source.url.href} at ${ref.gitCommitSha} could not be created`,
                  cause,
                }),
            ),
          ),
          (created) => fs.remove(created, { recursive: true }).pipe(Effect.ignore),
        );
        yield* shallowFetchCommit(source.url.href, directory, ref.gitCommitSha);
        return directory;
      });
      const shared = yield* Effect.serviceOption(AcceptedSourceAcquisitions);
      // The commit is content-addressed; its tree is checked per package below.
      const tempDir = Option.isSome(shared)
        ? yield* shared.value.acquire(
            JSON.stringify([
              "git",
              source.url.href,
              gitTransportContextFingerprint(),
              ref.gitCommitSha,
            ]),
            fetchCommit,
          )
        : yield* fetchCommit;
      const sourcePath = ref.sourcePath ?? ".";
      const packagePath = ref.distribution?.packageRoot ?? sourcePath;
      const fetchedTree = yield* getTreeSha(tempDir, packagePath);
      if (fetchedTree !== ref.gitTreeSha) {
        return yield* new SourceNotResolvable({
          category: "conflict",
          detail: `Fetched Git content for ${source.url.href} at ${ref.gitCommitSha} did not match the accepted tree`,
        });
      }
      return {
        directory: sourcePath === "." ? tempDir : path.join(tempDir, sourcePath),
        scratchRoot: tempDir,
        publicationBoundaryRoot: tempDir,
        ...(ref.distribution === undefined
          ? {}
          : {
              packageDirectory: path.join(tempDir, packagePath),
              componentPath: ref.distribution.componentPath,
            }),
      };
    });
  },
});
