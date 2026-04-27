/**
 * Lockfile module for managing `.axm/axm-lock.yaml` (YAML format).
 *
 * Provides functions to read, write, and update lockfile entries
 * for tracking installed skill versions.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import YAML from "yaml";

import { makeAppError } from "../app-error/index.js";
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

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Public Functions
// -----------------------------------------------------------------------------

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
        makeAppError({
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
        makeAppError({
          code: "LOCKFILE_WRITE_FAILED",
          what: "Failed to encode lockfile",
          cause: error,
        }),
    });

    // Convert to YAML
    const yamlContent = yield* Effect.try({
      try: () => YAML.stringify(encoded),
      catch: (error) =>
        makeAppError({
          code: "LOCKFILE_WRITE_FAILED",
          what: "Failed to serialize lockfile to YAML",
          cause: error,
        }),
    });

    // Write temp file first
    yield* fs.writeFileString(tempPath, yamlContent).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "LOCKFILE_WRITE_FAILED",
          what: `Failed to write lockfile temp file at ${tempPath}`,
          cause: error,
        }),
      ),
    );

    // Atomic replace
    yield* fs.rename(tempPath, lockfilePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "LOCKFILE_WRITE_FAILED",
          what: `Failed to atomically replace lockfile at ${lockfilePath}`,
          cause: error,
        }),
      ),
    );
  });
