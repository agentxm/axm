import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as semver from "semver";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  extensionTypeToPlural,
  fqnInvalidErrorToAppError,
  parseFqn,
  type ExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import { createRegistryClient } from "@agentxm/client-core/unstable/registry";
import type { Version } from "@agentxm/client-core/unstable/version-constraints";
import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";

import { resolveManifestVersionInfo, type VersionableExtensionType } from "./extension-version.js";

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

export const checkPublishVersionPreflightForLocalVersion = (args: {
  readonly fqn: string;
  readonly type: ExtensionType;
  readonly version: Version;
  readonly registryName: string;
  readonly registryUrl: string;
  readonly force: boolean;
  readonly checkVersionOrder?: boolean;
  readonly duplicateVersionSuggestions?: ReadonlyArray<SuggestedAction>;
  readonly olderVersionSuggestions?: ReadonlyArray<SuggestedAction>;
}) =>
  Effect.gen(function* () {
    const fqn = yield* Result.mapError(parseFqn(args.fqn), fqnInvalidErrorToAppError);
    if (fqn.type !== args.type) {
      return yield* makeAppError({
        code: "validation",
        detail: `Expected ${extensionTypeToPlural[args.type]} handle, got ${args.fqn}`,
      });
    }
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

    if (Option.isNone(indexOption)) return;

    const existingVersion = indexOption.value.versions.find(
      (entry) => entry.version === args.version,
    );
    if (existingVersion !== undefined) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Cannot publish: version ${args.version} is already published for ${args.fqn}. Published versions are immutable.`,
        suggestions: args.duplicateVersionSuggestions ?? [
          {
            description: "Bump the manifest version.",
            cmd: `axm version ${args.fqn} patch`,
          },
        ],
      });
    }

    if (args.checkVersionOrder === false) return;

    const latest = indexOption.value.versions[0]?.version;
    if (latest === undefined || semver.gt(args.version, latest)) return;
    if (args.force) return;

    const plural = extensionTypeToPlural[args.type];
    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot publish: local version ${args.version} is not greater than the latest published version ${latest}.`,
      suggestions: args.olderVersionSuggestions ?? [
        {
          description: "Bump the manifest version.",
          cmd: `axm version ${args.fqn} patch`,
        },
        {
          description: `Re-run with --force only if publishing an older unpublished ${plural} version is intentional`,
        },
      ],
    });
  });

export const checkPublishVersionPreflight = (args: {
  readonly fqn: string;
  readonly type: VersionableExtensionType;
  readonly registryName: string;
  readonly registryUrl: string;
  readonly force: boolean;
}) =>
  Effect.gen(function* () {
    const local = yield* resolveManifestVersionInfo(args.fqn, args.type);
    return yield* checkPublishVersionPreflightForLocalVersion({
      fqn: local.fqn,
      type: args.type,
      version: local.version,
      registryName: args.registryName,
      registryUrl: args.registryUrl,
      force: args.force,
    });
  });
