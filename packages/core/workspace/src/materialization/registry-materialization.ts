/**
 * Registry-backed canonical package materialization.
 *
 * The canonical-directory staging/swap machinery lives beside this module;
 * this module owns only the registry fetch, verify, and extract path.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { Version } from "@agentxm/extension-model/unstable/version-constraints";
import {
  computeIntegrity,
  RegistryClientFactory,
  extractZip,
  withBufferedArchiveBudget,
} from "@agentxm/registry-client";
import type { GetExtensionPackageArgs, RegistryClientFailure } from "@agentxm/registry-client";
import type {
  ExtensionName,
  ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { ArchiveIntegrityMismatch, PackageMaterializationFailed } from "../acquisition/errors.js";
import { AcquiredContent, registryContentKey } from "../acquisition/acquired-content.js";
import { copyExtensionDirectory } from "../acquisition/copy-directory.js";
import {
  recoverCanonicalDirectory,
  replaceCanonicalDirectoryWithInspection,
  type CanonicalDirectoryReplacementError,
  type MaterializedPackage,
} from "../acquisition/canonical-directory.js";
import { makeThrottledUnitProgress, observeChildUnit } from "../transitions/planning/index.js";
import {
  computeMaterializedTreeIntegrity,
  type MaterializedTreeInvalid,
  type TreeIntegrity,
} from "../desired-state/index.js";

export interface RegistryPackageMaterializationMessages {
  readonly integrityMismatchDetail: string;
}

export interface MaterializeRegistryPackageArgs<E = never> {
  readonly baseDir: string;
  /**
   * Canonical installed path for this extension. Bytes always land in a sibling
   * staging directory first and are swapped in after validation.
   */
  readonly destinationPath: string;
  readonly sourceLocation: URL;
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
  readonly integrity: Option.Option<string>;
  readonly publisherBindingId: string;
  readonly lifecycleWarnings?: ReadonlyArray<string>;
  readonly messages: RegistryPackageMaterializationMessages;
  readonly validate?: (
    stagingPath: string,
  ) => Effect.Effect<void, E, FileSystem.FileSystem | Path.Path>;
}

/**
 * Fetch, verify, and extract a registry package into `destinationPath`.
 *
 * Always writes. Whether new bytes are needed at all is
 * `canReuseInstalledPackage`'s decision, which the caller makes against the
 * canonical installed path before choosing a destination.
 *
 * Registry client and archive-extraction failures stay typed in the channel;
 * the application boundary converts them once.
 */
export const materializeRegistryPackageWithTreeIntegrity = <E = never>(
  args: MaterializeRegistryPackageArgs<E>,
): Effect.Effect<
  MaterializedPackage,
  | E
  | Config.ConfigError
  | RegistryClientFailure
  | ArchiveIntegrityMismatch
  | CanonicalDirectoryReplacementError
  | MaterializedTreeInvalid,
  FileSystem.FileSystem | Path.Path | RegistryClientFactory
> =>
  Effect.gen(function* () {
    yield* recoverCanonicalDirectory({
      baseDir: args.baseDir,
      canonicalPath: args.destinationPath,
    });
    const acquired = yield* Effect.serviceOption(AcquiredContent);
    const source = Option.isSome(acquired)
      ? yield* Effect.gen(function* () {
          const key = registryContentKey({
            sourceLocation: args.sourceLocation,
            owner: args.owner,
            type: args.type,
            name: args.name,
            version: args.version,
            integrity: args.integrity,
            publisherBindingId: args.publisherBindingId,
          });
          const files = acquired.value.filesByKey.get(key);
          if (files === undefined) {
            return yield* new PackageMaterializationFailed({
              path: args.destinationPath,
              step: "prepare-staging",
              cause:
                "The selected Registry package was not acquired before the workspace transition",
            });
          }
          return { kind: "prepared", directory: files.directory } as const;
        })
      : yield* Effect.gen(function* () {
          const client = yield* (yield* RegistryClientFactory).forLocation(args.sourceLocation);
          // Continuous download progress reaches the lifecycle broadcast throttled:
          // tens of events per archive, attributed to the unit that is running and
          // to the attempt the request policy is on.
          const reportProgress = yield* makeThrottledUnitProgress({ unit: "bytes" });
          const packageArgs: GetExtensionPackageArgs = Option.match(args.integrity, {
            onNone: () => ({
              owner: args.owner,
              type: args.type,
              name: args.name,
              version: Option.some(args.version),
              onProgress: (progress) =>
                reportProgress(progress.done, progress.total, progress.attempt),
            }),
            onSome: (integrity) => ({
              owner: args.owner,
              type: args.type,
              name: args.name,
              exact: {
                version: args.version,
                integrity,
                publisherBindingId: args.publisherBindingId,
                ...(args.lifecycleWarnings === undefined
                  ? {}
                  : { lifecycleWarnings: args.lifecycleWarnings }),
              },
              onProgress: (progress) =>
                reportProgress(progress.done, progress.total, progress.attempt),
            }),
          });
          const { archive, warnings } = yield* client.getExtensionPackage(packageArgs);
          const distinctWarnings = [
            ...new Set([...(args.lifecycleWarnings ?? []), ...(warnings ?? [])]),
          ];
          yield* Effect.forEach(distinctWarnings, (warning) => Effect.logWarning(warning), {
            discard: true,
          });
          if (Option.isSome(args.integrity)) {
            const actualIntegrity = yield* computeIntegrity(archive);
            if (actualIntegrity !== args.integrity.value) {
              return yield* new ArchiveIntegrityMismatch({
                subject: args.messages.integrityMismatchDetail,
              });
            }
          }
          return { kind: "archive", archive } as const;
        });

    const result = yield* replaceCanonicalDirectoryWithInspection<
      TreeIntegrity,
      E | RegistryClientFailure | MaterializedTreeInvalid | PackageMaterializationFailed,
      FileSystem.FileSystem | Path.Path
    >({
      baseDir: args.baseDir,
      canonicalPath: args.destinationPath,
      populate: (stagingPath) =>
        source.kind === "prepared"
          ? copyExtensionDirectory(source.directory, stagingPath).pipe(
              Effect.mapError(
                (cause) =>
                  new PackageMaterializationFailed({
                    path: stagingPath,
                    step: "prepare-staging",
                    cause,
                  }),
              ),
            )
          : observeChildUnit(
              {
                id: `registry-extract:${args.owner}/${args.type}/${args.name}`,
                label: `extracting ${args.name}`,
              },
              extractZip(source.archive, stagingPath),
            ),
      ...(args.validate === undefined ? {} : { validate: args.validate }),
      inspect: computeMaterializedTreeIntegrity,
    });
    return {
      canonicalPath: result.canonicalPath,
      treeIntegrity: result.inspection,
    };
  }).pipe(withBufferedArchiveBudget);

export const materializeRegistryPackage = <E = never>(args: MaterializeRegistryPackageArgs<E>) =>
  materializeRegistryPackageWithTreeIntegrity(args).pipe(
    Effect.map(({ canonicalPath }) => canonicalPath),
  );
