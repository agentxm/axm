/**
 * Lockfile module for managing `.axm/axm-lock.yaml` (YAML format).
 *
 * Provides functions to read, write, and update lockfile entries
 * for tracking installed skill versions.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import YAML from "yaml";

import {
  type Lockfile,
  LockfileSchema,
  type SkillLockEntry,
} from "../../workspace/lockfile-schema.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const LOCKFILE_NAME = "axm-lock.yaml";
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
  readonly retryable: boolean;
}> {}

/**
 * Error writing the lockfile to disk.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class LockfileWriteError extends Data.TaggedError("LockfileWriteError")<{
  readonly message: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
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
  lockfileVersion: LOCKFILE_VERSION,
  skills: {},
});

/**
 * Validates parsed YAML data against the lockfile schema.
 * Returns a typed LockfileParseError on validation failure.
 */
const decodeLockfile = (data: unknown): Effect.Effect<Lockfile, LockfileParseError> =>
  Schema.decodeUnknown(LockfileSchema)(data).pipe(
    Effect.mapError(
      (e) =>
        new LockfileParseError({
          message: "Invalid lockfile format",
          cause: e,
          retryable: false,
        }),
    ),
  );

// -----------------------------------------------------------------------------
// Public Functions
// -----------------------------------------------------------------------------

/**
 * Reads and parses the lockfile from `.axm/axm-lock.yaml`.
 *
 * Returns an empty lockfile if the file does not exist.
 * Returns a LockfileParseError if the file exists but is invalid.
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
            retryable: false,
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
            retryable: false,
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
          retryable: false,
        }),
    });

    return yield* decodeLockfile(parsed);
  });

/**
 * Writes the lockfile to `.axm/axm-lock.yaml` in YAML format.
 *
 * Creates the `.axm` directory if it does not exist.
 * Encodes Date fields to ISO strings for YAML serialization.
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
            retryable: false,
          }),
      ),
    );

    // Encode Dates to ISO strings for YAML serialization
    const encoded = yield* Effect.try({
      try: () => Schema.encodeSync(LockfileSchema)(lockfile),
      catch: (error) =>
        new LockfileWriteError({
          message: "Failed to encode lockfile",
          cause: error,
          retryable: false,
        }),
    });

    // Convert to YAML
    const yamlContent = yield* Effect.try({
      try: () => YAML.stringify(encoded),
      catch: (error) =>
        new LockfileWriteError({
          message: "Failed to serialize lockfile to YAML",
          cause: error,
          retryable: false,
        }),
    });

    // Write file
    yield* fs.writeFileString(lockfilePath, yamlContent).pipe(
      Effect.mapError(
        (error) =>
          new LockfileWriteError({
            message: `Failed to write lockfile at ${lockfilePath}`,
            cause: error,
            retryable: false,
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
  entry: SkillLockEntry,
): Effect.Effect<Lockfile, LockfileError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const existing = yield* readLockfile(axmDir);

    const updatedLockfile: Lockfile = {
      ...existing,
      skills: {
        ...existing.skills,
        [skillName]: {
          ...entry,
          updatedAt: new Date(),
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
    const { [skillName]: _removed, ...remainingSkills } = existing.skills;
    void _removed; // Avoid unused variable lint error

    const updatedLockfile: Lockfile = {
      ...existing,
      skills: remainingSkills,
    };

    yield* writeLockfile(axmDir, updatedLockfile);

    return updatedLockfile;
  });
