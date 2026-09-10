/**
 * Registry-backed canonical package materialization.
 *
 * The canonical-directory staging/swap machinery lives beside this module;
 * this module owns only the registry fetch, verify, and extract path.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type { Version, VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { computeIntegrity, createRegistryClient, extractZip } from "@agentxm/registry-client";
import type { RegistryClientFailure } from "@agentxm/registry-client";
import type {
  ExtensionName,
  ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { ArchiveIntegrityMismatch } from "./extensions/errors.js";
import {
  recoverCanonicalDirectory,
  replaceCanonicalDirectoryWithInspection,
  type CanonicalDirectoryReplacementError,
  type MaterializedPackage,
} from "./extensions/canonical-directory.js";
import { makeThrottledUnitProgress } from "@agentxm/workspace-operations";
import {
  computeMaterializedTreeIntegrity,
  type MaterializedTreeInvalid,
  type TreeIntegrity,
} from "@agentxm/workspace-state";

const registryLocationForClient = (location: URL): string =>
  location.protocol === "file:" ? location.pathname : location.href;

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
  readonly version: Version | VersionRange;
  readonly integrity: Option.Option<string>;
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
  | RegistryClientFailure
  | ArchiveIntegrityMismatch
  | CanonicalDirectoryReplacementError
  | MaterializedTreeInvalid,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> =>
  Effect.gen(function* () {
    yield* recoverCanonicalDirectory({
      baseDir: args.baseDir,
      canonicalPath: args.destinationPath,
    });
    const client = yield* createRegistryClient(registryLocationForClient(args.sourceLocation));
    // Continuous download progress reaches the lifecycle broadcast throttled:
    // tens of events per archive, attributed to the unit that is running.
    const reportProgress = yield* makeThrottledUnitProgress({ unit: "bytes" });
    const { archive } = yield* client.getExtensionPackage({
      owner: args.owner,
      type: args.type,
      name: args.name,
      version: Option.some(args.version),
      onProgress: (progress) => reportProgress(progress.done, progress.total),
    });

    if (Option.isSome(args.integrity)) {
      const actualIntegrity = yield* computeIntegrity(archive);
      if (actualIntegrity !== args.integrity.value) {
        return yield* new ArchiveIntegrityMismatch({
          subject: args.messages.integrityMismatchDetail,
        });
      }
    }

    const result = yield* replaceCanonicalDirectoryWithInspection<
      TreeIntegrity,
      E | RegistryClientFailure | MaterializedTreeInvalid,
      FileSystem.FileSystem | Path.Path
    >({
      baseDir: args.baseDir,
      canonicalPath: args.destinationPath,
      populate: (stagingPath) => extractZip(archive, stagingPath),
      ...(args.validate === undefined ? {} : { validate: args.validate }),
      inspect: computeMaterializedTreeIntegrity,
    });
    return {
      canonicalPath: result.canonicalPath,
      treeIntegrity: result.inspection,
    };
  });

export const materializeRegistryPackage = <E = never>(args: MaterializeRegistryPackageArgs<E>) =>
  materializeRegistryPackageWithTreeIntegrity(args).pipe(
    Effect.map(({ canonicalPath }) => canonicalPath),
  );
