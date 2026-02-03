/**
 * Settings management for .axm/settings.json.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { FileSystem } from "@effect/platform";
import { Data, Effect, Schema } from "effect";
import { type Settings, SettingsSchema } from "../schemas/settings.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const SETTINGS_FILENAME = "settings.json";

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
 * Error reading or writing settings file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SettingsErrorTag = "NotFound" | "ParseError" | "WriteError";

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
  readonly cause?: unknown;
}> {}

/**
 * Failed to write settings file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class SettingsWriteError extends Data.TaggedError("SettingsWriteError")<{
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
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
// Core Functions
// -----------------------------------------------------------------------------

/**
 * Build the full path to settings.json.
 *
 * @experimental This API is unstable and may change without notice.
 */
const getSettingsPath = (axmDir: string): string => `${axmDir}/${SETTINGS_FILENAME}`;

/**
 * Read and parse settings from .axm/settings.json.
 *
 * @param axmDir - Path to the .axm directory
 * @returns Parsed Settings object
 *
 * @experimental This API is unstable and may change without notice.
 */
export const readSettings = (
  axmDir: string,
): Effect.Effect<Settings, SettingsError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const settingsPath = getSettingsPath(axmDir);

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
export const writeSettings = (
  axmDir: string,
  settings: Settings,
): Effect.Effect<void, SettingsError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const settingsPath = getSettingsPath(axmDir);

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

    // Serialize to JSON with pretty printing
    const content = JSON.stringify(settings, null, 2);

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

/**
 * Update settings by reading, merging, and writing back.
 *
 * @param axmDir - Path to the .axm directory
 * @param update - Partial settings to merge
 * @returns Updated settings object
 *
 * @experimental This API is unstable and may change without notice.
 */
export const updateSettings = (
  axmDir: string,
  update: Partial<Settings>,
): Effect.Effect<Settings, SettingsError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const current = yield* readSettings(axmDir);

    const updated: Settings = {
      ...current,
      ...update,
      // Merge skills if update provides skills (handle undefined current.skills)
      skills:
        update.skills !== undefined
          ? { ...(current.skills ?? {}), ...update.skills }
          : current.skills,
    };

    yield* writeSettings(axmDir, updated);
    return updated;
  });

/**
 * Add or update a skill in settings.
 *
 * Preserves existing skills while adding/updating the specified one.
 *
 * @param axmDir - Path to the .axm directory
 * @param skillName - Name of the skill to add/update
 * @param versionSpecifier - Version specifier (e.g., "^1.0.0" or "*" for unversioned)
 * @returns Updated settings object
 *
 * @experimental This API is unstable and may change without notice.
 */
export const addSkill = (
  axmDir: string,
  skillName: string,
  versionSpecifier: string,
): Effect.Effect<Settings, SettingsError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const current = yield* readSettings(axmDir);

    const updated: Settings = {
      ...current,
      skills: {
        ...(current.skills ?? {}),
        [skillName]: versionSpecifier,
      },
    };

    yield* writeSettings(axmDir, updated);
    return updated;
  });

/**
 * Options for ensureInitialized.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface EnsureInitializedOptions {
  /** Path to the .axm directory */
  readonly axmDir: string;
  /** Whether this is a global initialization (unused currently, reserved for future) */
  readonly global?: boolean;
  /** Skip confirmation prompts (unused currently, reserved for future) */
  readonly yes?: boolean;
}

/**
 * Ensure settings file exists, creating default if needed.
 *
 * Fast path: if settings exist, read and return them.
 * Slow path: if not found, create default settings and return them.
 *
 * This enables implicit initialization - commands can call this to ensure
 * the settings infrastructure exists without requiring explicit `init`.
 *
 * @param options - Initialization options
 * @returns Existing or newly created settings
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ensureInitialized = (
  options: EnsureInitializedOptions,
): Effect.Effect<Settings, SettingsError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const { axmDir } = options;

    // Try to read existing settings (fast path)
    const existingResult = yield* readSettings(axmDir).pipe(Effect.either);

    if (existingResult._tag === "Right") {
      return existingResult.right;
    }

    // Check if it's a NotFound error (expected for uninitialized)
    const error = existingResult.left;
    if (error._tag !== "SettingsNotFoundError") {
      // Re-throw parse errors or other unexpected errors
      return yield* error;
    }

    // Create default settings (slow path)
    const defaultSettings = createDefaultSettings();
    yield* writeSettings(axmDir, defaultSettings);
    return defaultSettings;
  });

/**
 * Get the effective scope from settings, falling back to DEFAULT_SCOPE.
 *
 * @param settings - Settings object
 * @returns The scope to use for skill resolution
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getEffectiveScope = (settings: Settings): string => settings.scope ?? DEFAULT_SCOPE;
