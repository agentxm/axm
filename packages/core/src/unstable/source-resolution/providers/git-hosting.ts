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

import { makeAppError } from "../../app-error/index.js";
import { shallowClone } from "../../git/index.js";
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
import { discoverConventionRefs } from "./convention-discovery.js";

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
      const fs = yield* FileSystem.FileSystem;

      const cloneUrl = buildCloneUrlForSource(source);

      // Acquire scoped temp directory (cleaned up when the scope closes)
      const tempDir = yield* Effect.acquireRelease(
        fs.makeTempDirectory({ prefix: "axm-source-discovery-" }).pipe(
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

      yield* shallowClone(cloneUrl, tempDir, Option.getOrUndefined(source.ref));

      return yield* discoverConventionRefs(source, tempDir, options);
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
  const explicitCloneUrl = Option.getOrUndefined(source.cloneUrl ?? Option.none());
  if (explicitCloneUrl !== undefined) {
    return explicitCloneUrl;
  }

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
