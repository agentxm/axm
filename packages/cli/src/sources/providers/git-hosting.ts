/**
 * Shared source provider factory for git hosting platforms (GitHub, GitLab, Bitbucket).
 *
 * Wraps existing clone + discover logic into the `SourceProvider` interface.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import { discoverSkillsInDir } from "../../cli-commands/skills/install/discover-skills.js";
import { getTreeSha, shallowClone } from "../../git/index.js";
import { buildCloneUrl } from "../clone-url.js";
import { SourceError } from "../provider.js";
import type { ExtensionRef, FindOptions, SkillRef, SourceProvider } from "../provider.js";
import type { BitbucketSource, GitHubSource, GitLabSource } from "../types.js";

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Creates a `SourceProvider` for a git hosting platform.
 *
 * The `find` implementation clones the repository into a scoped temp directory,
 * discovers skills via the 3-phase algorithm, and enriches each with its git
 * tree SHA. The temp directory lifetime is managed by an `Effect.acquireRelease`
 * scope provided by the caller.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createGitHostingProvider = <S extends GitHubSource | GitLabSource | BitbucketSource>(
  sourceType: S["type"],
): SourceProvider<S, FileSystem.FileSystem | Path.Path | Scope.Scope> => ({
  type: sourceType,

  find: (source, options) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;

      const cloneUrl = yield* buildCloneUrl(source).pipe(
        Effect.mapError(
          (error) =>
            new SourceError({
              message: `Failed to build clone URL: ${error.message}`,
              cause: error,
            }),
        ),
      );

      // Acquire scoped temp directory (cleaned up when scope closes)
      const tempDir = yield* Effect.acquireRelease(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const dir = path.join(tmpdir(), `axm-${randomUUID()}`);
          yield* fs.makeDirectory(dir, { recursive: true }).pipe(
            Effect.mapError(
              (error) =>
                new SourceError({
                  message: `Failed to create temp directory: ${error.message}`,
                  cause: error,
                }),
            ),
          );
          return dir;
        }),
        (dir) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            yield* fs.remove(dir, { recursive: true });
          }).pipe(Effect.ignoreLogged),
      );

      yield* shallowClone(cloneUrl, tempDir, Option.getOrUndefined(source.ref)).pipe(
        Effect.mapError(
          (error) =>
            new SourceError({
              message: `Failed to clone repository: ${error.message}`,
              cause: error,
            }),
        ),
      );

      const oldRefs = yield* discoverSkillsInDir(
        tempDir,
        source.subPath,
        {
          fullDepth: false,
          includeInternal: false,
        },
        source,
      ).pipe(
        Effect.mapError(
          (error) =>
            new SourceError({
              message: `Failed to discover skills: ${error.message}`,
              cause: error,
            }),
        ),
      );

      // Enrich with tree SHAs
      const refs = yield* Effect.forEach(
        oldRefs,
        (ref) =>
          Effect.gen(function* () {
            const skillPath = ref.location.replace("file://", "");
            const relativeDir = path.relative(tempDir, skillPath);
            const gitTreeSha = yield* getTreeSha(tempDir, relativeDir).pipe(
              Effect.mapError(
                (error) =>
                  new SourceError({
                    message: `Failed to get git tree SHA for skill "${ref.skill.name}": ${error.message}`,
                    cause: error,
                  }),
              ),
            );
            return {
              ...ref,
              source,
              gitTreeSha: Option.some(gitTreeSha),
            } satisfies SkillRef;
          }),
        { concurrency: "unbounded" },
      );

      return filterByOptions(refs, options);
    }),

  fetch: (_source, extension) =>
    Effect.succeed({ directory: extension.location.replace("file://", "") }),
});

// -----------------------------------------------------------------------------
// Filtering
// -----------------------------------------------------------------------------

const filterByOptions = (
  refs: ReadonlyArray<ExtensionRef>,
  options: FindOptions,
): ReadonlyArray<ExtensionRef> => {
  let filtered = refs;

  if (options.names.length > 0) {
    const nameSet = new Set(options.names);
    filtered = Array.filter(filtered, (ref) => {
      const name = ref.type === "skill" ? ref.skill.name : ref.name;
      return nameSet.has(name);
    });
  }

  return filtered;
};

// -----------------------------------------------------------------------------
// Concrete Providers
// -----------------------------------------------------------------------------

/**
 * Source provider for GitHub repositories.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createGitHubProvider = () => createGitHostingProvider<GitHubSource>("github");

/**
 * Source provider for GitLab repositories.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createGitLabProvider = () => createGitHostingProvider<GitLabSource>("gitlab");

/**
 * Source provider for Bitbucket repositories.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createBitbucketProvider = () => createGitHostingProvider<BitbucketSource>("bitbucket");
