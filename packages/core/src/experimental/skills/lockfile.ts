/**
 * Lockfile module for managing `.axm/axm.lock` (YAML format).
 *
 * Provides functions to read, write, and update lockfile entries
 * for tracking installed skill versions.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import { FileSystem } from "@effect/platform";
import { Data, Effect } from "effect";
import * as YAML from "yaml";

import type { LockEntry, Lockfile } from "./types.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const LOCKFILE_NAME = "axm.lock";
const LOCKFILE_VERSION = 1;

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Error parsing the lockfile YAML content.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class LockfileParseError extends Data.TaggedError("LockfileParseError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Error writing the lockfile to disk.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class LockfileWriteError extends Data.TaggedError("LockfileWriteError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * Union of all lockfile-related errors.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LockfileError = LockfileParseError | LockfileWriteError;

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

/**
 * Creates an empty lockfile with default values.
 */
const createEmptyLockfile = (): Lockfile => ({
  version: LOCKFILE_VERSION,
  skills: {},
});

/**
 * Validates and normalizes a parsed lockfile object.
 */
const validateLockfile = (data: unknown): Lockfile => {
  if (typeof data !== "object" || data === null) {
    return createEmptyLockfile();
  }

  const obj = data as Record<string, unknown>;
  const version = obj["version"];
  const skills = obj["skills"];

  return {
    version: typeof version === "number" ? version : LOCKFILE_VERSION,
    skills:
      typeof skills === "object" && skills !== null ? (skills as Record<string, LockEntry>) : {},
  };
};

// -----------------------------------------------------------------------------
// Public Functions
// -----------------------------------------------------------------------------

/**
 * Reads and parses the lockfile from `.axm/axm.lock`.
 *
 * Returns an empty lockfile if the file does not exist.
 *
 * @param axmDir - Path to the `.axm` directory
 * @returns Effect yielding the parsed Lockfile
 *
 * @experimental This API is unstable and may change without notice.
 */
export const readLockfile = (
  axmDir: string,
): Effect.Effect<Lockfile, LockfileError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const lockfilePath = path.join(axmDir, LOCKFILE_NAME);

    // Check if file exists
    const exists = yield* fs.exists(lockfilePath).pipe(
      Effect.mapError(
        (error) =>
          new LockfileParseError({
            message: `Failed to check if lockfile exists at ${lockfilePath}`,
            cause: error,
          }),
      ),
    );
    if (!exists) {
      return createEmptyLockfile();
    }

    // Read and parse the file
    const content = yield* fs.readFileString(lockfilePath).pipe(
      Effect.mapError(
        (error) =>
          new LockfileParseError({
            message: `Failed to read lockfile at ${lockfilePath}`,
            cause: error,
          }),
      ),
    );

    // Parse YAML
    const parsed = yield* Effect.try({
      try: () => YAML.parse(content),
      catch: (error) =>
        new LockfileParseError({
          message: `Failed to parse lockfile YAML at ${lockfilePath}`,
          cause: error,
        }),
    });

    return validateLockfile(parsed);
  });

/**
 * Writes the lockfile to `.axm/axm.lock` in YAML format.
 *
 * Creates the `.axm` directory if it does not exist.
 *
 * @param axmDir - Path to the `.axm` directory
 * @param lockfile - The lockfile object to write
 * @returns Effect yielding void on success
 *
 * @experimental This API is unstable and may change without notice.
 */
export const writeLockfile = (
  axmDir: string,
  lockfile: Lockfile,
): Effect.Effect<void, LockfileError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const lockfilePath = path.join(axmDir, LOCKFILE_NAME);

    // Ensure directory exists
    yield* fs.makeDirectory(axmDir, { recursive: true }).pipe(
      Effect.mapError(
        (error) =>
          new LockfileWriteError({
            message: `Failed to create directory ${axmDir}`,
            cause: error,
          }),
      ),
    );

    // Convert to YAML
    const yamlContent = yield* Effect.try({
      try: () =>
        YAML.stringify(lockfile, {
          indent: 2,
          lineWidth: 0, // Disable line wrapping
        }),
      catch: (error) =>
        new LockfileWriteError({
          message: "Failed to serialize lockfile to YAML",
          cause: error,
        }),
    });

    // Write file
    yield* fs.writeFileString(lockfilePath, yamlContent).pipe(
      Effect.mapError(
        (error) =>
          new LockfileWriteError({
            message: `Failed to write lockfile at ${lockfilePath}`,
            cause: error,
          }),
      ),
    );
  });

/**
 * Updates or adds a skill entry in the lockfile.
 *
 * Reads the existing lockfile, updates the entry for the specified skill,
 * sets the `updatedAt` timestamp, and writes the lockfile back.
 *
 * @param axmDir - Path to the `.axm` directory
 * @param skillName - Name of the skill to update
 * @param entry - The lock entry data for the skill
 * @returns Effect yielding the updated Lockfile
 *
 * @experimental This API is unstable and may change without notice.
 */
export const updateLockEntry = (
  axmDir: string,
  skillName: string,
  entry: LockEntry,
): Effect.Effect<Lockfile, LockfileError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const existing = yield* readLockfile(axmDir);

    const updatedLockfile: Lockfile = {
      ...existing,
      skills: {
        ...existing.skills,
        [skillName]: {
          ...entry,
          updatedAt: new Date().toISOString(),
        },
      },
    };

    yield* writeLockfile(axmDir, updatedLockfile);

    return updatedLockfile;
  });

/**
 * Removes a skill entry from the lockfile.
 *
 * Preserves all other entries. If the skill is not found,
 * returns the lockfile unchanged.
 *
 * @param axmDir - Path to the `.axm` directory
 * @param skillName - Name of the skill to remove
 * @returns Effect yielding the updated Lockfile
 *
 * @experimental This API is unstable and may change without notice.
 */
export const removeLockEntry = (
  axmDir: string,
  skillName: string,
): Effect.Effect<Lockfile, LockfileError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const existing = yield* readLockfile(axmDir);

    // Create new skills object without the specified skill
    const { [skillName]: _, ...remainingSkills } = existing.skills;

    const updatedLockfile: Lockfile = {
      ...existing,
      skills: remainingSkills,
    };

    yield* writeLockfile(axmDir, updatedLockfile);

    return updatedLockfile;
  });
