/**
 * Shared source provider factory for git hosting platforms (GitHub, GitLab, Bitbucket).
 *
 * Wraps existing clone + discover logic into the `SourceHostProvider` interface.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import { skillsInDir } from "../../workspace/read-model/discovery/index.js";
import { makeAppError } from "../../app-error/index.js";
import { decodeExtensionNameSync } from "../../extensions/index.js";
import { contextPackagesInDir, type ContextExtensionRef } from "../../context/index.js";
import { getTreeSha, shallowClone } from "../../git/index.js";
import type { SkillExtensionRef } from "../../skills/index.js";
import { fileUrlToPath } from "../../sources/index.js";
import type {
  SourceHostProvider,
  GitHubSourceHost,
  GitLabSourceHost,
  BitbucketSourceHost,
  AzureReposSourceHost,
  GitHubSource,
  GitLabSource,
  BitbucketSource,
  AzureReposSource,
  GitHostingSourceHost,
} from "../../sources/index.js";

// -----------------------------------------------------------------------------
// New Factory (SourceHostProvider)
// -----------------------------------------------------------------------------

/**
 * Creates a `SourceHostProvider` for a git hosting platform.
 *
 * Constructed with a `SourceHost` that provides the host URL.
 * The `match` method checks if a URL's hostname matches the configured host.
 * The `find` implementation clones the repository into a scoped temp directory,
 * discovers skills via the 3-phase algorithm, and enriches each with its git
 * tree SHA.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createGitHostingSourceHostProvider = <
  S extends GitHubSource | GitLabSource | BitbucketSource | AzureReposSource,
>(
  host: Extract<GitHostingSourceHost, { type: S["type"] }>,
): SourceHostProvider<S, FileSystem.FileSystem | Path.Path | Scope.Scope> => ({
  type: host.type,

  match: (url: URL) => Effect.succeed(url.hostname === host.url.hostname),

  find: (source, options) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const cloneUrl = buildCloneUrlForSource(source);

      // Acquire scoped temp directory (cleaned up when the scope closes)
      const tempDir = yield* Effect.acquireRelease(
        fs.makeTempDirectory().pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "network",
              detail: "Temporary source directory could not be created",
              cause: error,
            }),
          ),
        ),
        (dir) => fs.remove(dir, { recursive: true }).pipe(Effect.ignore),
      );

      const ref = source.ref;
      const subPath = source.subPath;

      yield* shallowClone(cloneUrl, tempDir, Option.getOrUndefined(ref));

      const refs =
        options.type === "context"
          ? []
          : yield* skillsInDir(tempDir, subPath, {
              fullDepth: false,
              includeInternal: false,
            }).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "network",
                  detail: "Failed to discover skills",
                  cause: error,
                }),
              ),
              Effect.flatMap((oldRefs) =>
                Effect.forEach(
                  oldRefs,
                  (d) =>
                    Effect.gen(function* () {
                      const skillPath = fileUrlToPath(d.location);
                      const relativeDir = path.relative(tempDir, skillPath);
                      const gitTreeSha = yield* getTreeSha(tempDir, relativeDir);
                      const ref: SkillExtensionRef = {
                        type: "skill" as const,
                        refType: "git-hosted" as const,
                        skill: {
                          name: decodeExtensionNameSync(d.skill.name),
                          description: Option.some(d.skill.description),
                          metadata: d.skill.metadata,
                        },
                        source,
                        location: d.location,
                        gitTreeSha: Option.some(gitTreeSha),
                      };
                      return ref;
                    }),
                  { concurrency: "unbounded" },
                ),
              ),
            );

      const fileSearchRoot = Option.match(subPath, {
        onNone: () => tempDir,
        onSome: (value) => path.join(tempDir, value),
      });

      const fileRefs =
        options.type !== "context" && options.type !== "*"
          ? []
          : yield* contextPackagesInDir(fileSearchRoot, {
              fullDepth: false,
            }).pipe(
              Effect.flatMap((discovered) =>
                Effect.forEach(
                  discovered,
                  (d) =>
                    Effect.gen(function* () {
                      const filePath = fileUrlToPath(d.location);
                      const relativeDir = path.relative(tempDir, filePath);
                      const gitTreeSha = yield* getTreeSha(tempDir, relativeDir);
                      const ref: ContextExtensionRef = {
                        type: "context" as const,
                        refType: "git-hosted" as const,
                        file: { name: d.manifest.name },
                        source,
                        location: d.location,
                        gitTreeSha: Option.some(gitTreeSha),
                      };
                      return ref;
                    }),
                  { concurrency: "unbounded" },
                ),
              ),
            );

      const allRefs = [...refs, ...fileRefs];
      if (options.names.length === 0) return allRefs;
      const nameSet = new Set(options.names);
      return allRefs.filter((r) => {
        switch (r.type) {
          case "skill":
            return nameSet.has(r.skill.name);
          case "context":
            return nameSet.has(r.file.name);
          default:
            return false;
        }
      });
    }),

  fetch: (_source, _ref) => {
    if (_ref.refType !== "git-hosted") {
      return Effect.fail(
        makeAppError({
          code: "network",
          detail: `Expected ref with location for ${host.type} source, but none was provided`,
        }),
      );
    }
    return Effect.succeed({
      directory: fileUrlToPath(_ref.location),
    });
  },
});

/** Build a clone URL from a git hosting source (internal helper). */
export const buildCloneUrlForSource = (
  source: GitHubSource | GitLabSource | BitbucketSource | AzureReposSource,
): string => {
  switch (source.type) {
    case "github":
      return `${source.url.origin}/${source.owner}/${source.repo}.git`;
    case "gitlab":
      return `${source.url.origin}/${source.owner}/${source.repo}.git`;
    case "bitbucket":
      return `${source.url.origin}/${source.owner}/${source.repo}.git`;
    case "azurerepos":
      return `${source.url.origin}/${source.organization}/${source.project}/_git/${source.repo}`;
  }
};

// -----------------------------------------------------------------------------
// Concrete Providers (SourceHostProvider)
// -----------------------------------------------------------------------------

/**
 * Source host provider for GitHub repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createGitHubSourceHostProvider = (host: GitHubSourceHost) =>
  createGitHostingSourceHostProvider<GitHubSource>(host);

/**
 * Source host provider for GitLab repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createGitLabSourceHostProvider = (host: GitLabSourceHost) =>
  createGitHostingSourceHostProvider<GitLabSource>(host);

/**
 * Source host provider for Bitbucket repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createBitbucketSourceHostProvider = (host: BitbucketSourceHost) =>
  createGitHostingSourceHostProvider<BitbucketSource>(host);

/**
 * Source host provider for Azure Repos repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createAzureReposSourceHostProvider = (host: AzureReposSourceHost) =>
  createGitHostingSourceHostProvider<AzureReposSource>(host);
