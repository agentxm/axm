/** One reuse-or-acquire decision for canonical extension content. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Config from "effect/Config";
import type { RegistryClientFactory, RegistryClientFailure } from "@agentxm/registry-client";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { extensionRefName } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { fromFileLocation } from "@agentxm/host-primitives";
import { acquiredDirectoryForRef } from "../acquisition/acquired-content.js";
import {
  materializeExternalPackageWithTreeIntegrity,
  reusableCanonicalTree,
  type CanonicalDirectoryReplacementError,
} from "../acquisition/canonical-directory.js";
import type {
  PackageCopyFailed,
  PackageMaterializationFailed,
  ArchiveIntegrityMismatch,
} from "../acquisition/errors.js";
import type {
  LockEntry,
  MaterializedTreeInvalid,
  PathTraversalDetected,
  TreeIntegrity,
} from "../desired-state/index.js";
import { extensionRefLifecycleWarnings } from "../lifecycle/warnings.js";
import { materializeRegistryPackageWithTreeIntegrity } from "./registry-materialization.js";

export type AcquirableExtensionRef = Exclude<ExtensionRef, { readonly refType: "workspace" }>;

export interface AcquireCanonicalArgs<E = never> {
  readonly ref: AcquirableExtensionRef;
  readonly type: ExtensionType;
  readonly baseDir: string;
  readonly canonicalPath: string;
  readonly accepted: Option.Option<LockEntry>;
  readonly force: boolean;
  readonly copyFailure: {
    readonly code: "internal" | "validation";
    readonly detail: (target: string) => string;
  };
  /** Knowledge stages bytes separately; reuse is still judged at canonicalPath. */
  readonly stage?: { readonly baseDir: string; readonly destinationPath: string };
  readonly external?: {
    readonly sourcePath?: (packageRoot: string) => string;
    readonly targetPath?: string;
    readonly reuse?: boolean;
  };
  readonly validate?: (
    stagingPath: string,
  ) => Effect.Effect<void, E, FileSystem.FileSystem | Path.Path>;
}

export interface AcquiredCanonical {
  readonly packageRoot: string;
  readonly treeIntegrity: TreeIntegrity;
  readonly reused: boolean;
}

export const integrityMismatchDetail = (type: ExtensionType, name: string, version: string) =>
  `Integrity mismatch for ${type}:${name}@${version}`;

export const acquireCanonicalForRef = <E = never>(
  args: AcquireCanonicalArgs<E>,
): Effect.Effect<
  AcquiredCanonical,
  | E
  | PackageMaterializationFailed
  | PackageCopyFailed
  | ArchiveIntegrityMismatch
  | CanonicalDirectoryReplacementError
  | MaterializedTreeInvalid
  | RegistryClientFailure
  | PathTraversalDetected
  | Config.ConfigError,
  FileSystem.FileSystem | Path.Path | RegistryClientFactory
> =>
  Effect.gen(function* () {
    const { ref } = args;
    if (ref.refType === "registry" || args.external?.reuse === true) {
      const reusable = yield* reusableCanonicalTree({
        canonicalPath: args.canonicalPath,
        requested:
          ref.refType === "registry"
            ? {
                refType: "registry",
                owner: ref.owner,
                name: ref.name,
                version: ref.version,
                publisherBindingId: ref.publisherBindingId,
              }
            : { refType: ref.refType, name: extensionRefName(ref) },
        accepted: args.accepted,
        force: args.force,
      });
      if (Option.isSome(reusable)) {
        return {
          packageRoot: args.canonicalPath,
          treeIntegrity: reusable.value,
          reused: true,
        } satisfies AcquiredCanonical;
      }
    }

    if (ref.refType === "registry") {
      const materialized = yield* materializeRegistryPackageWithTreeIntegrity({
        baseDir: args.stage?.baseDir ?? args.baseDir,
        destinationPath: args.stage?.destinationPath ?? args.canonicalPath,
        sourceLocation: ref.source.location,
        owner: ref.owner,
        type: args.type,
        name: ref.name,
        version: ref.version,
        integrity: ref.integrity,
        publisherBindingId: ref.publisherBindingId,
        lifecycleWarnings: extensionRefLifecycleWarnings(ref),
        messages: {
          integrityMismatchDetail: integrityMismatchDetail(args.type, ref.name, ref.version),
        },
        ...(args.validate === undefined ? {} : { validate: args.validate }),
      });
      return {
        packageRoot: materialized.canonicalPath,
        treeIntegrity: materialized.treeIntegrity,
        reused: false,
      } satisfies AcquiredCanonical;
    }

    const packageRoot = yield* acquiredDirectoryForRef(ref, fromFileLocation(ref.location));
    const materialized = yield* materializeExternalPackageWithTreeIntegrity({
      baseDir: args.stage?.baseDir ?? args.baseDir,
      canonicalPath: args.external?.targetPath ?? args.stage?.destinationPath ?? args.canonicalPath,
      sourceLocation: args.external?.sourcePath?.(packageRoot) ?? packageRoot,
      copyFailureCode: args.copyFailure.code,
      copyFailureDetail: args.copyFailure.detail,
    });
    return {
      packageRoot: materialized.canonicalPath,
      treeIntegrity: materialized.treeIntegrity,
      reused: false,
    } satisfies AcquiredCanonical;
  });

/** Admit a workspace ref only at the canonical authored location. */
export const verifyWorkspaceRefLocation = <Err>(args: {
  readonly ref: Extract<ExtensionRef, { readonly refType: "workspace" }>;
  readonly scope: "project" | "user";
  readonly canonicalPath: string;
  readonly invalid: (detail: string) => Err;
}): Effect.Effect<void, Err, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (
      args.ref.scope !== args.scope ||
      path.resolve(args.ref.location) !== path.resolve(args.canonicalPath)
    ) {
      return yield* Effect.fail(
        args.invalid(`Invalid workspace ${args.ref.type} source location: ${args.ref.location}`),
      );
    }
  });
