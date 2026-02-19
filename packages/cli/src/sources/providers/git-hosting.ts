/**
 * Shared source provider factory for git hosting platforms (GitHub, GitLab, Bitbucket).
 *
 * Wraps existing clone + discover logic into the `SourceHostProvider` interface.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";

import { discoverSkillsInDir } from "../../cli-commands/skills/install/discover-skills.js";
import { makeCliError } from "../../cli-error/index.js";
import { getTreeSha, shallowClone } from "../../git/index.js";
import type { SourceHostProvider } from "../provider.js";
import { fileUrlToPath } from "../utils.js";
import type {
  GitHubSourceHost,
  GitLabSourceHost,
  BitbucketSourceHost,
  AzureReposSourceHost,
  GitHubSource,
  GitLabSource,
  BitbucketSource,
  AzureReposSource,
  GitHostingSourceHost,
  ExtensionRef,
} from "../types.js";

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
  H extends GitHostingSourceHost,
  S extends (GitHubSource | GitLabSource | BitbucketSource | AzureReposSource) & {
    type: H["type"];
  },
>(
  host: H,
): SourceHostProvider<S, FileSystem.FileSystem | Path.Path | Scope.Scope> => ({
  type: host.type as S["type"],

  match: (url: URL) => Effect.succeed(url.hostname === host.url.hostname),

  find: (source, options) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const cloneUrl = buildCloneUrlForSource(source);

      // Acquire scoped temp directory (cleaned up when scope closes)
      const tempDir = yield* Effect.acquireRelease(
        fs.makeTempDirectory().pipe(
          Effect.mapError((error) =>
            makeCliError({
              code: "SOURCE_FETCH_FAILED",
              what: "Failed to create temp directory",
              details: [error.message],
              cause: error,
            }),
          ),
        ),
        (dir) => fs.remove(dir, { recursive: true }).pipe(Effect.ignoreLogged),
      );

      const ref = source.ref;
      const subPath = source.subPath;

      yield* shallowClone(cloneUrl, tempDir, Option.getOrUndefined(ref));

      const oldRefs = yield* discoverSkillsInDir(tempDir, subPath, {
        fullDepth: false,
        includeInternal: false,
      }).pipe(
        Effect.mapError((error) =>
          makeCliError({
            code: "SOURCE_FETCH_FAILED",
            what: "Failed to discover skills",
            details: [error.message],
            cause: error,
          }),
        ),
      );

      // Enrich with tree SHAs and wrap as ExtensionRef
      const refs = yield* Effect.forEach(
        oldRefs,
        (d) =>
          Effect.gen(function* () {
            const skillPath = fileUrlToPath(d.location);
            const relativeDir = path.relative(tempDir, skillPath);
            const gitTreeSha = yield* getTreeSha(tempDir, relativeDir);
            // Assertion needed: TS can't prove S narrows source to a specific ExtensionRef variant
            return {
              type: "skill" as const,
              refType: "git-hosted" as const,
              skill: {
                name: d.skill.name,
                description: Option.some(d.skill.description),
                metadata: d.skill.metadata,
              },
              source,
              location: d.location,
              gitTreeSha: Option.some(gitTreeSha),
            } as ExtensionRef;
          }),
        { concurrency: "unbounded" },
      );

      if (options.skillNames.length === 0) return refs;
      const nameSet = new Set(options.skillNames);
      return refs.filter((r) => r.type === "skill" && nameSet.has(r.skill.name));
    }),

  fetch: (_source, _ref) => {
    if (_ref.refType !== "git-hosted") {
      return Effect.fail(
        makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: `Expected ref with location for ${host.type} source, but none was provided`,
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
  createGitHostingSourceHostProvider<GitHubSourceHost, GitHubSource>(host);

/**
 * Source host provider for GitLab repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createGitLabSourceHostProvider = (host: GitLabSourceHost) =>
  createGitHostingSourceHostProvider<GitLabSourceHost, GitLabSource>(host);

/**
 * Source host provider for Bitbucket repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createBitbucketSourceHostProvider = (host: BitbucketSourceHost) =>
  createGitHostingSourceHostProvider<BitbucketSourceHost, BitbucketSource>(host);

/**
 * Source host provider for Azure Repos repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createAzureReposSourceHostProvider = (host: AzureReposSourceHost) =>
  createGitHostingSourceHostProvider<AzureReposSourceHost, AzureReposSource>(host);
