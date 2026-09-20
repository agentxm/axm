/**
 * GitHub-latest and exact-version resolution for CLI self-upgrade.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import {
  GITHUB_REPOSITORY,
  type GithubLatestReleaseError,
  resolveGithubLatestVersion,
} from "../github-latest/index.js";
import {
  UpgradeFailed,
  type CliReleaseCatalogService,
  type SelectedRelease,
} from "../../application/index.js";

const CLI_TAG_PREFIX = "cli-v";
const CHECKSUM_ASSET_NAME = "SHA256SUMS";

const latestReleaseError = (error: GithubLatestReleaseError): UpgradeFailed => {
  switch (error.reason) {
    case "transport":
      return new UpgradeFailed({
        category: "network",
        detail: "GitHub release discovery is unreachable",
        suggestions: [{ description: "Check your network connection and try again." }],
        ...(error.cause === undefined ? {} : { cause: error.cause }),
      });
    case "timeout":
      return new UpgradeFailed({
        category: "network",
        detail: "GitHub release discovery timed out",
        suggestions: [{ description: "Check your network connection and try again." }],
      });
    case "rate-limit":
      return new UpgradeFailed({
        category: "rate_limit",
        detail:
          error.retryAfter === undefined
            ? "GitHub release discovery was rate limited"
            : `GitHub release discovery was rate limited; retry after ${error.retryAfter}`,
        suggestions: [{ description: "Wait before trying again." }],
      });
    case "not-found":
      return new UpgradeFailed({
        category: "not_found",
        detail: "GitHub does not have a latest AXM release",
        suggestions: [{ description: "Try again after a stable CLI release is published." }],
      });
    case "unavailable":
      return new UpgradeFailed({
        category: "unavailable",
        detail: `GitHub release discovery is temporarily unavailable (status ${String(error.status)})`,
        suggestions: [{ description: "Try again shortly." }],
      });
    case "invalid-location":
      return new UpgradeFailed({
        category: "validation",
        detail: "GitHub release discovery returned an invalid latest-release redirect",
        suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
      });
    case "unexpected-status":
      return new UpgradeFailed({
        category: "internal",
        detail: `GitHub release discovery returned unexpected status ${String(error.status)}`,
        suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
      });
  }
};

const selectedRelease = (
  targetVersion: string,
  requiredAsset: string,
  source: SelectedRelease["source"],
) =>
  Effect.gen(function* () {
    const tagName = `${CLI_TAG_PREFIX}${targetVersion}`;
    const assetUrl = (name: string) =>
      `https://github.com/${GITHUB_REPOSITORY}/releases/download/${tagName}/${name}`;
    return {
      targetVersion,
      source,
      release: {
        tagName,
        binaryAssetUrl: assetUrl(requiredAsset),
        checksumAssetUrl: assetUrl(CHECKSUM_ASSET_NAME),
      },
      validatedAt: DateTime.formatIso(yield* DateTime.now),
    } satisfies SelectedRelease;
  });

/** Resolve GitHub's latest stable release with one bounded web request. */
const resolveLatestVersion = (httpClient: HttpClient.HttpClient, requiredAsset: string) =>
  resolveGithubLatestVersion(httpClient).pipe(
    Effect.mapError(latestReleaseError),
    Effect.flatMap((version) => selectedRelease(version, requiredAsset, "github-latest")),
  );

/** Resolve immutable GitHub coordinates without network discovery. */
const resolveExactVersion = (targetVersion: string, requiredAsset: string) =>
  selectedRelease(targetVersion, requiredAsset, "exact-version");

/** Provider integration implements release facts; selection policy stays with the application. */
export const makeCliReleaseCatalog = (
  httpClient: HttpClient.HttpClient,
): CliReleaseCatalogService => ({
  stable: (binaryName) => resolveLatestVersion(httpClient, binaryName),
  exact: (version, binaryName) => resolveExactVersion(version, binaryName),
});
