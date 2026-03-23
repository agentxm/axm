/**
 * Settings management for .axm/settings.json.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as Schema from "effect/Schema";
import { makeCliError } from "../cli-error/index.js";
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
 * Default namespace for skill resolution when not specified in settings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DEFAULT_NAMESPACE = "@community";

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
  // Assertions needed: Settings has fixed keys, not a string index signature.
  // Dynamic key access requires Record cast; result has same keys so Settings cast is safe.
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
      Effect.mapError((error) =>
        makeCliError({
          code: "SETTINGS_PARSE_FAILED",
          what: `Failed to check if settings file exists: ${settingsPath}`,
          cause: error,
        }),
      ),
    );
    if (!exists) {
      return Option.none<Settings>();
    }

    // Read file contents
    const content = yield* fs.readFileString(settingsPath).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "SETTINGS_PARSE_FAILED",
          what: `Failed to read settings file: ${settingsPath}`,
          cause: error,
        }),
      ),
    );

    // Parse JSON
    const json = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (error) =>
        makeCliError({
          code: "SETTINGS_PARSE_FAILED",
          what: `Failed to parse settings JSON: ${String(error)}`,
          cause: error,
        }),
    });

    // Validate schema
    const parsed = yield* Schema.decodeUnknownEffect(SettingsSchema)(json).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "SETTINGS_PARSE_FAILED",
          what: `Invalid settings format: ${error.message}`,
          cause: error,
        }),
      ),
    );

    return Option.some(parsed);
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
      Effect.mapError((error) =>
        makeCliError({
          code: "SETTINGS_WRITE_FAILED",
          what: `Failed to create directory: ${axmDir}`,
          cause: error,
        }),
      ),
    );

    // Encode through schema (converts Option -> nullable, URL -> string, etc.)
    const encoded = yield* Schema.encodeEffect(SettingsSchema)(settings).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "SETTINGS_WRITE_FAILED",
          what: `Failed to encode settings: ${error.message}`,
          cause: error,
        }),
      ),
    );

    // Serialize to JSON with pretty printing and trailing newline.
    // Assertion needed: Schema.encode produces Encoded type with same top-level keys as Settings
    // but different value types (e.g., string instead of URL). orderSettingsKeys only reads keys,
    // so the cast is safe for key ordering.
    const content =
      JSON.stringify(orderSettingsKeys(encoded as unknown as Settings), null, 2) + "\n";

    // Write file
    yield* fs.writeFileString(settingsPath, content).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "SETTINGS_WRITE_FAILED",
          what: `Failed to write settings file: ${settingsPath}`,
          cause: error,
        }),
      ),
    );
  });
