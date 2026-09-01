import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError } from "../app-error/index.js";
import { SkillMaterializationFailed } from "./errors.js";
import { toAppError } from "../app-error/conversions.js";
import {
  canReuseExternalPackage,
  canReuseInstalledPackage,
  materializeExternalPackageWithTreeIntegrity,
  materializeRegistryPackageWithTreeIntegrity,
} from "../extensions/index.js";
import { validatePathSafety } from "@agentxm/workspace-state";
import { computeMaterializedTreeIntegrity, type TreeIntegrity } from "@agentxm/workspace-state";
import { copyExtensionDirectory } from "../extensions/utils.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type {
  SkillExtensionRef,
  WorkspaceSkillRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { computeSkillPathsForLayout, type SkillPathSource } from "@agentxm/workspace-state";
import type { WorkspaceLayout } from "@agentxm/workspace-state";
import { stripFileProtocol } from "../utils/index.js";
import { isPathSafe } from "@agentxm/workspace-state";
import { createSymlink } from "@agentxm/workspace-state";
import { protectWorkspacePath } from "@agentxm/workspace-state";
import { validateAxmSkillCandidate } from "./axm-skill-candidate.js";

export type ProvideFs = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, Exclude<R, FileSystem.FileSystem | Path.Path>>;

export type ProvideRegistryMaterialization = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, Exclude<R, FileSystem.FileSystem | HttpClient.HttpClient | Path.Path>>;

const replaceExternalCanonical = (
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  sanitizedName: string,
  sourcePath: string,
  copyTarget: string,
  reuse: CanonicalReuseContext,
  provide: ProvideFs,
) =>
  Effect.gen(function* () {
    const useExisting = yield* provide(
      canReuseExternalPackage({
        installedPath: copyTarget,
        force: reuse.force,
        existsFailureDetail: (target) => `Failed to check if canonical path exists: ${target}`,
      }),
    );
    if (useExisting && reuse.lockedTreeIntegrity !== undefined) {
      const observedTree = yield* provide(computeMaterializedTreeIntegrity(copyTarget));
      if (observedTree === reuse.lockedTreeIntegrity) return reuse.lockedTreeIntegrity;
    }
    const materialized = yield* provide(
      materializeExternalPackageWithTreeIntegrity({
        baseDir,
        canonicalPath: copyTarget,
        sourceLocation: sourcePath,
        copyFailureCode: "internal",
        copyFailureDetail: (target) => `Failed to copy skill files to ${target}`,
      }),
    );
    return materialized.treeIntegrity;
  });

const materializeGitHosted = (
  ref: Extract<SkillExtensionRef, { refType: "git-hosted" }>,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  layout: WorkspaceLayout,
  provide: ProvideFs,
  reuse: CanonicalReuseContext,
) =>
  Effect.gen(function* () {
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
    yield* provide(
      validateAxmSkillCandidate({
        ref,
        packageRoot,
        skillSourcePath: sourceSkillPath,
      }),
    );
    const isSelfCopy = pathService.resolve(packageRoot) === pathService.resolve(canonicalPath);
    const treeIntegrity = isSelfCopy
      ? yield* provide(computeMaterializedTreeIntegrity(canonicalPath))
      : yield* replaceExternalCanonical(
          fs,
          pathService,
          baseDir,
          sanitizedName,
          packageRoot,
          canonicalPath,
          reuse,
          provide,
        );
    return { skillSrcPath, treeIntegrity };
  });

const materializeLocal = (
  ref: Extract<SkillExtensionRef, { refType: "local" }>,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  layout: WorkspaceLayout,
  provide: ProvideFs,
  reuse: CanonicalReuseContext,
) =>
  Effect.gen(function* () {
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
    yield* provide(
      validateAxmSkillCandidate({
        ref,
        packageRoot,
        skillSourcePath: sourceSkillPath,
      }),
    );
    const isSelfCopy = pathService.resolve(packageRoot) === pathService.resolve(canonicalPath);
    const treeIntegrity = isSelfCopy
      ? yield* provide(computeMaterializedTreeIntegrity(canonicalPath))
      : yield* replaceExternalCanonical(
          fs,
          pathService,
          baseDir,
          sanitizedName,
          packageRoot,
          canonicalPath,
          reuse,
          provide,
        );
    return { skillSrcPath, treeIntegrity };
  });

const materializeRegistry = (
  ref: Extract<SkillExtensionRef, { refType: "registry" }>,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  layout: WorkspaceLayout,
  provide: ProvideFs,
  provideRegistry: ProvideRegistryMaterialization,
  reuse: CanonicalReuseContext,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const source: SkillPathSource = ref;
      const { canonicalPath, skillSrcPath } = computeSkillPathsForLayout(
        pathService.join,
        layout,
        source,
        sanitizedName,
      );
      yield* validatePathSafety(pathService, baseDir, canonicalPath);

      const useExisting = yield* provide(
        canReuseInstalledPackage({
          installedPath: canonicalPath,
          force: reuse.force,
          refVersion: ref.version,
          hasIntegrity: Option.isSome(ref.integrity),
          ...(reuse.lockedVersion === undefined ? {} : { lockedVersion: reuse.lockedVersion }),
          existsFailureDetail: (target) => `Failed to check if canonical path exists: ${target}`,
        }),
      );

      if (useExisting && reuse.lockedTreeIntegrity !== undefined) {
        const observedTree = yield* provide(computeMaterializedTreeIntegrity(canonicalPath));
        if (observedTree === reuse.lockedTreeIntegrity) {
          yield* provide(
            validateAxmSkillCandidate({
              ref,
              packageRoot: canonicalPath,
              skillSourcePath: skillSrcPath,
            }),
          );
          return { skillSrcPath, treeIntegrity: reuse.lockedTreeIntegrity };
        }
      }
      const materialized = yield* provideRegistry(
        materializeRegistryPackageWithTreeIntegrity({
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
            provide(
              validateAxmSkillCandidate({
                ref,
                packageRoot: stagingPath,
                skillSourcePath: pathService.join(stagingPath, "src"),
              }).pipe(Effect.asVoid),
            ),
        }),
      );
      return { skillSrcPath, treeIntegrity: materialized.treeIntegrity };
    }),
  );

const materializeWorkspace = (
  ref: WorkspaceSkillRef,
  pathService: Path.Path,
  baseDir: string,
  provide: ProvideFs,
): Effect.Effect<MaterializedSkillCanonical, AppError> =>
  Effect.gen(function* () {
    yield* validatePathSafety(pathService, baseDir, ref.location).pipe(Effect.mapError(toAppError));
    const skillSourcePath = pathService.join(ref.location, "src");
    yield* provide(
      validateAxmSkillCandidate({
        ref,
        packageRoot: ref.location,
        skillSourcePath,
      }),
    ).pipe(Effect.mapError(toAppError));
    return { skillSrcPath: skillSourcePath };
  });

/** Reuse inputs sourced from the caller's operation context and lockfile. */
export type CanonicalReuseContext = {
  readonly force: boolean;
  readonly lockedVersion: string | undefined;
  readonly lockedTreeIntegrity: TreeIntegrity | undefined;
};

export interface MaterializedSkillCanonical {
  readonly skillSrcPath: string;
  readonly treeIntegrity?: TreeIntegrity;
}

export const materializeSkillCanonical = (args: {
  readonly ref: SkillExtensionRef;
  readonly sanitizedName: string;
  readonly fs: FileSystem.FileSystem;
  readonly pathService: Path.Path;
  readonly baseDir: string;
  readonly layout: WorkspaceLayout;
  readonly sources: SourceHostProvidersService;
  readonly provide: ProvideFs;
  readonly provideRegistry: ProvideRegistryMaterialization;
  readonly reuse?: CanonicalReuseContext;
}): Effect.Effect<MaterializedSkillCanonical, AppError, never> => {
  switch (args.ref.refType) {
    case "git-hosted":
      return materializeGitHosted(
        args.ref,
        args.sanitizedName,
        args.fs,
        args.pathService,
        args.baseDir,
        args.layout,
        args.provide,
        args.reuse ?? { force: false, lockedVersion: undefined, lockedTreeIntegrity: undefined },
      ).pipe(Effect.mapError(toAppError));
    case "local":
      return materializeLocal(
        args.ref,
        args.sanitizedName,
        args.fs,
        args.pathService,
        args.baseDir,
        args.layout,
        args.provide,
        args.reuse ?? { force: false, lockedVersion: undefined, lockedTreeIntegrity: undefined },
      ).pipe(Effect.mapError(toAppError));
    case "registry":
      return materializeRegistry(
        args.ref,
        args.sanitizedName,
        args.fs,
        args.pathService,
        args.baseDir,
        args.layout,
        args.provide,
        args.provideRegistry,
        args.reuse ?? { force: false, lockedVersion: undefined, lockedTreeIntegrity: undefined },
      ).pipe(Effect.mapError(toAppError));
    case "workspace":
      return materializeWorkspace(args.ref, args.pathService, args.baseDir, args.provide);
  }
};

export const ensureSkillAgentArtifact = (args: {
  readonly canonicalSkillSrcPath: string;
  readonly targetDir: string;
  readonly sanitizedName: string;
  readonly pathService: Path.Path;
  readonly baseDir: string;
  readonly provide: ProvideFs;
}) =>
  Effect.gen(function* () {
    const agentSkillPath = args.pathService.join(args.targetDir, args.sanitizedName);
    if (!isPathSafe(args.pathService, args.baseDir, agentSkillPath)) {
      return;
    }

    yield* args.provide(
      createSymlink({
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
      ),
    );
  });

export const removeSkillAgentArtifact = (args: {
  readonly fs: FileSystem.FileSystem;
  readonly pathService: Path.Path;
  readonly targetDir: string;
  readonly sanitizedName: string;
}) => {
  const target = args.pathService.join(args.targetDir, args.sanitizedName);
  return protectWorkspacePath(target).pipe(
    Effect.andThen(args.fs.remove(target, { recursive: true, force: true })),
    Effect.mapError(
      (cause) =>
        new SkillMaterializationFailed({
          detail: `Failed to remove skill artifact at ${target}`,
          cause,
        }),
    ),
  );
};
