/**
 * Version resolution logic for CLI self-upgrade.
 *
 * Fetches the latest CLI version from GitHub Releases, strips the `cli-v`
 * prefix, and compares it against the local version using semver.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as semver from "semver";

import { makeAppError } from "../app-error/index.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CLI_TAG_PREFIX = "cli-v";

/** Default GitHub repository for CLI releases. */
export const DEFAULT_GITHUB_REPO = "agentxm/axm";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Result of resolving the latest CLI version from GitHub Releases.
 */
export interface VersionResolutionResult {
  /** The remote version string (semver, no prefix). */
  readonly remoteVersion: string;
  /** The local version string that was compared against. */
  readonly localVersion: string;
  /** Whether the local version is older than the remote version. */
  readonly isStale: boolean;
}

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

/** Minimal GitHub release shape needed for version resolution. */
const GitHubReleaseSchema = Schema.Struct({ tag_name: Schema.String });

const GitHubReleaseArraySchema = Schema.Array(GitHubReleaseSchema);

const decodeRelease = Schema.decodeUnknownEffect(GitHubReleaseSchema);
const decodeReleaseArray = Schema.decodeUnknownEffect(GitHubReleaseArraySchema);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Strip the `cli-v` prefix from a tag name, returning `Option.none()` if the
 * prefix is missing.
 */
const stripCliPrefix = (tagName: string): Option.Option<string> =>
  tagName.startsWith(CLI_TAG_PREFIX)
    ? Option.some(tagName.slice(CLI_TAG_PREFIX.length))
    : Option.none();

/**
 * Fetch a JSON response from the GitHub API, mapping transport errors to
 * `AppError`. Returns the parsed JSON value.
 */
const fetchGitHubJson = (httpClient: HttpClient.HttpClient, url: string) =>
  Effect.gen(function* () {
    const response = yield* httpClient
      .get(url, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "axm-cli",
        },
      })
      .pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "network",
            detail: "GitHub API is unreachable",
            breadcrumbs: [{ description: "Check your network connection and try again." }],
            cause,
          }),
        ),
      );

    if (response.status !== 200) {
      return yield* makeAppError({
        code: "internal",
        detail: `GitHub API returned status ${String(response.status)}`,
        breadcrumbs: [
          {
            description:
              "Check your network connection and try again. If the problem persists, GitHub may be experiencing issues.",
          },
        ],
      });
    }

    return yield* response.json.pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: "GitHub API response was not valid JSON",
          breadcrumbs: [
            {
              description:
                "This may indicate a GitHub API change. Please try again or report the issue.",
            },
          ],
          cause,
        }),
      ),
    );
  });

/**
 * Map schema decode errors to `AppError`.
 */
const mapDecodeError = (_url: string) =>
  Effect.mapError((cause: Schema.SchemaError) =>
    makeAppError({
      code: "validation",
      detail: "GitHub API returned an unexpected response shape",
      breadcrumbs: [
        {
          description:
            "This may indicate a GitHub API change. Please try again or report the issue.",
        },
      ],
      cause,
    }),
  );

/**
 * Fetch the latest release from `GET /repos/{repo}/releases/latest`.
 */
const fetchLatestRelease = (httpClient: HttpClient.HttpClient, repo: string) => {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  return Effect.flatMap(fetchGitHubJson(httpClient, url), (json) =>
    decodeRelease(json).pipe(mapDecodeError(url)),
  );
};

/**
 * Fetch the list of releases from `GET /repos/{repo}/releases`.
 */
const fetchReleases = (httpClient: HttpClient.HttpClient, repo: string) => {
  const url = `https://api.github.com/repos/${repo}/releases`;
  return Effect.flatMap(fetchGitHubJson(httpClient, url), (json) =>
    decodeReleaseArray(json).pipe(mapDecodeError(url)),
  );
};

/**
 * Resolve the latest CLI version from GitHub Releases.
 *
 * 1. Try `releases/latest` — if its tag starts with `cli-v`, strip and use it.
 * 2. Otherwise, list releases and find the first with a `cli-v` prefix.
 * 3. If no CLI release is found, fail.
 */
const resolveRemoteVersion = (httpClient: HttpClient.HttpClient, repo: string) =>
  Effect.gen(function* () {
    const release = yield* fetchLatestRelease(httpClient, repo);
    const version = stripCliPrefix(release.tag_name);
    if (Option.isSome(version)) {
      return version.value;
    }
    // Latest release is not a CLI release — fall back to listing
    const releases = yield* fetchReleases(httpClient, repo);
    for (const r of releases) {
      const v = stripCliPrefix(r.tag_name);
      if (Option.isSome(v)) {
        return v.value;
      }
    }
    return yield* makeAppError({
      code: "not_found",
      detail: "No CLI release found on GitHub",
      breadcrumbs: [
        {
          description:
            "Ensure the repository has at least one release tagged with the 'cli-v' prefix.",
        },
      ],
    });
  });

/**
 * Compare local and remote versions.
 *
 * - If `localVersion` is `"unknown"`, treat as always stale.
 * - Otherwise, use semver comparison.
 */
const compareVersions = (localVersion: string, remoteVersion: string): boolean => {
  if (localVersion === "unknown") return true;
  const local = semver.valid(localVersion);
  const remote = semver.valid(remoteVersion);
  if (local === null || remote === null) return true;
  return semver.lt(local, remote);
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Resolve the latest CLI version from GitHub Releases and compare it against
 * the local version.
 *
 * @param httpClient - HTTP client for GitHub API requests
 * @param localVersion - current CLI version (e.g. from `__AXM_VERSION__` or `package.json`)
 * @param repo - GitHub `owner/repo` (defaults to `agentxm/axm`; callers may
 *   read `AXM_INSTALL_GITHUB_REPO` from `Config` at the boundary)
 */
export const resolveLatestVersion = (
  httpClient: HttpClient.HttpClient,
  localVersion: string,
  repo: string = DEFAULT_GITHUB_REPO,
) =>
  Effect.gen(function* () {
    const remoteVersion = yield* resolveRemoteVersion(httpClient, repo);
    const isStale = compareVersions(localVersion, remoteVersion);
    return { remoteVersion, localVersion, isStale } satisfies VersionResolutionResult;
  });
