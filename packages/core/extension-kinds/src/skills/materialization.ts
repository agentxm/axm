// @effect-diagnostics nodeBuiltinImport:off — FileSystem.remove uses rm; unlink removes an owned directory link without traversing its source
import { unlink } from "node:fs/promises";

/**
 * Canonical skill materialization per source kind, plus the per-agent artifact
 * writers the skill projections apply.
 *
 * Every function keeps the platform in `R`; nothing captures a `FileSystem` or
 * `Path` into a closure or provides one at a leaf.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import { fromFileLocation } from "@agentxm/host-primitives";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { PlatformError } from "effect/PlatformError";
import {
  assertNativeMutationWithinRoots,
  assertNoPhysicalOverlap,
  resolveNativeEntry,
  resolveNativeReferent,
  NativeLocationError,
  captureCopiedDirectory,
  copiedDirectoryReceiptPath,
  copiedDirectoryIsCurrent,
  copiedDirectoryCanReplace,
  readCopiedDirectory,
  retireCopiedDirectory,
} from "@agentxm/workspace-kernel/locations";
import { NativeWriteAuthority } from "@agentxm/workspace-kernel/agent-adapters";
import { SkillActivationUnsupported, SkillMaterializationFailed } from "./errors.js";
import { acquireCanonicalForRef } from "@agentxm/workspace-kernel/materialization";
import {
  validatePathSafety,
  type SkillLockEntry,
  type TreeIntegrity,
  computeSkillPathsForLayout,
  type SkillPathSource,
  type WorkspaceLayout,
  createSymlink,
} from "@agentxm/workspace-kernel/workspace-state";
import type {
  SkillExtensionRef,
  WorkspaceSkillRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";
import {
  protectWorkspacePath,
  recordFootprint,
  retireWorkspacePath,
} from "@agentxm/workspace-kernel/settlement";
import { validateAxmSkillCandidate } from "@agentxm/workspace-kernel/resolution";
import {
  copyExtensionDirectory,
  acquiredDirectoryForRef,
} from "@agentxm/workspace-kernel/acquisition";

/**
 * Git-hosted and local skills share one shape: the package is already on disk,
 * so the canonical tree is either the same directory or a copy of it.
 */
const materializeFromDisk = (
  ref: Extract<SkillExtensionRef, { refType: "git-hosted" | "local" | "http" }>,
  sanitizedName: string,
  baseDir: string,
  layout: WorkspaceLayout,
  reuse: CanonicalReuseContext,
) =>
  Effect.gen(function* () {
    const pathService = yield* Path.Path;
    const { canonicalPath, skillSrcPath } = computeSkillPathsForLayout(
      pathService.join,
      layout,
      ref,
      sanitizedName,
    );
    yield* validatePathSafety(pathService, baseDir, canonicalPath);
    const packageRoot = yield* acquiredDirectoryForRef(ref, fromFileLocation(ref.location));
    const sourceSkillPath =
      ref.portable === true
        ? pathService.join(packageRoot, ref.distribution?.componentPath ?? ".")
        : pathService.join(packageRoot, "src");
    yield* validateAxmSkillCandidate({
      ref,
      packageRoot,
      skillSourcePath: sourceSkillPath,
    });
    const acquired = yield* acquireCanonicalForRef({
      ref,
      type: "skill",
      baseDir,
      canonicalPath,
      accepted: reuse.accepted,
      nativeInsertionEligible: reuse.nativeInsertionEligible === true,
      force: reuse.force,
      copyFailure: {
        code: "internal",
        detail: (target) => `Failed to copy skill files to ${target}`,
      },
      external: { reuse: true },
    });
    return { skillSrcPath, treeIntegrity: acquired.treeIntegrity };
  });

const materializeRegistry = (
  ref: Extract<SkillExtensionRef, { refType: "registry" }>,
  sanitizedName: string,
  baseDir: string,
  layout: WorkspaceLayout,
  reuse: CanonicalReuseContext,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const pathService = yield* Path.Path;
      const source: SkillPathSource = ref;
      const { canonicalPath, skillSrcPath } = computeSkillPathsForLayout(
        pathService.join,
        layout,
        source,
        sanitizedName,
      );
      yield* validatePathSafety(pathService, baseDir, canonicalPath);

      const acquired = yield* acquireCanonicalForRef({
        ref,
        type: "skill",
        baseDir,
        canonicalPath,
        accepted: reuse.accepted,
        nativeInsertionEligible: reuse.nativeInsertionEligible === true,
        force: reuse.force,
        copyFailure: {
          code: "internal",
          detail: (target) => `Failed to copy skill files to ${target}`,
        },
        validate: (stagingPath) =>
          validateAxmSkillCandidate({
            ref,
            packageRoot: stagingPath,
            skillSourcePath: pathService.join(stagingPath, "src"),
          }).pipe(Effect.asVoid),
      });
      if (acquired.reused) {
        yield* validateAxmSkillCandidate({
          ref,
          packageRoot: canonicalPath,
          skillSourcePath: skillSrcPath,
        });
        return { skillSrcPath, treeIntegrity: acquired.treeIntegrity };
      }
      return { skillSrcPath, treeIntegrity: acquired.treeIntegrity };
    }),
  );

const materializeWorkspace = (ref: WorkspaceSkillRef, baseDir: string) =>
  Effect.gen(function* () {
    const pathService = yield* Path.Path;
    yield* validatePathSafety(pathService, baseDir, ref.location);
    const skillSourcePath = pathService.join(ref.location, "src");
    yield* validateAxmSkillCandidate({
      ref,
      packageRoot: ref.location,
      skillSourcePath,
    });
    const materialized: MaterializedSkillCanonical = { skillSrcPath: skillSourcePath };
    return materialized;
  });

/** Reuse inputs sourced from the caller's operation context and lockfile. */
export type CanonicalReuseContext = {
  readonly force: boolean;
  readonly nativeInsertionEligible?: boolean;
  /** The accepted resolution the canonical tree may be kept for. */
  readonly accepted: Option.Option<SkillLockEntry>;
};

export interface MaterializedSkillCanonical {
  readonly skillSrcPath: string;
  readonly treeIntegrity?: TreeIntegrity;
}

const defaultReuse = { force: false, accepted: Option.none<SkillLockEntry>() };

export const materializeSkillCanonical = (args: {
  readonly ref: SkillExtensionRef;
  readonly sanitizedName: string;
  readonly baseDir: string;
  readonly layout: WorkspaceLayout;
  readonly reuse?: CanonicalReuseContext;
}) => {
  switch (args.ref.refType) {
    case "http":
    case "git-hosted":
    case "local":
      return materializeFromDisk(
        args.ref,
        args.sanitizedName,
        args.baseDir,
        args.layout,
        args.reuse ?? defaultReuse,
      );
    case "registry":
      return materializeRegistry(
        args.ref,
        args.sanitizedName,
        args.baseDir,
        args.layout,
        args.reuse ?? defaultReuse,
      );
    case "workspace":
      return materializeWorkspace(args.ref, args.baseDir);
  }
};

const unsupportedSymlink = (cause: unknown): boolean => {
  if (!(cause instanceof PlatformError)) return false;
  const original = "cause" in cause.reason ? cause.reason.cause : undefined;
  return (
    typeof original === "object" &&
    original !== null &&
    "code" in original &&
    (original.code === "ENOSYS" ||
      original.code === "ENOTSUP" ||
      original.code === "EOPNOTSUPP" ||
      (original.code === "EPERM" && process.platform === "win32"))
  );
};

export const ensureSkillAgentArtifact = (args: {
  readonly canonicalSkillSrcPath: string;
  readonly requiresPackageContext?: boolean;
  readonly previousCanonicalSkillSrcPaths?: ReadonlyArray<string>;
  readonly targetDir: string;
  readonly sanitizedName: string;
  readonly baseDir: string;
  readonly nativeRoots: ReadonlyArray<string>;
  readonly nativeInsertionEligible: boolean;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const authority = yield* NativeWriteAuthority;
    const agentSkillPath = path.join(args.targetDir, args.sanitizedName);
    const { address } = yield* assertNativeMutationWithinRoots(
      args.nativeRoots,
      agentSkillPath,
      "entry",
      args.baseDir,
    );
    const source = yield* resolveNativeReferent(args.canonicalSkillSrcPath);
    // An authored source already occupies this physical entry. Never copy it onto itself.
    if (address.entryPath === source) return "unchanged" as const;
    let ownedPreviousLink = false;
    const previousSources = yield* Effect.forEach(
      args.previousCanonicalSkillSrcPaths ?? [],
      resolveNativeReferent,
    );
    if (address.kind === "symlink" && address.linkTarget !== undefined) {
      const immediate = yield* resolveNativeEntry(
        path.resolve(path.dirname(address.entryPath), address.linkTarget),
      );
      if (immediate.entryPath === source && immediate.kind !== "symlink")
        return "unchanged" as const;
      ownedPreviousLink =
        previousSources.includes(immediate.entryPath) && immediate.kind !== "symlink";
    }
    if (
      !args.requiresPackageContext &&
      (yield* copiedDirectoryIsCurrent(address.entryPath, source))
    )
      return "unchanged" as const;
    if (address.kind !== "absent" && !ownedPreviousLink) {
      const receipt = yield* readCopiedDirectory(address.entryPath);
      if (
        Option.isNone(receipt) ||
        (receipt.value.source !== source && !previousSources.includes(receipt.value.source))
      ) {
        return yield* new SkillMaterializationFailed({
          detail: `Preserved unowned skill artifact at ${agentSkillPath}`,
          cause: undefined,
        });
      }
      if (!(yield* copiedDirectoryCanReplace(address.entryPath)))
        return yield* new SkillMaterializationFailed({
          detail: `Preserved modified copied skill at ${agentSkillPath}`,
          cause: undefined,
        });
      // A copied projection is updated only through its bounded receipt, never recursive deletion.
      yield* protectWorkspacePath(address.entryPath);
      yield* retireCopiedDirectory(address.entryPath, retireWorkspacePath);
      yield* recordFootprint({ path: address.entryPath, change: "modified" });
      const remaining = yield* resolveNativeEntry(address.entryPath);
      if (remaining.kind !== "absent") {
        return yield* new SkillMaterializationFailed({
          detail: `Preserved modified copied skill at ${agentSkillPath}`,
          cause: undefined,
        });
      }
    }
    yield* assertNoPhysicalOverlap(source, address.entryPath);
    const parentTarget = {
      path: address.entryPath,
      unit: JSON.stringify(["skill-parent-directories", address.entryPath]),
    };
    const capture = yield* authority.captureCreatedDirectories({
      ...parentTarget,
      eligible: args.nativeInsertionEligible,
    });
    const createdDirectories = yield* authority.createParentDirectories(address.entryPath);
    yield* createSymlink({ target: source, link: address.entryPath }).pipe(
      Effect.catchTag("SymlinkCreationError", (error) =>
        Effect.gen(function* () {
          if (error.step !== "symlink" || !unsupportedSymlink(error.cause)) return yield* error;
          if (args.requiresPackageContext)
            return yield* new SkillActivationUnsupported({
              detail: `Skill ${args.sanitizedName} requires directory-link support to retain its package context at ${agentSkillPath}; enable directory links or select a supported filesystem`,
            });
          yield* Effect.scoped(
            Effect.gen(function* () {
              const fs = yield* FileSystem.FileSystem;
              const temporary = yield* fs.makeTempDirectoryScoped({
                directory: path.dirname(address.entryPath),
                prefix: ".axm-skill-copy-",
              });
              const staged = path.join(temporary, "entry");
              yield* fs.makeDirectory(staged);
              yield* copyExtensionDirectory(source, staged);
              const receipt = yield* captureCopiedDirectory(staged, source);
              if (Option.isNone(receipt))
                return yield* new SkillMaterializationFailed({
                  detail: `Filesystem cannot establish ownership for a copied skill at ${agentSkillPath}`,
                  cause: undefined,
                });
              const current = yield* resolveNativeEntry(address.entryPath);
              if (current.kind !== "absent")
                return yield* new SkillMaterializationFailed({
                  detail: `Skill target changed before copied publication: ${agentSkillPath}`,
                  cause: undefined,
                });
              const receiptTarget = yield* copiedDirectoryReceiptPath(address.entryPath);
              yield* assertNativeMutationWithinRoots(
                args.nativeRoots,
                receiptTarget,
                "entry",
                args.baseDir,
              );
              if ((yield* resolveNativeEntry(receiptTarget)).kind !== "absent")
                return yield* new NativeLocationError({
                  target: receiptTarget,
                  reason: "workspace-conflict",
                });
              yield* protectWorkspacePath(receiptTarget);
              yield* protectWorkspacePath(address.entryPath);
              yield* fs.rename(yield* copiedDirectoryReceiptPath(staged), receiptTarget);
              yield* recordFootprint({ path: receiptTarget, change: "created" });
              yield* fs.rename(staged, address.entryPath);
              yield* recordFootprint({ path: address.entryPath, change: "created" });
            }),
          );
        }),
      ),
    );
    yield* authority.recordCreatedDirectories({ capture, createdDirectories });
    return address.kind === "absent" ? ("created" as const) : ("updated" as const);
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof SkillMaterializationFailed || cause instanceof SkillActivationUnsupported
        ? cause
        : new SkillMaterializationFailed({
            detail: `Failed to materialize skill artifact at ${args.targetDir}`,
            cause,
          }),
    ),
  );

export const removeSkillAgentArtifact = (args: {
  readonly targetDir: string;
  readonly sanitizedName: string;
  readonly canonicalSkillSrcPath?: string;
  readonly baseDir: string;
  readonly nativeRoots: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const target = path.join(args.targetDir, args.sanitizedName);
    const { address } = yield* assertNativeMutationWithinRoots(
      args.nativeRoots,
      target,
      "entry",
      args.baseDir,
    );
    const authority = yield* NativeWriteAuthority;
    const parentTarget = {
      path: address.entryPath,
      unit: JSON.stringify(["skill-parent-directories", address.entryPath]),
    };
    if (address.kind === "absent") return;
    if (address.kind === "directory") {
      const receipt = yield* readCopiedDirectory(address.entryPath);
      if (
        Option.isNone(receipt) ||
        args.canonicalSkillSrcPath === undefined ||
        receipt.value.source !== (yield* resolveNativeReferent(args.canonicalSkillSrcPath))
      )
        return;
      yield* protectWorkspacePath(address.entryPath);
      if (yield* retireCopiedDirectory(address.entryPath, retireWorkspacePath))
        yield* recordFootprint({ path: address.entryPath, change: "modified" });
      yield* authority.retireCreatedDirectories(parentTarget);
      return;
    }
    if (
      args.canonicalSkillSrcPath === undefined ||
      address.kind !== "symlink" ||
      address.linkTarget === undefined
    )
      return;
    const source = yield* resolveNativeReferent(args.canonicalSkillSrcPath);
    const immediate = yield* resolveNativeEntry(
      path.resolve(path.dirname(address.entryPath), address.linkTarget),
    );
    if (immediate.entryPath !== source || immediate.kind === "symlink") return;
    yield* protectWorkspacePath(address.entryPath);
    yield* Effect.tryPromise(() => unlink(address.entryPath));
    yield* recordFootprint({ path: address.entryPath, change: "removed" });
    yield* authority.retireCreatedDirectories(parentTarget);
  }).pipe(
    Effect.mapError(
      (cause) =>
        new SkillMaterializationFailed({
          detail: `Failed to remove skill artifact at ${args.targetDir}`,
          cause,
        }),
    ),
  );
