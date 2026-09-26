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
import { SkillMaterializationFailed } from "./errors.js";
import { acquireCanonicalForRef } from "../materialization/acquire-canonical.js";
import { validatePathSafety } from "../desired-state/index.js";
import { type SkillLockEntry, type TreeIntegrity } from "../desired-state/index.js";
import { copyExtensionDirectory } from "../acquisition/copy-directory.js";
import { acquiredDirectoryForRef } from "../acquisition/acquired-content.js";
import type {
  SkillExtensionRef,
  WorkspaceSkillRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { computeSkillPathsForLayout, type SkillPathSource } from "../desired-state/index.js";
import type { WorkspaceLayout } from "../desired-state/index.js";
import { isPathSafe } from "@agentxm/extension-model/unstable/path-types";
import { createSymlink } from "../desired-state/index.js";
import { protectWorkspacePath } from "../transitions/settlement/index.js";
import { validateAxmSkillCandidate } from "../resolution/index.js";

/**
 * Git-hosted and local skills share one shape: the package is already on disk,
 * so the canonical tree is either the same directory or a copy of it.
 */
const materializeFromDisk = (
  ref: Extract<SkillExtensionRef, { refType: "git-hosted" | "local" }>,
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
      ref.portable === true ? packageRoot : pathService.join(packageRoot, "src");
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
