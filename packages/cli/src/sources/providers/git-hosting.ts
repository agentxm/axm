/**
 * Shared source provider factory for git hosting platforms (GitHub, GitLab, Bitbucket).
 *
 * Wraps existing clone + discover logic into the `SourceHostProvider` interface.
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
import { filterRefsByOptions } from "../provider.js";
import type { SkillRef, LegacySourceProvider } from "../provider.js";
import type { SourceHostProvider } from "../provider.js";
import type {
  BitbucketSource,
  GitHubSource,
  GitHubSourceHost,
  GitLabSource,
  GitLabSourceHost,
  BitbucketSourceHost,
  AzureReposSourceHost,
  NewGitHubSource,
  NewGitLabSource,
  NewBitbucketSource,
  NewAzureReposSource,
  GitHostingSourceHost,
  SourceExtensionRef,
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
  S extends (NewGitHubSource | NewGitLabSource | NewBitbucketSource | NewAzureReposSource) & {
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

      const cloneUrl = buildCloneUrlForSource(source);

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

      const ref = source.ref;
      const subPath = source.subPath;

      yield* shallowClone(cloneUrl, tempDir, Option.getOrUndefined(ref));

      const oldRefs = yield* discoverSkillsInDir(
        tempDir,
        subPath,
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

      // Enrich with tree SHAs and wrap as SourceExtensionRef
      const refs = yield* Effect.forEach(
        oldRefs,
        (oldRef) =>
          Effect.gen(function* () {
            const skillPath = oldRef.location.replace("file://", "");
            const relativeDir = path.relative(tempDir, skillPath);
            const gitTreeSha = yield* getTreeSha(tempDir, relativeDir);
            // Assertion needed: TS can't prove S narrows source to a specific SourceExtensionRef variant
            return {
              type: "skill" as const,
              skill: oldRef.skill,
              source,
              location: oldRef.location,
              gitTreeSha: Option.some(gitTreeSha),
            } as SourceExtensionRef;
          }),
        { concurrency: "unbounded" },
      );

      if (options.names.length === 0) return refs;
      const nameSet = new Set(options.names);
      return refs.filter((r) => r.type === "skill" && nameSet.has(r.skill.name));
    }),

  fetch: (_source, _ref) => {
    if (!("location" in _ref)) {
      return Effect.fail(
        makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: `Expected ref with location for ${host.type} source, but none was provided`,
        }),
      );
    }
    // Assertion needed: "in" check does not narrow discriminated union
    return Effect.succeed({
      directory: (_ref as { location: string }).location.replace("file://", ""),
    });
  },
});

/** Build a clone URL from a git hosting source (internal helper). */
export const buildCloneUrlForSource = (
  source: NewGitHubSource | NewGitLabSource | NewBitbucketSource | NewAzureReposSource,
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
// Legacy Factory (LegacySourceProvider — backward compat)
// -----------------------------------------------------------------------------

/**
 * Creates a legacy `LegacySourceProvider` for a git hosting platform.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createLegacyGitHostingProvider = <S extends GitHubSource | GitLabSource | BitbucketSource>(
  sourceType: S["type"],
): LegacySourceProvider<S, FileSystem.FileSystem | Path.Path | Scope.Scope> => {
  // Determine host URL from existing source config types (backward compat)
  // The legacy providers are still used in the service layer during migration
  return {
    type: sourceType,

    find: (source, options) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const cloneUrl = buildCloneUrlForSource(
          source as unknown as
            | NewGitHubSource
            | NewGitLabSource
            | NewBitbucketSource
            | NewAzureReposSource,
        );

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
  };
};

// -----------------------------------------------------------------------------
// Concrete Providers (legacy)
// -----------------------------------------------------------------------------

/**
 * Source provider for GitHub repositories.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createGitHubProvider = () => createLegacyGitHostingProvider<GitHubSource>("github");

/**
 * Source provider for GitLab repositories.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createGitLabProvider = () => createLegacyGitHostingProvider<GitLabSource>("gitlab");

/**
 * Source provider for Bitbucket repositories.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createBitbucketProvider = () => createLegacyGitHostingProvider<BitbucketSource>("bitbucket");

// -----------------------------------------------------------------------------
// Concrete Providers (new — SourceHostProvider)
// -----------------------------------------------------------------------------

/**
 * Source host provider for GitHub repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createGitHubSourceHostProvider = (host: GitHubSourceHost) =>
  createGitHostingSourceHostProvider<GitHubSourceHost, NewGitHubSource>(host);

/**
 * Source host provider for GitLab repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createGitLabSourceHostProvider = (host: GitLabSourceHost) =>
  createGitHostingSourceHostProvider<GitLabSourceHost, NewGitLabSource>(host);

/**
 * Source host provider for Bitbucket repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createBitbucketSourceHostProvider = (host: BitbucketSourceHost) =>
  createGitHostingSourceHostProvider<BitbucketSourceHost, NewBitbucketSource>(host);

/**
 * Source host provider for Azure Repos repositories.
 * @experimental This API is unstable and may change without notice.
 */
export const createAzureReposSourceHostProvider = (host: AzureReposSourceHost) =>
  createGitHostingSourceHostProvider<AzureReposSourceHost, NewAzureReposSource>(host);
