/** One reuse-or-acquire decision for canonical extension content. */

import * as Effect from "effect/Effect";
import type { NativeWriteAuthority } from "../agent-adapters/index.js";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import type * as Config from "effect/Config";
import type { RegistryClientFactory, RegistryClientFailure } from "@agentxm/registry-client";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import {
  type ExtensionRef,
  extensionRefName,
} from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { fromFileLocation } from "@agentxm/host-primitives";
import type { LockEntry, PathTraversalDetected, TreeIntegrity } from "../workspace-state/index.js";
import {
  observeAcceptedCanonicalReuse,
  computeMaterializedTreeIntegrity,
  MaterializedTreeInvalid,
  LockfileReader,
  retainedPackageBindings,
  retainedPackageKeyForRef,
} from "../workspace-state/index.js";
import { extensionRefLifecycleWarnings } from "../resolution/index.js";
import { materializeRegistryPackageWithTreeIntegrity } from "./registry-materialization.js";
import {
  AcquiredContent,
  sourceRefContentKey,
  recordMaterializedPackage,
  acquiredDirectoryForRef,
  prepareCanonicalParents,
  materializeExternalPackageWithTreeIntegrity,
  reusableCanonicalTree,
  type CanonicalDirectoryReplacementError,
  type PackageCopyFailed,
  PackageMaterializationFailed,
  type ArchiveIntegrityMismatch,
} from "../acquisition/index.js";

export type AcquirableExtensionRef = Exclude<ExtensionRef, { readonly refType: "workspace" }>;

export interface AcquireCanonicalArgs<E = never> {
  readonly ref: AcquirableExtensionRef;
  readonly type: ExtensionType;
  readonly baseDir: string;
  readonly canonicalPath: string;
  readonly accepted: Option.Option<LockEntry>;
  readonly force: boolean;
  /** Captured new reachability; missing canonical bytes alone grant no cleanup proof. */
  readonly nativeInsertionEligible?: boolean;
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
  NativeWriteAuthority | FileSystem.FileSystem | Path.Path | RegistryClientFactory
> =>
  Effect.gen(function* () {
    const { ref } = args;
    const acquired = yield* Effect.serviceOption(AcquiredContent);
    const cache = Option.isSome(acquired) ? acquired.value.materializedPackages : undefined;
    const destination = args.external?.targetPath ?? args.canonicalPath;
    const key = JSON.stringify([sourceRefContentKey(ref), destination]);
    if (cache !== undefined) {
      const previous = (yield* Ref.get(cache)).get(key);
      if (previous !== undefined) {
        const current = yield* Effect.option(computeMaterializedTreeIntegrity(destination));
        if (Option.isSome(current) && current.value === previous) {
          if (args.validate !== undefined) yield* args.validate(destination);
          return { packageRoot: destination, treeIntegrity: previous, reused: true };
        }
      }
    }
    if (!args.force && Option.isNone(args.accepted) && ref.refType !== "registry") {
      const reader = yield* Effect.serviceOption(LockfileReader);
      const accepted = Option.isNone(reader)
        ? undefined
        : retainedPackageBindings(
            yield* reader.value.lockfile.pipe(
              Effect.mapError(
                (cause) =>
                  new PackageMaterializationFailed({
                    path: args.canonicalPath,
                    step: "prepare-staging",
                    cause,
                  }),
              ),
            ),
          ).find((binding) => binding.packageKey === retainedPackageKeyForRef(ref));
      if (accepted !== undefined) {
        const entry = accepted.entry;
        const sameSnapshot =
          ref.refType === "git-hosted"
            ? "commit" in entry.resolved &&
              entry.resolved.commit === ref.gitCommitSha &&
              entry.resolved.tree === ref.gitTreeSha
            : ref.refType === "http"
              ? JSON.stringify(entry.resolved) === JSON.stringify(ref.snapshot)
              : (yield* computeMaterializedTreeIntegrity(
                  yield* acquiredDirectoryForRef(ref, fromFileLocation(ref.location)),
                )) === entry.treeIntegrity;
        if (!sameSnapshot)
          return yield* new MaterializedTreeInvalid({
            root: destination,
            reason:
              "Adding this component would advance an already retained package; update the package before selecting it",
          });
        const current = yield* computeMaterializedTreeIntegrity(destination);
        if (current !== entry.treeIntegrity)
          return yield* new MaterializedTreeInvalid({
            root: destination,
            reason:
              "The retained package has changed; restore its accepted content before adding a component",
          });
        if (args.validate !== undefined) yield* args.validate(destination);
        return { packageRoot: destination, treeIntegrity: current, reused: true };
      }
    }
    if (ref.refType === "registry" || args.external?.reuse === true) {
      const reuse =
        args.stage === undefined ? reusableCanonicalTree : observeAcceptedCanonicalReuse;
      const reusable = yield* reuse({
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

    const parentReceipt =
      args.stage === undefined
        ? {
            prepareParents: prepareCanonicalParents({
              canonicalPath:
                ref.refType === "registry"
                  ? args.canonicalPath
                  : (args.external?.targetPath ?? args.canonicalPath),
              eligible: args.nativeInsertionEligible === true,
            }),
          }
        : {};
    if (ref.refType === "registry") {
      const materialized = yield* materializeRegistryPackageWithTreeIntegrity<
        E | PackageMaterializationFailed,
        NativeWriteAuthority | FileSystem.FileSystem | Path.Path
      >({
        baseDir: args.stage?.baseDir ?? args.baseDir,
        transient: args.stage !== undefined,
        ...parentReceipt,
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
    const materialized = yield* materializeExternalPackageWithTreeIntegrity<
      E | PackageMaterializationFailed,
      NativeWriteAuthority | FileSystem.FileSystem | Path.Path
    >({
      baseDir: args.stage?.baseDir ?? args.baseDir,
      transient: args.stage !== undefined,
      ...parentReceipt,
      canonicalPath: args.external?.targetPath ?? args.stage?.destinationPath ?? args.canonicalPath,
      sourceLocation: args.external?.sourcePath?.(packageRoot) ?? packageRoot,
      copyFailureCode: args.copyFailure.code,
      copyFailureDetail: args.copyFailure.detail,
      ...(args.validate === undefined ? {} : { validate: args.validate }),
    });
    return {
      packageRoot: materialized.canonicalPath,
      treeIntegrity: materialized.treeIntegrity,
      reused: false,
    } satisfies AcquiredCanonical;
  }).pipe(
    Effect.tap((materialized) =>
      args.stage !== undefined
        ? Effect.void
        : recordMaterializedPackage(
            args.ref,
            args.external?.targetPath ?? args.canonicalPath,
            materialized.treeIntegrity,
          ),
    ),
  );

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
