/**
 * Stable-channel and exact-version resolution for CLI self-upgrade.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import {
  STABLE_CHANNEL_REPOSITORY,
  STABLE_CHANNEL_URL,
  decodeStableChannelDocument,
} from "@agentxm/extension-model/unstable/release-channel";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";

import {
  UpgradeFailed,
  type CliReleaseCatalogService,
  type SelectedRelease,
} from "../../application/index.js";

const CLI_TAG_PREFIX = "cli-v";
const CHECKSUM_ASSET_NAME = "SHA256SUMS";
const CHANNEL_REQUEST_TIMEOUT = "10 seconds";

const channelErrorForStatus = (status: number, retryAfter: string | undefined) => {
  if (status === 403 || status === 429) {
    return new UpgradeFailed({
      category: "rate_limit",
      detail:
        retryAfter === undefined
          ? "Stable release discovery was rate limited"
          : `Stable release discovery was rate limited; retry after ${retryAfter}`,
      suggestions: [{ description: "Wait before trying again." }],
    });
  }
  if (status === 404) {
    return new UpgradeFailed({
      category: "not_found",
      detail: "The stable release channel does not exist",
      suggestions: [{ description: "Try again after a stable CLI release is promoted." }],
    });
  }
  if (status >= 500) {
    return new UpgradeFailed({
      category: "unavailable",
      detail: `Stable release discovery is temporarily unavailable (status ${String(status)})`,
      suggestions: [{ description: "Try again shortly." }],
    });
  }
  return new UpgradeFailed({
    category: "internal",
    detail: `Stable release discovery returned unexpected status ${String(status)}`,
    suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
  });
};

const mapChannelDecodeError = (cause: Schema.SchemaError) =>
  new UpgradeFailed({
    category: "validation",
    detail: "Stable release discovery returned an invalid channel document",
    suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
    cause,
  });

/**
 * Resolve the promoted stable CLI release with exactly one bounded channel
 * request. GitHub release enumeration is deliberately not part of discovery.
 */
const resolveLatestVersion = (httpClient: HttpClient.HttpClient, requiredAsset: string) =>
  Effect.gen(function* () {
    const response = yield* httpClient
      .get(STABLE_CHANNEL_URL, {
        headers: {
          Accept: "application/json",
          "User-Agent": "axm-cli",
        },
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new UpgradeFailed({
              category: "network",
              detail: "Stable release discovery is unreachable",
              suggestions: [{ description: "Check your network connection and try again." }],
              cause,
            }),
        ),
        Effect.timeoutOrElse({
          duration: CHANNEL_REQUEST_TIMEOUT,
          orElse: () =>
            Effect.fail(
              new UpgradeFailed({
                category: "network",
                detail: "Stable release discovery timed out",
                suggestions: [{ description: "Check your network connection and try again." }],
              }),
            ),
        }),
      );

    if (response.status !== 200) {
      return yield* channelErrorForStatus(
        response.status,
        response.headers["retry-after"] ?? response.headers["Retry-After"],
      );
    }

    const json = yield* response.json.pipe(
      Effect.mapError(
        (cause) =>
          new UpgradeFailed({
            category: "validation",
            detail: "Stable release discovery returned invalid JSON",
            suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
            cause,
          }),
      ),
    );
    const channel = yield* decodeStableChannelDocument(json).pipe(
      Effect.mapError(mapChannelDecodeError),
    );
    const binary = channel.artifacts.binaries.find((candidate) => candidate.name === requiredAsset);

    if (binary === undefined) {
      return yield* new UpgradeFailed({
        category: "unavailable",
        detail: `CLI ${channel.version} is promoted, but ${requiredAsset} is unavailable`,
        suggestions: [{ description: "Try again after release promotion is repaired." }],
      });
    }

    return {
      targetVersion: channel.version,
      release: {
        tagName: channel.release.tag,
        binaryAssetUrl: binary.url,
        checksumAssetUrl: channel.artifacts.checksumManifest.url,
      },
      channel,
      validatedAt: DateTime.formatIso(yield* DateTime.now),
      etag: response.headers["etag"] ?? response.headers["ETag"] ?? null,
    } satisfies SelectedRelease;
  });

/** Resolve immutable GitHub coordinates without network discovery. */
const resolveExactVersion = (targetVersion: string, requiredAsset: string) =>
  Effect.gen(function* () {
    const tagName = `${CLI_TAG_PREFIX}${targetVersion}`;
    const assetUrl = (name: string) =>
      `https://github.com/${STABLE_CHANNEL_REPOSITORY}/releases/download/${tagName}/${name}`;

    return {
      targetVersion,
      release: {
        tagName,
        binaryAssetUrl: assetUrl(requiredAsset),
        checksumAssetUrl: assetUrl(CHECKSUM_ASSET_NAME),
      },
      channel: null,
      validatedAt: DateTime.formatIso(yield* DateTime.now),
      etag: null,
    } satisfies SelectedRelease;
  });

/** Provider integration implements release facts; selection policy stays with the application. */
export const makeCliReleaseCatalog = (
  httpClient: HttpClient.HttpClient,
): CliReleaseCatalogService => ({
  stable: (binaryName) => resolveLatestVersion(httpClient, binaryName),
  exact: (version, binaryName) => resolveExactVersion(version, binaryName),
});
