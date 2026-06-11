import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "../app-error/index.js";
import { insertManagedFileBanner } from "../extensions/index.js";
import {
  materializeExternalPackage,
  materializeRegistryPackage,
} from "../extensions/materialization.js";
import { copyExtensionDirectory } from "../extensions/utils.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type { SkillExtensionRef } from "./refs.js";
import { computeSkillPaths, type SkillPathSource } from "./paths.js";
import {
  createSymlink,
  isPathSafe,
  makeWorkspaceRelativeSourcePath,
  removeFromAllCanonicalLocations,
} from "../utils/index.js";

export type ProvideFs = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, Exclude<R, FileSystem.FileSystem | Path.Path>>;

const materializeGitHosted = (
  ref: Extract<SkillExtensionRef, { refType: "git-hosted" }>,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  provide: ProvideFs,
) =>
  Effect.gen(function* () {
    const { skillSrcPath } = computeSkillPaths(
      pathService.join,
      baseDir,
      { refType: ref.refType },
      sanitizedName,
    );
    yield* provide(
      materializeExternalPackage({
        baseDir,
        canonicalPath: skillSrcPath,
        sourceLocation: ref.location,
        packageLabel: "skill",
        prepareDestination: removeFromAllCanonicalLocations(
          fs,
          baseDir,
          "skills",
          sanitizedName,
          pathService,
        ),
      }),
    );
    return skillSrcPath;
  });

const materializeLocal = (
  ref: Extract<SkillExtensionRef, { refType: "local" }>,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  provide: ProvideFs,
) =>
  Effect.gen(function* () {
    const { skillSrcPath } = computeSkillPaths(
      pathService.join,
      baseDir,
      { refType: ref.refType },
      sanitizedName,
    );
    yield* provide(
      materializeExternalPackage({
        baseDir,
        canonicalPath: skillSrcPath,
        sourceLocation: ref.location,
        packageLabel: "skill",
        prepareDestination: removeFromAllCanonicalLocations(
          fs,
          baseDir,
          "skills",
          sanitizedName,
          pathService,
        ),
      }),
    );
    return skillSrcPath;
  });

const materializeRegistry = (
  ref: Extract<SkillExtensionRef, { refType: "registry" }>,
  sanitizedName: string,
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  provide: ProvideFs,
) =>
  Effect.gen(function* () {
    const source: SkillPathSource = { refType: "registry", owner: ref.owner };
    const { canonicalPath, skillSrcPath } = computeSkillPaths(
      pathService.join,
      baseDir,
      source,
      sanitizedName,
    );
    yield* provide(
      materializeRegistryPackage({
        baseDir,
        canonicalPath,
        sourceLocation: ref.source.location,
        owner: ref.owner,
        type: "skill",
        name: ref.name,
        version: ref.version,
        integrity: ref.integrity,
        prepareDestination: removeFromAllCanonicalLocations(
          fs,
          baseDir,
          "skills",
          sanitizedName,
          pathService,
        ),
      }),
    );

    return skillSrcPath;
  });

export const materializeSkillCanonical = (args: {
  readonly ref: SkillExtensionRef;
  readonly sanitizedName: string;
  readonly fs: FileSystem.FileSystem;
  readonly pathService: Path.Path;
  readonly baseDir: string;
  readonly sources: SourceHostProvidersService;
  readonly provide: ProvideFs;
}): Effect.Effect<string, AppError, never> => {
  switch (args.ref.refType) {
    case "git-hosted":
      return materializeGitHosted(
        args.ref,
        args.sanitizedName,
        args.fs,
        args.pathService,
        args.baseDir,
        args.provide,
      );
    case "local":
      return materializeLocal(
        args.ref,
        args.sanitizedName,
        args.fs,
        args.pathService,
        args.baseDir,
        args.provide,
      );
    case "registry":
      return materializeRegistry(
        args.ref,
        args.sanitizedName,
        args.fs,
        args.pathService,
        args.baseDir,
        args.provide,
      );
  }
};

export const insertSkillCopyFallbackBanner = (args: {
  readonly canonicalSkillSrcPath: string;
  readonly agentSkillPath: string;
  readonly baseDir: string;
}): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const skillMdPath = path.join(args.agentSkillPath, "SKILL.md");
    const skillMdExists = yield* fs
      .exists(skillMdPath)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!skillMdExists) return;

    const canonicalSkillMdPath = path.join(args.canonicalSkillSrcPath, "SKILL.md");
    const editSourcePath = makeWorkspaceRelativeSourcePath(
      path,
      args.baseDir,
      canonicalSkillMdPath,
    );
    if (Option.isNone(editSourcePath)) return;

    const content = yield* fs.readFileString(skillMdPath);
    const withBanner = insertManagedFileBanner(content, {
      editPath: editSourcePath.value,
      helpTopic: "skills",
      format: "markdown",
    });
    yield* fs.writeFileString(skillMdPath, withBanner);
  }).pipe(Effect.catch(() => Effect.void));

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
    if (!isPathSafe(args.baseDir, agentSkillPath)) {
      return;
    }

    yield* args.provide(
      createSymlink({
        target: args.canonicalSkillSrcPath,
        link: agentSkillPath,
      }).pipe(
        Effect.catch(() =>
          copyExtensionDirectory(args.canonicalSkillSrcPath, agentSkillPath, {
            forAgentArtifact: true,
          }).pipe(
            Effect.flatMap(() =>
              insertSkillCopyFallbackBanner({
                canonicalSkillSrcPath: args.canonicalSkillSrcPath,
                agentSkillPath,
                baseDir: args.baseDir,
              }),
            ),
            Effect.ignore,
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
}) =>
  args.fs
    .remove(args.pathService.join(args.targetDir, args.sanitizedName), { recursive: true })
    .pipe(Effect.catch(() => Effect.void));
