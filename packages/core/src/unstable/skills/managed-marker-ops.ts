/**
 * Managed marker operations for SKILL.md files.
 *
 * Shared helper used by both materialization and install flows to prepend
 * the managed marker to SKILL.md in materialized skill directories.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { generateMarker, isManagedByAxm } from "../extensions/managed-marker.js";

/**
 * Prepend the managed marker to SKILL.md in the materialized skill directory.
 * No-op if SKILL.md does not exist or already has a marker.
 * Errors are logged at debug level and swallowed — marker is best-effort.
 */
export const prependManagedMarkerToSkillMd = (skillSrcPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const skillMdPath = path.join(skillSrcPath, "SKILL.md");
    const exists = yield* fs.exists(skillMdPath).pipe(
      Effect.tapError((e) => Effect.logDebug(`Failed to check SKILL.md existence: ${e}`)),
      Effect.catch(() => Effect.succeed(false)),
    );
    if (!exists) return;
    const content = yield* fs.readFileString(skillMdPath).pipe(
      Effect.tapError((e) => Effect.logDebug(`Failed to read SKILL.md: ${e}`)),
      Effect.catch(() => Effect.succeed("")),
    );
    if (content === "" || isManagedByAxm(content)) return;
    const marker = generateMarker("skills", "markdown");
    yield* fs.writeFileString(skillMdPath, `${marker}\n${content}`).pipe(
      Effect.tapError((e) => Effect.logDebug(`Failed to write managed marker to SKILL.md: ${e}`)),
      Effect.catch(() => Effect.void),
    );
  });

/**
 * Overload accepting explicit FileSystem and Path services (for callers
 * that have already resolved them, e.g. materialization).
 */
export const prependManagedMarkerToSkillMdWith = (
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  skillSrcPath: string,
) =>
  Effect.gen(function* () {
    const skillMdPath = pathService.join(skillSrcPath, "SKILL.md");
    const exists = yield* fs.exists(skillMdPath).pipe(
      Effect.tapError((e) => Effect.logDebug(`Failed to check SKILL.md existence: ${e}`)),
      Effect.catch(() => Effect.succeed(false)),
    );
    if (!exists) return;
    const content = yield* fs.readFileString(skillMdPath).pipe(
      Effect.tapError((e) => Effect.logDebug(`Failed to read SKILL.md: ${e}`)),
      Effect.catch(() => Effect.succeed("")),
    );
    if (content === "" || isManagedByAxm(content)) return;
    const marker = generateMarker("skills", "markdown");
    yield* fs.writeFileString(skillMdPath, `${marker}\n${content}`).pipe(
      Effect.tapError((e) => Effect.logDebug(`Failed to write managed marker to SKILL.md: ${e}`)),
      Effect.catch(() => Effect.void),
    );
  });
