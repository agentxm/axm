import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, makeAppError } from "../app-error/index.js";
import { validatePathSafety } from "../extensions/index.js";
import { copyExtensionDirectory } from "../extensions/utils.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type { SkillExtensionRef } from "./refs.js";
import { computeSkillPaths, type SkillPathSource } from "./paths.js";
import {
  computeIntegrity,
  createSymlink,
  isPathSafe,
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
    yield* removeFromAllCanonicalLocations(fs, baseDir, sanitizedName, pathService);
    yield* provide(
      copyExtensionDirectory(sourcePath, copyTarget).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "INSTALL_SKILL_COPY_FAILED",
            what: `Failed to copy skill files to ${copyTarget}`,
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
    yield* validatePathSafety(baseDir, skillSrcPath, "INSTALL_SKILL_PATH_TRAVERSAL");
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
    yield* validatePathSafety(baseDir, skillSrcPath, "INSTALL_SKILL_PATH_TRAVERSAL");
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
    yield* validatePathSafety(baseDir, canonicalPath, "INSTALL_SKILL_PATH_TRAVERSAL");

    const canonicalExists = yield* fs.exists(canonicalPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "INSTALL_SKILL_PATH_CHECK_FAILED",
          what: `Failed to check if canonical path exists: ${canonicalPath}`,
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
            code: "INSTALL_SKILL_INTEGRITY_MISMATCH",
            what: `Integrity mismatch for ${ref.name}@${ref.version}`,
            details: [`Expected ${ref.integrity.value}, got ${actualIntegrity}`],
          });
        }
      }

      const tmpDir = yield* fs.makeTempDirectory().pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "INSTALL_SKILL_TEMP_DIR_FAILED",
            what: `Failed to create temporary directory for registry install`,
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
          copyExtensionDirectory(args.canonicalSkillSrcPath, agentSkillPath).pipe(Effect.ignore),
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
