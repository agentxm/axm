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
import { stripFileProtocol } from "@agentxm/registry-client";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { SkillMaterializationFailed } from "./errors.js";
import {
  canReuseExternalPackage,
  canReuseInstalledPackage,
  materializeExternalPackageWithTreeIntegrity,
} from "../extensions/canonical-directory.js";
import { materializeRegistryPackageWithTreeIntegrity } from "../registry-materialization.js";
import { validatePathSafety } from "@agentxm/workspace-state";
import { computeMaterializedTreeIntegrity, type TreeIntegrity } from "@agentxm/workspace-state";
import { copyExtensionDirectory } from "../extensions/copy-directory.js";
import type {
  SkillExtensionRef,
  WorkspaceSkillRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { computeSkillPathsForLayout, type SkillPathSource } from "@agentxm/workspace-state";
import type { WorkspaceLayout } from "@agentxm/workspace-state";
import { isPathSafe } from "@agentxm/extension-model/unstable/path-types";
import { createSymlink } from "@agentxm/workspace-state";
import { protectWorkspacePath } from "@agentxm/workspace-transactions";
import { validateAxmSkillCandidate } from "@agentxm/extension-resolution";

const replaceExternalCanonical = (
  baseDir: string,
  copyTarget: string,
  reuse: CanonicalReuseContext,
) =>
  Effect.gen(function* () {
    const useExisting = yield* canReuseExternalPackage({
      installedPath: copyTarget,
      force: reuse.force,
      existsFailureDetail: (target) => `Failed to check if canonical path exists: ${target}`,
    });
    if (useExisting && reuse.lockedTreeIntegrity !== undefined) {
      const observedTree = yield* computeMaterializedTreeIntegrity(copyTarget);
      if (observedTree === reuse.lockedTreeIntegrity) return reuse.lockedTreeIntegrity;
    }
    const materialized = yield* materializeExternalPackageWithTreeIntegrity({
      baseDir,
      canonicalPath: copyTarget,
      sourceLocation: reuse.sourcePath,
      copyFailureCode: "internal",
      copyFailureDetail: (target) => `Failed to copy skill files to ${target}`,
    });
    return materialized.treeIntegrity;
  });

/**
 * Git-hosted and local skills share one shape: the package is already on disk,
 * so the canonical tree is either the same directory or a copy of it.
 */
const materializeFromDisk = (
  ref: Extract<SkillExtensionRef, { refType: "git-hosted" | "local" }>,
  sanitizedName: string,
  baseDir: string,
  layout: WorkspaceLayout,
  reuse: Omit<CanonicalReuseContext, "sourcePath">,
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
    const packageRoot = stripFileProtocol(ref.location);
    const sourceSkillPath =
      ref.portable === true ? packageRoot : pathService.join(packageRoot, "src");
    yield* validateAxmSkillCandidate({
      ref,
      packageRoot,
      skillSourcePath: sourceSkillPath,
    });
    const isSelfCopy = pathService.resolve(packageRoot) === pathService.resolve(canonicalPath);
    const treeIntegrity = isSelfCopy
      ? yield* computeMaterializedTreeIntegrity(canonicalPath)
      : yield* replaceExternalCanonical(baseDir, canonicalPath, {
          ...reuse,
          sourcePath: packageRoot,
        });
    return { skillSrcPath, treeIntegrity };
  });

const materializeRegistry = (
  ref: Extract<SkillExtensionRef, { refType: "registry" }>,
  sanitizedName: string,
  baseDir: string,
  layout: WorkspaceLayout,
  reuse: Omit<CanonicalReuseContext, "sourcePath">,
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

      const useExisting = yield* canReuseInstalledPackage({
        installedPath: canonicalPath,
        force: reuse.force,
        refVersion: ref.version,
        hasIntegrity: Option.isSome(ref.integrity),
        ...(reuse.lockedVersion === undefined ? {} : { lockedVersion: reuse.lockedVersion }),
        existsFailureDetail: (target) => `Failed to check if canonical path exists: ${target}`,
      });

      if (useExisting && reuse.lockedTreeIntegrity !== undefined) {
        const observedTree = yield* computeMaterializedTreeIntegrity(canonicalPath);
        if (observedTree === reuse.lockedTreeIntegrity) {
          yield* validateAxmSkillCandidate({
            ref,
            packageRoot: canonicalPath,
            skillSourcePath: skillSrcPath,
          });
          return { skillSrcPath, treeIntegrity: reuse.lockedTreeIntegrity };
        }
      }
      const materialized = yield* materializeRegistryPackageWithTreeIntegrity({
        baseDir,
        destinationPath: canonicalPath,
        sourceLocation: ref.source.location,
        owner: ref.owner,
        type: "skill",
        name: ref.name,
        version: ref.version,
        integrity: ref.integrity,
        messages: {
          integrityMismatchDetail: `Integrity mismatch for ${ref.name}@${ref.version}`,
        },
        validate: (stagingPath) =>
          validateAxmSkillCandidate({
            ref,
            packageRoot: stagingPath,
            skillSourcePath: pathService.join(stagingPath, "src"),
          }).pipe(Effect.asVoid),
      });
      return { skillSrcPath, treeIntegrity: materialized.treeIntegrity };
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
  readonly lockedVersion: string | undefined;
  readonly lockedTreeIntegrity: TreeIntegrity | undefined;
  /** Where the already-on-disk package to copy lives. */
  readonly sourcePath: string;
};

export interface MaterializedSkillCanonical {
  readonly skillSrcPath: string;
  readonly treeIntegrity?: TreeIntegrity;
}

const defaultReuse = {
  force: false,
  lockedVersion: undefined,
  lockedTreeIntegrity: undefined,
} as const;

export const materializeSkillCanonical = (args: {
  readonly ref: SkillExtensionRef;
  readonly sanitizedName: string;
  readonly baseDir: string;
  readonly layout: WorkspaceLayout;
  readonly reuse?: Omit<CanonicalReuseContext, "sourcePath">;
}) => {
  switch (args.ref.refType) {
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

export const ensureSkillAgentArtifact = (args: {
  readonly canonicalSkillSrcPath: string;
  readonly targetDir: string;
  readonly sanitizedName: string;
  readonly baseDir: string;
}) =>
  Effect.gen(function* () {
    const pathService = yield* Path.Path;
    const agentSkillPath = pathService.join(args.targetDir, args.sanitizedName);
    if (!isPathSafe(pathService, args.baseDir, agentSkillPath)) {
      return;
    }

    yield* createSymlink({
      target: args.canonicalSkillSrcPath,
      link: agentSkillPath,
    }).pipe(
      Effect.catch(() =>
        copyExtensionDirectory(args.canonicalSkillSrcPath, agentSkillPath).pipe(
          // If the copy fallback also fails, surface it — otherwise sync
          // reports success with no materialized skill artifact.
          Effect.mapError(
            (cause) =>
              new SkillMaterializationFailed({
                detail: `Failed to materialize skill artifact at ${agentSkillPath}`,
                cause,
              }),
          ),
        ),
      ),
    );
  });

export const removeSkillAgentArtifact = (args: {
  readonly targetDir: string;
  readonly sanitizedName: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const target = pathService.join(args.targetDir, args.sanitizedName);
    return yield* protectWorkspacePath(target).pipe(
      Effect.andThen(fs.remove(target, { recursive: true, force: true })),
      Effect.mapError(
        (cause) =>
          new SkillMaterializationFailed({
            detail: `Failed to remove skill artifact at ${target}`,
            cause,
          }),
      ),
    );
  });
