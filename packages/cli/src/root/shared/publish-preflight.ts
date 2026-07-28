import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as semver from "semver";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  extensionTypeToPlural,
  fqnInvalidErrorToAppError,
  formatFqn,
  parseFqn,
  type ExtensionName,
  type ExtensionType,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import { createRegistryClient } from "@agentxm/client-core/unstable/registry";
import type { Version } from "@agentxm/client-core/unstable/version-constraints";

import { resolveManifestVersionInfo, type VersionableExtensionType } from "./extension-version.js";

export const VERSION_ALREADY_PUBLISHED_REASON = "version_already_published" as const;

export const alreadyPublishedVersionConflict = (args: {
  readonly fqn: string;
  readonly version: Version;
}): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Cannot publish: version ${args.version} is already published for ${args.fqn}. Published versions are immutable.`,
    suggestions: [
      {
        description: "Bump the manifest version.",
        cmd: `axm version ${args.fqn} patch`,
      },
      {
        description: "Re-run with --on-existing skip to skip already-published versions.",
      },
    ],
  });

export interface PublishIdentity {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
}

export type ExistingVersionPolicy = "error" | "skip";

export type PublishPreflightDecision =
  | {
      readonly action: "publish";
      readonly identity: PublishIdentity;
      readonly fqn: string;
    }
  | {
      readonly action: "skip";
      readonly identity: PublishIdentity;
      readonly fqn: string;
      readonly reason: typeof VERSION_ALREADY_PUBLISHED_REASON;
    };

const isUnsupportedRegistryTypeError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "code" in error &&
  error.code === "internal" &&
  "detail" in error &&
  typeof error.detail === "string" &&
  error.detail.includes("Remote discovery response does not match expected schema");

export const checkPublishVersionPreflight = (args: {
  readonly fqn: string;
  readonly type: VersionableExtensionType;
  readonly registryName: string;
  readonly registryUrl: string;
  readonly force: boolean;
  readonly existingVersionPolicy?: ExistingVersionPolicy;
}) =>
  Effect.gen(function* () {
    const local = yield* resolveManifestVersionInfo(args.fqn, args.type);
    const fqn = yield* Effect.fromResult(
      Result.mapError(parseFqn(args.fqn), fqnInvalidErrorToAppError),
    );
    const identity = {
      owner: fqn.owner,
      type: fqn.type,
      name: fqn.name,
      version: local.version,
    } satisfies PublishIdentity;
    const formattedFqn = formatFqn(fqn);
    const client = yield* createRegistryClient(args.registryUrl);
    const indexOption = yield* client
      .getExtensionIndex({
        owner: fqn.owner,
        type: fqn.type,
        name: fqn.name,
      })
      .pipe(
        Effect.catch((error) =>
          isUnsupportedRegistryTypeError(error)
            ? Effect.fail(
                makeAppError({
                  code: "unavailable",
                  detail: `Registry source "${args.registryName}" does not support ${extensionTypeToPlural[args.type]} publish checks.`,
                  suggestions: [
                    {
                      description:
                        "Use another registry source or retry after the registry supports this extension type.",
                    },
                  ],
                  cause: error,
                }),
              )
            : Effect.fail(error),
        ),
      );

    if (Option.isNone(indexOption)) {
      return {
        action: "publish",
        identity,
        fqn: formattedFqn,
      } satisfies PublishPreflightDecision;
    }

    const existingVersion = indexOption.value.versions.find(
      (entry) => entry.version === local.version,
    );
    if (existingVersion !== undefined) {
      if (args.existingVersionPolicy === "skip") {
        return {
          action: "skip",
          identity,
          fqn: formattedFqn,
          reason: VERSION_ALREADY_PUBLISHED_REASON,
        } satisfies PublishPreflightDecision;
      }

      return yield* alreadyPublishedVersionConflict({ fqn: local.fqn, version: local.version });
    }

    const latest = indexOption.value.versions[0]?.version;
    if (latest === undefined || semver.gt(local.version, latest)) {
      return {
        action: "publish",
        identity,
        fqn: formattedFqn,
      } satisfies PublishPreflightDecision;
    }
    if (args.force) {
      return {
        action: "publish",
        identity,
        fqn: formattedFqn,
      } satisfies PublishPreflightDecision;
    }

    const plural = extensionTypeToPlural[args.type];
    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot publish: local version ${local.version} is not greater than the latest published version ${latest}.`,
      suggestions: [
        {
          description: "Bump the manifest version.",
          cmd: `axm version ${local.fqn} patch`,
        },
        {
          description: `Re-run with --force only if publishing an older unpublished ${plural} version is intentional`,
        },
      ],
    });
  });
