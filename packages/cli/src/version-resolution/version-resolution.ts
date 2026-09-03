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
  type StableChannelDocumentV1,
} from "@agentxm/extension-model/unstable/release-channel";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as semver from "semver";

import { makeAppError } from "../app-error/index.js";

const CLI_TAG_PREFIX = "cli-v";
const CHECKSUM_ASSET_NAME = "SHA256SUMS";
const CHANNEL_REQUEST_TIMEOUT = "10 seconds";

/** Default GitHub repository used for immutable exact-version artifacts. */
export const DEFAULT_GITHUB_REPO = STABLE_CHANNEL_REPOSITORY;

export type VersionRelation = "upgrade-available" | "current" | "local-newer" | "unknown-local";

export interface ResolvedRelease {
  readonly tagName: string;
  readonly binaryAssetUrl: string | null;
  readonly checksumAssetUrl: string | null;
}

export interface VersionResolutionResult {
  /** Selected target version without the `cli-v` prefix. */
  readonly targetVersion: string;
  /** Valid observed local version, or null when it cannot be determined. */
  readonly localVersion: string | null;
  readonly versionRelation: VersionRelation;
  readonly release: ResolvedRelease;
  /** Validated channel document for latest-mode resolution. */
  readonly channel: StableChannelDocumentV1 | null;
  /** Time at which the channel response was validated. */
  readonly validatedAt: string;
  /** Validator supplied by the channel origin, when present. */
  readonly etag: string | null;
}

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

const channelErrorForStatus = (status: number, retryAfter: string | undefined) => {
  if (status === 403 || status === 429) {
    return makeAppError({
      code: "rate_limit",
      detail:
        retryAfter === undefined
          ? "Stable release discovery was rate limited"
          : `Stable release discovery was rate limited; retry after ${retryAfter}`,
      suggestions: [{ description: "Wait before trying again." }],
    });
  }
  if (status === 404) {
    return makeAppError({
      code: "not_found",
      detail: "The stable release channel does not exist",
      suggestions: [{ description: "Try again after a stable CLI release is promoted." }],
    });
  }
  if (status >= 500) {
    return makeAppError({
      code: "unavailable",
      detail: `Stable release discovery is temporarily unavailable (status ${String(status)})`,
      suggestions: [{ description: "Try again shortly." }],
    });
  }
  return makeAppError({
    code: "internal",
    detail: `Stable release discovery returned unexpected status ${String(status)}`,
    suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
  });
};

const mapChannelDecodeError = (cause: Schema.SchemaError) =>
  makeAppError({
    code: "validation",
    detail: "Stable release discovery returned an invalid channel document",
    suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
    cause,
  });

const releaseAsset = (document: StableChannelDocumentV1, requiredAsset: string | undefined) => {
  if (requiredAsset === undefined) return null;
  return document.artifacts.binaries.find((candidate) => candidate.name === requiredAsset) ?? null;
};

/**
 * Resolve the promoted stable CLI release with exactly one bounded channel
 * request. GitHub release enumeration is deliberately not part of discovery.
 */
export const resolveLatestVersion = (
  httpClient: HttpClient.HttpClient,
  localVersion: string | null,
  requiredAsset?: string,
  channelUrl = STABLE_CHANNEL_URL,
) =>
  Effect.gen(function* () {
    const response = yield* httpClient
      .get(channelUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "axm-cli",
        },
      })
      .pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "network",
            detail: "Stable release discovery is unreachable",
            suggestions: [{ description: "Check your network connection and try again." }],
            cause,
          }),
        ),
        Effect.timeoutOrElse({
          duration: CHANNEL_REQUEST_TIMEOUT,
          orElse: () =>
            Effect.fail(
              makeAppError({
                code: "network",
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
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: "Stable release discovery returned invalid JSON",
          suggestions: [{ description: "Try again. If the problem persists, report the issue." }],
          cause,
        }),
      ),
    );
    const channel = yield* decodeStableChannelDocument(json).pipe(
      Effect.mapError(mapChannelDecodeError),
    );
    const binary = releaseAsset(channel, requiredAsset);

    if (requiredAsset !== undefined && binary === null) {
      return yield* makeAppError({
        code: "unavailable",
        detail: `CLI ${channel.version} is promoted, but ${requiredAsset} is unavailable`,
        suggestions: [{ description: "Try again after release promotion is repaired." }],
      });
    }

    const relation = classifyRelation(localVersion, channel.version);
    return {
      targetVersion: channel.version,
      localVersion: relation.localVersion,
      versionRelation: relation.versionRelation,
      release: {
        tagName: channel.release.tag,
        binaryAssetUrl: binary?.url ?? null,
        checksumAssetUrl: channel.artifacts.checksumManifest.url,
      },
      channel,
      validatedAt: DateTime.formatIso(yield* DateTime.now),
      etag: response.headers["etag"] ?? response.headers["ETag"] ?? null,
    } satisfies VersionResolutionResult;
  });

const normalizeExactVersion = (requestedVersion: string) => {
  if (requestedVersion.startsWith("v")) {
    return null;
  }
  const normalized = semver.valid(requestedVersion);
  if (
    normalized === null ||
    normalized !== requestedVersion ||
    semver.prerelease(normalized) !== null
  ) {
    return null;
  }
  return normalized;
};

/** Resolve immutable GitHub coordinates without network discovery. */
export const resolveExactVersion = (
  requestedVersion: string,
  localVersion: string | null,
  requiredAsset?: string,
  repository = DEFAULT_GITHUB_REPO,
) =>
  Effect.gen(function* () {
    const targetVersion = normalizeExactVersion(requestedVersion);
    if (targetVersion === null) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid exact CLI version: ${requestedVersion}`,
        suggestions: [{ description: "Use a stable semantic version without a leading v." }],
      });
    }

    const tagName = `${CLI_TAG_PREFIX}${targetVersion}`;
    const assetUrl = (name: string) =>
      `https://github.com/${repository}/releases/download/${tagName}/${name}`;
    const relation = classifyRelation(localVersion, targetVersion);

    return {
      targetVersion,
      localVersion: relation.localVersion,
      versionRelation: relation.versionRelation,
      release: {
        tagName,
        binaryAssetUrl: requiredAsset === undefined ? null : assetUrl(requiredAsset),
        checksumAssetUrl: assetUrl(CHECKSUM_ASSET_NAME),
      },
      channel: null,
      validatedAt: DateTime.formatIso(yield* DateTime.now),
      etag: null,
    } satisfies VersionResolutionResult;
  });
