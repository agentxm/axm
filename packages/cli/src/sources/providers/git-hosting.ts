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
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import { discoverSkillsInDir } from "../../cli-commands/skills/install/discover-skills.js";
import { makeCliError } from "../../cli-error/index.js";
import { getTreeSha, shallowClone } from "../../git/index.js";
import { buildCloneUrl } from "../clone-url.js";
import { filterRefsByOptions } from "../provider.js";
import type { SkillRef, SourceProvider } from "../provider.js";
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

      const cloneUrl = yield* buildCloneUrl(source);

      // Acquire scoped temp directory (cleaned up when scope closes)
      const tempDir = yield* Effect.acquireRelease(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const dir = path.join(tmpdir(), `axm-${randomUUID()}`);
          yield* fs.makeDirectory(dir, { recursive: true }).pipe(
            Effect.mapError((error) =>
              makeCliError({
                code: "SOURCE_FETCH_FAILED",
                what: "Failed to create temp directory",
                details: [error.message],
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

      yield* shallowClone(cloneUrl, tempDir, Option.getOrUndefined(source.ref));

      const oldRefs = yield* discoverSkillsInDir(
        tempDir,
        source.subPath,
        {
          fullDepth: false,
          includeInternal: false,
        },
        source,
      ).pipe(
        Effect.mapError((error) =>
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: "Failed to discover skills",
            details: [error.message],
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
            const gitTreeSha = yield* getTreeSha(tempDir, relativeDir);
            return {
              ...ref,
              source,
              gitTreeSha: Option.some(gitTreeSha),
            } satisfies SkillRef;
          }),
        { concurrency: "unbounded" },
      );

      return filterRefsByOptions(refs, options);
    }),

  fetch: (_source, extension) =>
    Effect.succeed({ directory: extension.location.replace("file://", "") }),
});

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
