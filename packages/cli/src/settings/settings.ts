/**
 * Settings management for .axm/settings.json.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import * as Schema from "effect/Schema";
import { SETTINGS_KEY_ORDER, type Settings, SettingsSchema } from "./schema.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Filename for the settings file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SETTINGS_FILENAME = "settings.json";

/**
 * Default scope for skill resolution when not specified in settings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DEFAULT_SCOPE = "@community";

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

/**
 * Settings file not found.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class SettingsNotFoundError extends Data.TaggedError("SettingsNotFoundError")<{
  readonly path: string;
  readonly message: string;
}> {}

/**
 * Failed to parse settings JSON.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class SettingsParseError extends Data.TaggedError("SettingsParseError")<{
  readonly path: string;
  readonly message: string;
  readonly cause: unknown;
}> {}

/**
 * Failed to write settings file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class SettingsWriteError extends Data.TaggedError("SettingsWriteError")<{
  readonly path: string;
  readonly message: string;
  readonly cause: unknown;
}> {}

/**
 * Union of all settings errors.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SettingsError = SettingsNotFoundError | SettingsParseError | SettingsWriteError;

// -----------------------------------------------------------------------------
// Default Settings
// -----------------------------------------------------------------------------

/**
 * Create default settings object.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createDefaultSettings = (): Settings => ({});

// -----------------------------------------------------------------------------
// Key Ordering
// -----------------------------------------------------------------------------

/**
 * Reorder settings keys to match the canonical schema order.
 *
 * Creates a new object with keys in `SETTINGS_KEY_ORDER`, omitting keys
 * not present in the input.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const orderSettingsKeys = (settings: Settings): Settings => {
  const ordered: Record<string, unknown> = {};
  for (const key of SETTINGS_KEY_ORDER) {
    if (key in settings) {
      ordered[key] = (settings as Record<string, unknown>)[key];
    }
  }
  return ordered as Settings;
};

// -----------------------------------------------------------------------------
// Core Functions
// -----------------------------------------------------------------------------

/**
 * Read and parse settings from .axm/settings.json.
 *
 * @param axmDir - Path to the .axm directory
 * @returns Parsed Settings object
 *
 * @experimental This API is unstable and may change without notice.
 */
export const readSettings = (axmDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsPath = path.join(axmDir, SETTINGS_FILENAME);

    // Check if file exists
    const exists = yield* fs.exists(settingsPath).pipe(
      Effect.mapError(
        (error) =>
          new SettingsParseError({
            path: settingsPath,
            message: `Failed to check if settings file exists: ${settingsPath}`,
            cause: error,
          }),
      ),
    );
    if (!exists) {
      return yield* new SettingsNotFoundError({
        path: settingsPath,
        message: `Settings file not found: ${settingsPath}`,
      });
    }

    // Read file contents
    const content = yield* fs.readFileString(settingsPath).pipe(
      Effect.mapError(
        (error) =>
          new SettingsParseError({
            path: settingsPath,
            message: `Failed to read settings file: ${settingsPath}`,
            cause: error,
          }),
      ),
    );

    // Parse JSON
    const json = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (error) =>
        new SettingsParseError({
          path: settingsPath,
          message: `Failed to parse settings JSON: ${String(error)}`,
          cause: error,
        }),
    });

    // Validate schema
    const parsed = yield* Schema.decodeUnknown(SettingsSchema)(json).pipe(
      Effect.mapError(
        (error) =>
          new SettingsParseError({
            path: settingsPath,
            message: `Invalid settings format: ${error.message}`,
            cause: error,
          }),
      ),
    );

    return parsed;
  });

/**
 * Write settings to .axm/settings.json.
 *
 * Creates the directory if it doesn't exist. Pretty-prints JSON with 2-space indent.
 *
 * @param axmDir - Path to the .axm directory
 * @param settings - Settings object to write
 *
 * @experimental This API is unstable and may change without notice.
 */
export const writeSettings = (axmDir: string, settings: Settings) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsPath = path.join(axmDir, SETTINGS_FILENAME);

    // Ensure directory exists
    yield* fs.makeDirectory(axmDir, { recursive: true }).pipe(
      Effect.mapError(
        (error) =>
          new SettingsWriteError({
            path: settingsPath,
            message: `Failed to create directory: ${axmDir}`,
            cause: error,
          }),
      ),
    );

    // Serialize to JSON with pretty printing and trailing newline
    const content = JSON.stringify(orderSettingsKeys(settings), null, 2) + "\n";

    // Write file
    yield* fs.writeFileString(settingsPath, content).pipe(
      Effect.mapError(
        (error) =>
          new SettingsWriteError({
            path: settingsPath,
            message: `Failed to write settings file: ${settingsPath}`,
            cause: error,
          }),
      ),
    );
  });
