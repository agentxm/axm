/**
 * Settings management for .axm/settings.json.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import { type Settings, SettingsSchema } from "./schema.js";

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
// Update Types
// -----------------------------------------------------------------------------

/**
 * Skills update map that supports null values for removal.
 *
 * - string values add or update the skill
 * - null values remove the skill
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillsUpdate = Readonly<Record.ReadonlyRecord<string, string | null>>;

/**
 * Settings update that supports null values for skill removal.
 *
 * Uses JSON merge-patch semantics: null values indicate removal.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SettingsUpdate extends Omit<Partial<Settings>, "skills"> {
  readonly skills?: SkillsUpdate;
}

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
 * Supports JSON merge-patch semantics for skills:
 * - string values add or update the skill
 * - null values remove the skill from settings
 *
 * @param axmDir - Path to the .axm directory
 * @param update - Settings update to merge (skills can have null values for removal)
 * @returns Updated settings object
 *
 * @example
 * ```typescript
 * // Add a skill
 * updateSettings(axmDir, { skills: { "my-skill": "^1.0.0" } });
 *
 * // Remove a skill
 * updateSettings(axmDir, { skills: { "my-skill": null } });
 *
 * // Add and remove in one update
 * updateSettings(axmDir, { skills: { "old-skill": null, "new-skill": "^2.0.0" } });
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 */
export const updateSettings = (
  axmDir: string,
  update: SettingsUpdate,
): Effect.Effect<Settings, SettingsError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const current = yield* readSettings(axmDir);

    // Merge skills with null-removal support
    let mergedSkills = current.skills;
    if (update.skills !== undefined) {
      const baseSkills = current.skills ?? {};
      const updateSkills = update.skills;

      // Merge and filter out null values
      const merged = { ...baseSkills, ...updateSkills };
      mergedSkills = Record.filter(merged, (value): value is string => value !== null);
    }

    const updated: Settings = {
      ...current,
      ...update,
      skills: mergedSkills,
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
 * Add an agent to the workspace settings.
 *
 * Reads current settings, appends the agent ID if not already present,
 * writes back, and returns the updated settings. No-op if already present.
 *
 * @param axmDir - Path to the .axm directory
 * @param agentId - Agent identifier to add
 * @returns Updated settings object
 *
 * @experimental This API is unstable and may change without notice.
 */
export const addAgentToWorkspace = (
  axmDir: string,
  agentId: NonNullable<Settings["agents"]>[number],
): Effect.Effect<Settings, SettingsError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const current = yield* readSettings(axmDir);
    const currentAgents = current.agents ?? [];
    if (currentAgents.includes(agentId)) return current;
    const updated: Settings = { ...current, agents: [...currentAgents, agentId] };
    yield* writeSettings(axmDir, updated);
    return updated;
  });

/**
 * Options for ensureInitializedLegacy.
 *
 * @experimental This API is unstable and may change without notice.
 * @deprecated Use WorkspaceContext from workspace/service.ts instead
 */
export interface EnsureInitializedLegacyOptions {
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
 * @deprecated Use WorkspaceContext from workspace/service.ts instead
 */
export const ensureInitializedLegacy = (
  options: EnsureInitializedLegacyOptions,
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
