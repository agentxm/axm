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
import { getTreeSha, shallowClone, shallowFetchCommit } from "../git/operations.js";
import type { SourceHostProvider } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";
import { discoverConventionRefs } from "./convention-discovery.js";

/**
 * Discovery checkouts one caller shares across the Git finds it makes.
 *
 * While a caller provides this service, Git discovery checks out each clone
 * URL and revision once and hands every later find of the same pair the same
 * read-only checkout directory. Only successful checkouts are shared: a find
 * that awaits another's checkout and sees it fail makes its own attempt, so
 * every failure belongs to the find that attempted it. Fetches never use it.
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
    ) => Effect.Effect<string, E, Exclude<R, Scope.Scope>>;
  }
>()("@agentxm/workspace-kernel/sources/providers/git/GitDiscoveryCheckouts") {}

/**
 * Run `self` with Git discovery checkouts shared across its finds. Shared
 * checkouts are acquired in the scope `self` runs in, so they are released
 * with that scope exactly as an unshared checkout would be; the record of
 * which checkouts exist ends with `self`.
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
      const scope = yield* Scope.Scope;
      const attempts = new Map<string, Deferred.Deferred<Option.Option<string>>>();
      const checkout = <E2, R2>(
        cloneUrl: string,
        ref: Option.Option<string>,
        acquire: Effect.Effect<string, E2, R2>,
      ): Effect.Effect<string, E2, Exclude<R2, Scope.Scope>> => {
        const key = JSON.stringify([cloneUrl, Option.getOrNull(ref)]);
        const attempt: Effect.Effect<
          string,
          E2,
          Exclude<R2, Scope.Scope>
        > = Effect.uninterruptibleMask((restore) =>
          Effect.suspend(() => {
            const pending = attempts.get(key);
            if (pending !== undefined)
              // A waiter whose awaited checkout failed makes its own attempt.
              return restore(
                Deferred.await(pending).pipe(
                  Effect.flatMap(
                    Option.match({
                      onNone: () => attempt,
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
                  if (exit._tag === "Success")
                    return Deferred.succeed(own, Option.some(exit.value));
                  attempts.delete(key);
                  return Deferred.succeed(own, Option.none());
                }),
              ),
            );
          }),
        );
        return attempt;
      };
      return { checkout };
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
      const tempDir = yield* Effect.acquireRelease(
        fs.makeTempDirectory({ prefix: "axm-source-commit-" }).pipe(
          Effect.mapError(
            (cause) =>
              new SourceNetworkFailure({
                detail: `Temporary directory for ${source.url.href} at ${ref.gitCommitSha} could not be created`,
                cause,
              }),
          ),
        ),
        (directory) => fs.remove(directory, { recursive: true }).pipe(Effect.ignore),
      );
      yield* shallowFetchCommit(source.url.href, tempDir, ref.gitCommitSha);
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
