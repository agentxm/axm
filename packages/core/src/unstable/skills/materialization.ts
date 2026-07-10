import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, makeAppError } from "../app-error/index.js";
import { insertManagedFileBanner, validatePathSafety } from "../extensions/index.js";
import { copyExtensionDirectory } from "../extensions/utils.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type { SkillExtensionRef, WorkspaceSkillRef } from "./refs.js";
import { computeSkillPaths, type SkillPathSource } from "./paths.js";
import {
  computeIntegrity,
  createSymlink,
  isPathSafe,
  makeWorkspaceRelativeSourcePath,
  removeFromAllCanonicalLocations,
  stripFileProtocol,
} from "../utils/index.js";
import { createRegistryClient, extractZip } from "../registry/index.js";

export type ProvideFs = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, Exclude<R, FileSystem.FileSystem | Path.Path>>;

const preCleanAndCopy = (
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  sanitizedName: string,
  sourcePath: string,
  copyTarget: string,
  provide: ProvideFs,
) =>
  Effect.gen(function* () {
    yield* removeFromAllCanonicalLocations(fs, baseDir, "skills", sanitizedName, pathService);
    yield* provide(
      copyExtensionDirectory(sourcePath, copyTarget).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to copy skill files to ${copyTarget}`,
            cause: error,
          }),
        ),
      ),
    );
  });

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
    yield* validatePathSafety(baseDir, skillSrcPath);
    const sourcePath = stripFileProtocol(ref.location);
    yield* preCleanAndCopy(
      fs,
      pathService,
      baseDir,
      sanitizedName,
      sourcePath,
      skillSrcPath,
      provide,
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
    yield* validatePathSafety(baseDir, skillSrcPath);
    const sourcePath = stripFileProtocol(ref.location);
    const isSelfCopy = pathService.resolve(sourcePath) === pathService.resolve(skillSrcPath);
    if (!isSelfCopy) {
      yield* preCleanAndCopy(
        fs,
        pathService,
        baseDir,
        sanitizedName,
        sourcePath,
        skillSrcPath,
        provide,
      );
    }
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
    yield* validatePathSafety(baseDir, canonicalPath);

    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to check if canonical path exists: ${canonicalPath}`,
          cause: error,
        }),
      ),
    );
    const useExisting = Option.isNone(ref.integrity) && canonicalExists;

    if (!useExisting) {
      const locationStr =
        ref.source.location.protocol === "file:"
          ? ref.source.location.pathname
          : ref.source.location.href;
      const client = yield* provide(createRegistryClient(locationStr));
      const { archive } = yield* client.getExtensionPackage({
        owner: ref.owner,
        type: "skill",
        name: ref.name,
        version: Option.some(ref.version),
      });

      if (Option.isSome(ref.integrity)) {
        const actualIntegrity = yield* computeIntegrity(archive);
        if (actualIntegrity !== ref.integrity.value) {
          return yield* makeAppError({
            code: "internal",
            detail: `Integrity mismatch for ${ref.name}@${ref.version}`,
          });
        }
      }

      const tmpDir = yield* fs.makeTempDirectory().pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "validation",
            detail: `Temporary directory for registry install could not be created`,
            cause: error,
          }),
        ),
      );
      yield* Effect.ensuring(
        Effect.gen(function* () {
          yield* provide(extractZip(archive, tmpDir));
          yield* preCleanAndCopy(
            fs,
            pathService,
            baseDir,
            sanitizedName,
            tmpDir,
            canonicalPath,
            provide,
          );
        }),
        fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
      );
    }

    return skillSrcPath;
  });

const materializeWorkspace = (
  ref: WorkspaceSkillRef,
  pathService: Path.Path,
  baseDir: string,
): Effect.Effect<string, AppError> =>
  Effect.gen(function* () {
    yield* validatePathSafety(baseDir, ref.location);
    return pathService.join(ref.location, "src");
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
    case "workspace":
      return materializeWorkspace(args.ref, args.pathService, args.baseDir);
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
