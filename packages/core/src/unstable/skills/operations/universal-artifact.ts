import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "../../app-error/index.js";
import {
  computeSourceHash,
  RenderedFilePathSchema,
  type SourceHash,
} from "../../extensions/index.js";
import { copyExtensionDirectory, sanitizeName } from "../../extensions/utils.js";
import { UNIVERSAL_SKILLS_DIR } from "../../extensions/universal-skills-dir.js";
import type { SkillLockEntry } from "../../lockfile/index.js";
import { createSymlink, isPathSafe } from "../../utils/index.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import type { InstallResult } from "./install-result.js";

const decodeRenderedFilePath = Schema.decodeUnknownSync(RenderedFilePathSchema);

export type UniversalSkillArtifact = NonNullable<SkillLockEntry["universalArtifact"]>;

export const universalSkillsTargetDir = (workspaceRoot: string, path: Path.Path): string =>
  path.normalize(path.join(workspaceRoot, UNIVERSAL_SKILLS_DIR));

export const universalSkillArtifactPath = (
  workspaceRoot: string,
  path: Path.Path,
  skillName: string,
): string => path.join(universalSkillsTargetDir(workspaceRoot, path), sanitizeName(skillName));

export const computeSkillSourceHash = (canonicalPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs
      .readDirectory(canonicalPath)
      .pipe(Effect.catch(() => Effect.succeed([])));
    const sorted = [...entries].sort();
    const parts = yield* Effect.forEach(sorted, (entry) =>
      fs.readFileString(path.join(canonicalPath, entry)).pipe(
        Effect.map((content) => `${entry}\n${content}`),
        Effect.catch(() => Effect.succeed(entry)),
      ),
    );
    return computeSourceHash(parts.join("\n"));
  });

export const buildUniversalSkillArtifact = (opts: {
  readonly artifactPath: string;
  readonly canonicalSkillSrcPath: string;
}) =>
  Effect.gen(function* () {
    const integrity: SourceHash = yield* computeSkillSourceHash(opts.canonicalSkillSrcPath);
    return {
      path: decodeRenderedFilePath(opts.artifactPath),
      integrity,
    } satisfies UniversalSkillArtifact;
  });

export const materializeUniversalSkillArtifact = (opts: {
  readonly canonicalSkillSrcPath: string;
  readonly skillName: string;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const artifactPath = universalSkillArtifactPath(ws.baseDir, path, opts.skillName);

    if (!isPathSafe(ws.baseDir, artifactPath)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Path traversal detected for universal skill artifact ${artifactPath}`,
      });
    }

    const result = yield* createSymlink({
      target: opts.canonicalSkillSrcPath,
      link: artifactPath,
    }).pipe(
      Effect.map(
        () =>
          ({
            success: true,
            mode: "symlink",
            symlinkFailed: false,
            error: Option.none(),
            path: artifactPath,
            canonicalPath: opts.canonicalSkillSrcPath,
          }) satisfies InstallResult,
      ),
      Effect.catch(() =>
        copyExtensionDirectory(opts.canonicalSkillSrcPath, artifactPath).pipe(
          Effect.map(
            () =>
              ({
                success: true,
                mode: "copy",
                symlinkFailed: true,
                error: Option.none(),
                path: artifactPath,
                canonicalPath: opts.canonicalSkillSrcPath,
              }) satisfies InstallResult,
          ),
          Effect.mapError((copyErr) =>
            makeAppError({
              code: "internal",
              detail: `Copy fallback failed for universal skill artifact: ${copyErr.message}`,
              cause: copyErr,
            }),
          ),
        ),
      ),
    );
    const artifact = yield* buildUniversalSkillArtifact({
      artifactPath: result.path,
      canonicalSkillSrcPath: opts.canonicalSkillSrcPath,
    });
    return { result, artifact };
  });

export const removeUniversalSkillArtifact = (skillName: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const artifactPath = universalSkillArtifactPath(ws.baseDir, path, skillName);
    yield* fs.remove(artifactPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
  });
