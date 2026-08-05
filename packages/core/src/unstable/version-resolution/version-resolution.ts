/**
 * GitHub release selection and version comparison for CLI self-upgrade.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as semver from "semver";

import { makeAppError } from "../app-error/index.js";

const CLI_TAG_PREFIX = "cli-v";
const RELEASE_PAGE_SIZE = 100;
const MAX_RELEASE_PAGES = 100;
const CHECKSUM_ASSET_NAME = "SHA256SUMS";

/** Default GitHub repository for CLI releases. */
export const DEFAULT_GITHUB_REPO = "agentxm/axm";

export type VersionRelation = "upgrade-available" | "current" | "local-newer" | "unknown-local";

export interface ResolvedRelease {
  readonly tagName: string;
  readonly binaryAssetUrl: string | null;
  readonly checksumAssetUrl: string | null;
}

export interface VersionResolutionResult {
  /** Selected target version without the `cli-v` prefix. */
  readonly targetVersion: string;
  /** @deprecated Use `targetVersion`. Retained for one compatibility window. */
  readonly remoteVersion: string;
  /** Valid observed local version, or null when it cannot be determined. */
  readonly localVersion: string | null;
  readonly versionRelation: VersionRelation;
  /** @deprecated Use `versionRelation`. */
  readonly isStale: boolean;
  readonly release: ResolvedRelease;
}

const GitHubReleaseAssetSchema = Schema.Struct({
  name: Schema.String,
  browser_download_url: Schema.optional(Schema.String),
});

const GitHubReleaseSchema = Schema.Struct({
  tag_name: Schema.String,
  draft: Schema.optional(Schema.Boolean),
  prerelease: Schema.optional(Schema.Boolean),
  assets: Schema.optional(Schema.Array(GitHubReleaseAssetSchema)),
});

const GitHubReleaseArraySchema = Schema.Array(GitHubReleaseSchema);
type GitHubRelease = typeof GitHubReleaseSchema.Type;

const decodeReleaseArray = Schema.decodeUnknownEffect(GitHubReleaseArraySchema);

const githubErrorForStatus = (status: number) => {
  if (status === 403 || status === 429) {
    return makeAppError({
      code: "rate_limit",
      detail: "GitHub API rate limit prevented release resolution",
      suggestions: [{ description: "Wait for the rate limit to reset and try again." }],
    });
  }
  if (status === 404) {
    return makeAppError({
      code: "not_found",
      detail: "GitHub release repository was not found",
      suggestions: [{ description: "Check the configured GitHub repository and try again." }],
    });
  }
  if (status >= 500) {
    return makeAppError({
      code: "unavailable",
      detail: `GitHub API is temporarily unavailable (status ${String(status)})`,
      suggestions: [{ description: "Try again shortly." }],
    });
  }
  return makeAppError({
    code: "internal",
    detail: `GitHub API returned unexpected status ${String(status)}`,
    suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
  });
};

const mapDecodeError = (cause: Schema.SchemaError) =>
  makeAppError({
    code: "validation",
    detail: "GitHub API returned an unexpected release response",
    suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
    cause,
  });

const nextLink = (header: string | undefined): string | null => {
  if (header === undefined) return null;
  for (const part of header.split(",")) {
    const match = /^\s*<([^>]+)>\s*;\s*rel="next"\s*$/u.exec(part);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
};

interface ReleasePage {
  readonly releases: ReadonlyArray<GitHubRelease>;
  readonly next: string | null;
}

const fetchReleasePage = (httpClient: HttpClient.HttpClient, url: string) =>
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
            suggestions: [{ description: "Check your network connection and try again." }],
            cause,
          }),
        ),
      );

    if (response.status !== 200) return yield* githubErrorForStatus(response.status);

    const json = yield* response.json.pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: "GitHub API response was not valid JSON",
          suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
          cause,
        }),
      ),
    );
    const releases = yield* decodeReleaseArray(json).pipe(Effect.mapError(mapDecodeError));

    return {
      releases,
      next: nextLink(response.headers["link"] ?? response.headers["Link"]),
    } satisfies ReleasePage;
  });

const fetchAllReleases = (httpClient: HttpClient.HttpClient, repo: string, apiBaseUrl: string) =>
  Effect.gen(function* () {
    let url: string | null =
      `${apiBaseUrl.replace(/\/$/u, "")}/repos/${repo}/releases?per_page=${String(RELEASE_PAGE_SIZE)}`;
    const releases: Array<GitHubRelease> = [];
    const visited = new Set<string>();

    while (url !== null) {
      if (visited.has(url) || visited.size >= MAX_RELEASE_PAGES) {
        return yield* makeAppError({
          code: "validation",
          detail: "GitHub release pagination was cyclic or exceeded the safety limit",
          suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
        });
      }
      visited.add(url);
      const page: ReleasePage = yield* fetchReleasePage(httpClient, url);
      releases.push(...page.releases);
      url = page.next;
    }

    return releases;
  });

interface StableCandidate {
  readonly release: GitHubRelease;
  readonly version: string;
}

const selectTarget = (releases: ReadonlyArray<GitHubRelease>) =>
  Effect.gen(function* () {
    const cliTagged = releases.filter((release) => release.tag_name.startsWith(CLI_TAG_PREFIX));
    if (cliTagged.length === 0) {
      return yield* makeAppError({
        code: "not_found",
        detail: "No CLI-tagged GitHub release exists",
        suggestions: [{ description: "Try again after a CLI release is published." }],
      });
    }

    const stableSemver: Array<StableCandidate> = [];
    for (const release of cliTagged) {
      const rawVersion = release.tag_name.slice(CLI_TAG_PREFIX.length);
      const validVersion = semver.valid(rawVersion);
      if (validVersion === null || semver.prerelease(validVersion) !== null) continue;
      stableSemver.push({ release, version: validVersion });
    }

    if (stableSemver.length === 0) {
      return yield* makeAppError({
        code: "validation",
        detail: "CLI-tagged releases exist, but none has a valid stable semantic version",
        suggestions: [{ description: "Publish a stable release tagged cli-v<semver>." }],
      });
    }

    const eligible = stableSemver.filter(
      ({ release }) => release.draft !== true && release.prerelease !== true,
    );
    if (eligible.length === 0) {
      return yield* makeAppError({
        code: "unavailable",
        detail: "No published stable CLI release is currently available",
        suggestions: [{ description: "Try again after release publication completes." }],
      });
    }

    eligible.sort((left, right) => semver.rcompare(left.version, right.version));
    const selected = eligible[0];
    if (selected === undefined) {
      return yield* makeAppError({
        code: "internal",
        detail: "Release selection produced no target",
      });
    }
    return selected;
  });

const singleAssetUrl = (release: GitHubRelease, assetName: string): string | null => {
  const matches = (release.assets ?? []).filter((asset) => asset.name === assetName);
  if (matches.length !== 1) return null;
  const url = matches[0]?.browser_download_url;
  return url === undefined || url.length === 0 ? null : url;
};

const classifyRelation = (
  localVersion: string | null,
  targetVersion: string,
): { readonly localVersion: string | null; readonly versionRelation: VersionRelation } => {
  const validLocal = localVersion === null ? null : semver.valid(localVersion);
  if (validLocal === null) {
    return { localVersion: null, versionRelation: "unknown-local" };
  }
  const comparison = semver.compare(validLocal, targetVersion);
  return {
    localVersion: validLocal,
    versionRelation:
      comparison < 0 ? "upgrade-available" : comparison > 0 ? "local-newer" : "current",
  };
};

/**
 * Resolve the highest eligible stable CLI release and compare it with the
 * observed local version. When `requiredAsset` is provided, the selected
 * release must contain exactly one platform binary and one checksum manifest.
 */
export const resolveLatestVersion = (
  httpClient: HttpClient.HttpClient,
  localVersion: string | null,
  repo: string = DEFAULT_GITHUB_REPO,
  requiredAsset?: string,
  apiBaseUrl = "https://api.github.com",
) =>
  Effect.gen(function* () {
    const releases = yield* fetchAllReleases(httpClient, repo, apiBaseUrl);
    const selected = yield* selectTarget(releases);
    const relation = classifyRelation(localVersion, selected.version);
    const binaryAssetUrl =
      requiredAsset === undefined ? null : singleAssetUrl(selected.release, requiredAsset);
    const checksumAssetUrl =
      requiredAsset === undefined ? null : singleAssetUrl(selected.release, CHECKSUM_ASSET_NAME);

    if (requiredAsset !== undefined && (binaryAssetUrl === null || checksumAssetUrl === null)) {
      return yield* makeAppError({
        code: "unavailable",
        detail: `CLI ${selected.version} is published, but required release assets are unavailable`,
        suggestions: [{ description: "Try again after release publication completes." }],
      });
    }

    return {
      targetVersion: selected.version,
      remoteVersion: selected.version,
      localVersion: relation.localVersion,
      versionRelation: relation.versionRelation,
      isStale:
        relation.versionRelation === "upgrade-available" ||
        relation.versionRelation === "unknown-local",
      release: {
        tagName: selected.release.tag_name,
        binaryAssetUrl,
        checksumAssetUrl,
      },
    } satisfies VersionResolutionResult;
  });
