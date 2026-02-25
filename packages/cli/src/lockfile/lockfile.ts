/**
 * Lockfile module for managing `.axm/axm-lock.yaml` (YAML format).
 *
 * Provides functions to read, write, and update lockfile entries
 * for tracking installed skill versions.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import YAML from "yaml";

import { type CliError, makeCliError } from "../cli-error/index.js";
import { type Lockfile, LockfileSchema } from "./schema.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Filename for the lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LOCKFILE_NAME = "axm-lock.yaml";

const LOCKFILE_VERSION = 1;
const EXACT_VERSION_ERROR_PREFIX = "Expected exact semver version, got:";

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
 * Returns a CliError on validation failure.
 */
const decodeLockfile = (data: unknown): Effect.Effect<Lockfile, CliError> =>
  Schema.decodeUnknown(LockfileSchema)(data).pipe(
    Effect.mapError((cause) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      const isResolvedVersionViolation = message.includes(EXACT_VERSION_ERROR_PREFIX);

      if (isResolvedVersionViolation) {
        return makeCliError({
          code: "LOCKFILE_RESOLVED_VERSION_INVALID",
          what: "Lockfile resolved versions must be exact semver values",
          details: [message],
          howToFix:
            "Replace range values in lockfile resolved fields with exact versions (for example, 1.2.3 instead of ^1.2.3).",
          cause,
        });
      }

      return makeCliError({
        code: "LOCKFILE_PARSE_FAILED",
        what: "Invalid lockfile format",
        cause,
      });
    }),
  );

// -----------------------------------------------------------------------------
// Public Functions
// -----------------------------------------------------------------------------

/**
 * Reads and parses the lockfile from `.axm/axm-lock.yaml`.
 *
 * Returns an empty lockfile if the file does not exist.
 * Returns a CliError if the file exists but is invalid.
 *
 * @param axmDir - Path to the `.axm` directory
 * @returns Effect yielding the parsed Lockfile
 *
 * @experimental This API is unstable and may change without notice.
 */
export const readLockfile = (axmDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lockfilePath = path.join(axmDir, LOCKFILE_NAME);

    // Check if file exists
    const exists = yield* fs.exists(lockfilePath).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "LOCKFILE_PARSE_FAILED",
          what: `Failed to check if lockfile exists at ${lockfilePath}`,
          cause: error,
        }),
      ),
    );
    if (!exists) {
      return createEmptyLockfile();
    }

    // Read and parse the file
    const content = yield* fs.readFileString(lockfilePath).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "LOCKFILE_PARSE_FAILED",
          what: `Failed to read lockfile at ${lockfilePath}`,
          cause: error,
        }),
      ),
    );

    // Parse YAML
    const parsed = yield* Effect.try({
      try: () => YAML.parse(content),
      catch: (error) =>
        makeCliError({
          code: "LOCKFILE_PARSE_FAILED",
          what: `Failed to parse lockfile YAML at ${lockfilePath}`,
          cause: error,
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
export const writeLockfile = (axmDir: string, lockfile: Lockfile) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lockfilePath = path.join(axmDir, LOCKFILE_NAME);
    const tempPath = path.join(
      axmDir,
      `${LOCKFILE_NAME}.tmp.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`,
    );

    // Ensure directory exists
    yield* fs.makeDirectory(axmDir, { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "LOCKFILE_WRITE_FAILED",
          what: `Failed to create directory ${axmDir}`,
          cause: error,
        }),
      ),
    );

    // Encode Dates to ISO strings for YAML serialization
    const encoded = yield* Effect.try({
      try: () => Schema.encodeSync(LockfileSchema)(lockfile),
      catch: (error) =>
        makeCliError({
          code: "LOCKFILE_WRITE_FAILED",
          what: "Failed to encode lockfile",
          cause: error,
        }),
    });

    // Convert to YAML
    const yamlContent = yield* Effect.try({
      try: () => YAML.stringify(encoded),
      catch: (error) =>
        makeCliError({
          code: "LOCKFILE_WRITE_FAILED",
          what: "Failed to serialize lockfile to YAML",
          cause: error,
        }),
    });

    // Write temp file first
    yield* fs.writeFileString(tempPath, yamlContent).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "LOCKFILE_WRITE_FAILED",
          what: `Failed to write lockfile temp file at ${tempPath}`,
          cause: error,
        }),
      ),
    );

    // Atomic replace
    yield* fs.rename(tempPath, lockfilePath).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "LOCKFILE_WRITE_FAILED",
          what: `Failed to atomically replace lockfile at ${lockfilePath}`,
          cause: error,
        }),
      ),
    );
  });
