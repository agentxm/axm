/**
 * Skill discovery module for finding SKILL.md files in directories.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import { FileSystem } from "@effect/platform";
import { Data, Effect } from "effect";
import type { Skill } from "./types.js";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Error during skill discovery.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class DiscoveryError extends Data.TaggedError("DiscoveryError")<{
  readonly message: string;
  readonly path?: string;
  readonly cause?: unknown;
}> {}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Pattern to match SKILL.md files (case-insensitive).
 */
const SKILL_FILE_PATTERN = /^skill\.md$/i;

// -----------------------------------------------------------------------------
// Internal Functions
// -----------------------------------------------------------------------------

/**
 * Recursively walk a directory tree and collect all file paths.
 */
const walkDirectory = (
  dir: string,
): Effect.Effect<string[], DiscoveryError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const entries = yield* fs.readDirectory(dir).pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          new DiscoveryError({
            message: `Failed to read directory: ${dir}`,
            path: dir,
            cause: error,
          }),
        ),
      ),
    );

    const results: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);

      const stat = yield* fs.stat(fullPath).pipe(
        Effect.catchAll((_error) =>
          // Skip files we can't stat (permission errors, etc.)
          Effect.succeed(null).pipe(
            Effect.tap(() => Effect.logDebug(`Skipping inaccessible path: ${fullPath}`)),
          ),
        ),
      );

      if (stat === null) {
        continue;
      }

      if (stat.type === "Directory") {
        const subResults = yield* walkDirectory(fullPath);
        results.push(...subResults);
      } else if (stat.type === "File") {
        results.push(fullPath);
      }
    }

    return results;
  });

/**
 * Check if a filename matches the SKILL.md pattern (case-insensitive).
 */
const isSkillFile = (filePath: string): boolean => {
  const basename = path.basename(filePath);
  return SKILL_FILE_PATTERN.test(basename);
};

/**
 * Extract the skill name from the SKILL.md file path.
 * The skill name is derived from the parent directory name.
 */
const extractSkillName = (skillPath: string): string => {
  const dirName = path.basename(path.dirname(skillPath));
  return dirName;
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Discover all skills in a directory by finding SKILL.md files.
 *
 * This function recursively walks the directory tree and finds all files
 * named SKILL.md (case-insensitive: skill.md, Skill.md, SKILL.MD, etc.).
 *
 * @param directory - The root directory to search for skills
 * @returns An array of discovered Skill objects
 *
 * @example
 * ```typescript
 * import { discoverSkills } from "@agentxm/core/experimental/skills";
 * import { NodeFileSystem } from "@effect/platform-node";
 * import { Effect } from "effect";
 *
 * const program = discoverSkills("/path/to/skills").pipe(
 *   Effect.provide(NodeFileSystem.layer),
 * );
 *
 * const skills = await Effect.runPromise(program);
 * // [{ name: "commit", path: "/path/to/skills/commit/SKILL.md" }, ...]
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const discoverSkills = (
  directory: string,
): Effect.Effect<Skill[], DiscoveryError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Verify the directory exists and is a directory
    const stat = yield* fs.stat(directory).pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          new DiscoveryError({
            message: `Directory does not exist or is not accessible: ${directory}`,
            path: directory,
            cause: error,
          }),
        ),
      ),
    );

    if (stat.type !== "Directory") {
      return yield* Effect.fail(
        new DiscoveryError({
          message: `Path is not a directory: ${directory}`,
          path: directory,
        }),
      );
    }

    // Walk the directory tree to find all files
    const allFiles = yield* walkDirectory(directory);

    // Filter for SKILL.md files
    const skillFiles = allFiles.filter(isSkillFile);

    // Convert to Skill objects
    const skills: Skill[] = skillFiles.map((skillPath) => ({
      name: extractSkillName(skillPath),
      path: skillPath,
    }));

    return skills;
  });
