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
  NativeEntryRemoval,
  type NativeEntryAddress,
  captureCopiedDirectory,
  copiedDirectoryReceiptPath,
  copiedDirectoryIsCurrentAt,
  copiedDirectoryCanReplaceWith,
  readCopiedDirectory,
  readCopiedDirectoryAt,
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
import {
  validateAxmSkillCandidate,
  validateAxmSkillCandidateReadingSkillMd,
} from "@agentxm/workspace-kernel/resolution";
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

      // The SKILL.md read the latest validation made. Only a reused tree's
      // validation, acquisition's last step before it returns, reads the
      // canonical bytes the caller goes on to name the skill from.
      let validatedSkillMd: ValidatedSkillMd | undefined;
      // Every reuse of the canonical tree runs this validation on canonicalPath
      // before returning, and every fetch runs it on the staged bytes.
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
          validateAxmSkillCandidateReadingSkillMd({
            ref,
            packageRoot: stagingPath,
            skillSourcePath: pathService.join(stagingPath, "src"),
          }).pipe(
            Effect.tap(({ skillMd }) =>
              Effect.sync(() => {
                validatedSkillMd = skillMd;
              }),
            ),
            Effect.asVoid,
          ),
      });
      const materialized: MaterializedSkillCanonical = {
        skillSrcPath,
        treeIntegrity: acquired.treeIntegrity,
      };
      return {
        materialized,
        skillMd: acquired.reused ? Option.fromUndefinedOr(validatedSkillMd) : Option.none(),
      };
    }),
  );

const materializeWorkspace = (ref: WorkspaceSkillRef, baseDir: string) =>
  Effect.gen(function* () {
    const pathService = yield* Path.Path;
    yield* validatePathSafety(pathService, baseDir, ref.location);
    const skillSourcePath = pathService.join(ref.location, "src");
    const { skillMd } = yield* validateAxmSkillCandidateReadingSkillMd({
      ref,
      packageRoot: ref.location,
      skillSourcePath,
    });
    const materialized: MaterializedSkillCanonical = { skillSrcPath: skillSourcePath };
    return { materialized, skillMd: Option.some(skillMd) };
  });

/** Reuse inputs sourced from the caller's operation context and lockfile. */
export type CanonicalReuseContext = {
  readonly force: boolean;
  readonly nativeInsertionEligible?: boolean;
  /** The accepted resolution the canonical tree may be kept for. */
  readonly accepted: Option.Option<SkillLockEntry>;
};

interface MaterializedSkillCanonical {
  readonly skillSrcPath: string;
  readonly treeIntegrity?: TreeIntegrity;
}

/** The SKILL.md a compatibility check read, and what that read returned. */
type ValidatedSkillMd = Effect.Success<
  ReturnType<typeof validateAxmSkillCandidateReadingSkillMd>
>["skillMd"];

const defaultReuse = { force: false, accepted: Option.none<SkillLockEntry>() };

/**
 * Materialize the canonical tree, with the SKILL.md read its compatibility
 * check made when nothing is written after that check: an authored package's
 * own source, or a reused Registry tree. A copied or fetched tree reports none.
 */
export const materializeSkillCanonicalReadingSkillMd = (args: {
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
      ).pipe(
        Effect.map((materialized) => ({
          materialized,
          skillMd: Option.none<ValidatedSkillMd>(),
        })),
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

export const materializeSkillCanonical = (
  args: Parameters<typeof materializeSkillCanonicalReadingSkillMd>[0],
) =>
  materializeSkillCanonicalReadingSkillMd(args).pipe(
    Effect.map(({ materialized }) => materialized),
  );

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

interface SkillAgentArtifactArgs {
  readonly canonicalSkillSrcPath: string;
  readonly requiresPackageContext?: boolean;
  readonly previousCanonicalSkillSrcPaths?: ReadonlyArray<string>;
  readonly targetDir: string;
  readonly sanitizedName: string;
  readonly baseDir: string;
  readonly nativeRoots: ReadonlyArray<string>;
  readonly nativeInsertionEligible: boolean;
}

/**
 * Read-only ownership checks shared by preview and the writer.
 *
 * `observed` is what an earlier inspection of the same read-only caller
 * resolved for the same native roots and canonical source, with nothing
 * written since; the writer never passes it, so its inspection resolves live.
 */
export const inspectSkillAgentArtifact = (
  args: SkillAgentArtifactArgs,
  observed?: {
    readonly rootResolutions: Effect.Success<
      ReturnType<typeof assertNativeMutationWithinRoots>
    >["rootResolutions"];
    readonly source: string;
  },
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const agentSkillPath = path.join(args.targetDir, args.sanitizedName);
    const { address, rootResolutions } = yield* assertNativeMutationWithinRoots(
      args.nativeRoots,
      agentSkillPath,
      "entry",
      args.baseDir,
      undefined,
      observed?.rootResolutions,
    );
    const source = observed?.source ?? (yield* resolveNativeReferent(args.canonicalSkillSrcPath));
    // An authored source already occupies this physical entry. Never copy it onto itself.
    if (address.entryPath === source)
      return {
        address,
        source,
        rootResolutions,
        state: "current" as const,
        ownedPreviousLink: false,
      };
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
        return {
          address,
          source,
          rootResolutions,
          state: "current" as const,
          ownedPreviousLink: false,
        };
      ownedPreviousLink =
        previousSources.includes(immediate.entryPath) && immediate.kind !== "symlink";
    }
    // The admission just resolved this entry; only other paths were read since.
    if (!args.requiresPackageContext && (yield* copiedDirectoryIsCurrentAt(address, source)))
      return {
        address,
        source,
        rootResolutions,
        state: "current" as const,
        ownedPreviousLink: false,
      };
    if (address.kind !== "absent" && !ownedPreviousLink) {
      // Only a directory can carry a copy receipt; its ownership read resolves it live.
      const receipt =
        address.kind === "directory"
          ? yield* readCopiedDirectory(address.entryPath)
          : yield* readCopiedDirectoryAt(address);
      if (
        Option.isNone(receipt) ||
        (receipt.value.source !== source && !previousSources.includes(receipt.value.source))
      ) {
        return yield* new SkillMaterializationFailed({
          detail: `Preserved unowned skill artifact at ${agentSkillPath}`,
          cause: undefined,
        });
      }
      // Only pure comparisons separate the ownership read from the replacement check.
      if (!(yield* copiedDirectoryCanReplaceWith(address.entryPath, receipt.value)))
        return yield* new SkillMaterializationFailed({
          detail: `Preserved modified copied skill at ${agentSkillPath}`,
          cause: undefined,
        });
    }
    yield* assertNoPhysicalOverlap(source, address.entryPath);
    return { address, source, rootResolutions, state: "ready" as const, ownedPreviousLink };
  });

export const ensureSkillAgentArtifact = (args: SkillAgentArtifactArgs) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const authority = yield* NativeWriteAuthority;
    const agentSkillPath = path.join(args.targetDir, args.sanitizedName);
    const { address, source, state, ownedPreviousLink } = yield* inspectSkillAgentArtifact(args);
    if (state === "current") return "unchanged" as const;
    if (address.kind !== "absent" && !ownedPreviousLink) {
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

interface SkillAgentArtifactRemoval {
  readonly targetDir: string;
  readonly sanitizedName: string;
  readonly canonicalSkillSrcPath?: string;
  readonly baseDir: string;
  readonly nativeRoots: ReadonlyArray<string>;
}

const asRemovalFailure =
  (targetDir: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.mapError(
        (cause) =>
          new SkillMaterializationFailed({
            detail: `Failed to remove skill artifact at ${targetDir}`,
            cause,
          }),
      ),
    );

/** The parent-directory unit a projected entry's created directories were recorded under. */
const parentDirectoriesTarget = (entryPath: string) => ({
  path: entryPath,
  unit: JSON.stringify(["skill-parent-directories", entryPath]),
});

/** Retire a copied entry whose receipt this removal just proved owned. */
const retireOwnedCopy = (entryPath: string) =>
  Effect.gen(function* () {
    const authority = yield* NativeWriteAuthority;
    yield* protectWorkspacePath(entryPath);
    if (yield* retireCopiedDirectory(entryPath, retireWorkspacePath))
      yield* recordFootprint({ path: entryPath, change: "modified" });
    yield* authority.retireCreatedDirectories(parentDirectoriesTarget(entryPath));
  });

/** Unlink a link entry whose immediate target this removal just proved owned. */
const unlinkOwnedLink = (entryPath: string) =>
  Effect.gen(function* () {
    const authority = yield* NativeWriteAuthority;
    yield* protectWorkspacePath(entryPath);
    // Record the completed mutation before interruption can start restoration.
    yield* Effect.uninterruptible(
      (yield* NativeEntryRemoval)
        .unlink(entryPath)
        .pipe(Effect.andThen(recordFootprint({ path: entryPath, change: "removed" }))),
    );
    yield* authority.retireCreatedDirectories(parentDirectoriesTarget(entryPath));
  });

const removeOwnedSkillAgentArtifact = (args: SkillAgentArtifactRemoval) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const target = path.join(args.targetDir, args.sanitizedName);
    const { address } = yield* assertNativeMutationWithinRoots(
      args.nativeRoots,
      target,
      "entry",
      args.baseDir,
    );
    yield* NativeWriteAuthority;
    if (address.kind === "absent") return;
    if (address.kind === "directory") {
      const receipt = yield* readCopiedDirectory(address.entryPath);
      if (
        Option.isNone(receipt) ||
        args.canonicalSkillSrcPath === undefined ||
        receipt.value.source !== (yield* resolveNativeReferent(args.canonicalSkillSrcPath))
      )
        return;
      return yield* retireOwnedCopy(address.entryPath);
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
    yield* unlinkOwnedLink(address.entryPath);
  });

export const removeSkillAgentArtifact = (args: SkillAgentArtifactRemoval) =>
  removeOwnedSkillAgentArtifact(args).pipe(asRemovalFailure(args.targetDir));

/**
 * The removal `removeSkillAgentArtifact` makes for each candidate source in
 * order. Until one of them proves ownership and writes, the entry's admission,
 * its copy receipt's source and its link's immediate target are what the first
 * attempt resolved; each source is still resolved, in order. Every source
 * after a write is removed afresh.
 */
export const removeSkillAgentArtifactForSources = (args: {
  readonly targetDir: string;
  readonly sanitizedName: string;
  readonly canonicalSkillSrcPaths: ReadonlyArray<string>;
  readonly baseDir: string;
  readonly nativeRoots: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const sources = args.canonicalSkillSrcPaths;
    if (sources.length === 0) return;
    const single = (canonicalSkillSrcPath: string) => ({
      targetDir: args.targetDir,
      sanitizedName: args.sanitizedName,
      canonicalSkillSrcPath,
      baseDir: args.baseDir,
      nativeRoots: args.nativeRoots,
    });
    const afterWrite = (owner: number) =>
      Effect.forEach(
        sources.slice(owner + 1),
        (source) => removeOwnedSkillAgentArtifact(single(source)),
        { discard: true },
      );
    const target = path.join(args.targetDir, args.sanitizedName);
    const { address } = yield* assertNativeMutationWithinRoots(
      args.nativeRoots,
      target,
      "entry",
      args.baseDir,
    );
    yield* NativeWriteAuthority;
    if (address.kind === "absent") return;
    if (address.kind === "directory") {
      const receipt = yield* readCopiedDirectory(address.entryPath);
      if (Option.isNone(receipt)) return;
      const owner = receipt.value.source;
      for (const [index, source] of sources.entries()) {
        if (owner !== (yield* resolveNativeReferent(source))) continue;
        yield* retireOwnedCopy(address.entryPath);
        return yield* afterWrite(index);
      }
      return;
    }
    const linkTarget = address.linkTarget;
    if (address.kind !== "symlink" || linkTarget === undefined) return;
    let immediate: NativeEntryAddress | undefined;
    for (const [index, source] of sources.entries()) {
      const referent = yield* resolveNativeReferent(source);
      immediate ??= yield* resolveNativeEntry(
        path.resolve(path.dirname(address.entryPath), linkTarget),
      );
      if (immediate.entryPath !== referent || immediate.kind === "symlink") continue;
      yield* unlinkOwnedLink(address.entryPath);
      return yield* afterWrite(index);
    }
  }).pipe(asRemovalFailure(args.targetDir));
