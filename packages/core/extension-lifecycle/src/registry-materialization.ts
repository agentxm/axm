/**
 * Registry-backed canonical package materialization.
 *
 * The canonical-directory staging/swap machinery lives in
 * `@agentxm/extension-workspace`; this module owns only the registry
 * fetch/verify/extract path.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type { Version, VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { createRegistryClient, extractZip } from "@agentxm/registry-client";
import { computeIntegrity } from "./internal/integrity.js";
import type {
  ExtensionName,
  ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  ArchiveIntegrityMismatch,
  recoverCanonicalDirectory,
  replaceCanonicalDirectoryWithInspection,
  type CanonicalDirectoryReplacementError,
  type MaterializedPackage,
} from "@agentxm/extension-workspace";
import { CoupledDependencyFailure } from "@agentxm/extension-workspace";
import { coupleLifecycleDependencyFailure } from "./errors.js";
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
 * Registry client and archive-extraction failures travel opaquely as coupled
 * dependency failures; the application boundary restores and converts them.
 */
export const materializeRegistryPackageWithTreeIntegrity = <E = never>(
  args: MaterializeRegistryPackageArgs<E>,
): Effect.Effect<
  MaterializedPackage,
  | E
  | CoupledDependencyFailure
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
    const { archive } = yield* client
      .getExtensionPackage({
        owner: args.owner,
        type: args.type,
        name: args.name,
        version: Option.some(args.version),
        onProgress: (progress) => reportProgress(progress.done, progress.total),
      })
      .pipe(Effect.mapError(coupleLifecycleDependencyFailure));

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
      E | CoupledDependencyFailure | MaterializedTreeInvalid,
      FileSystem.FileSystem | Path.Path
    >({
      baseDir: args.baseDir,
      canonicalPath: args.destinationPath,
      populate: (stagingPath) =>
        extractZip(archive, stagingPath).pipe(Effect.mapError(coupleLifecycleDependencyFailure)),
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
