/**
 * Settings management for .axm/settings.json.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
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
const encodeSettingsSync = Schema.encodeSync(SettingsSchema);
const decodeSettingsSync = Schema.decodeUnknownSync(SettingsSchema);

const settingsConfigKeys = new Set([
  "skillsConfig",
  "commandsConfig",
  "subagentsConfig",
  "packsConfig",
  "mcpServersConfig",
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEmptySettingsConfig = (key: string, value: unknown): boolean => {
  if (!settingsConfigKeys.has(key) || !isRecord(value)) return false;
  const ignore = value["ignore"];
  return ignore === undefined || (Array.isArray(ignore) && ignore.length === 0);
};

const orderSettingsRecord = (
  settings: Readonly<Record<string, unknown>>,
): Record<string, unknown> =>
  SETTINGS_KEY_ORDER.reduce<Record<string, unknown>>((ordered, key) => {
    const value = settings[key];
    return value === undefined || isEmptySettingsConfig(key, value)
      ? ordered
      : { ...ordered, [key]: value };
  }, {});

export const orderSettingsKeys = (settings: Settings): Settings =>
  decodeSettingsSync(orderSettingsRecord(encodeSettingsSync(settings)));

// -----------------------------------------------------------------------------
// Core Functions
// -----------------------------------------------------------------------------

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
        makeAppError({
          code: "internal",
          message: `Failed to create directory: ${axmDir}`,
          cause: error,
        }),
      ),
    );

    // Encode through schema (converts Option -> nullable, URL -> string, etc.)
    const encoded = yield* Schema.encodeEffect(SettingsSchema)(settings).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          message: `Failed to encode settings: ${error.message}`,
          cause: error,
        }),
      ),
    );

    // Serialize to JSON with pretty printing and trailing newline.
    const content = JSON.stringify(orderSettingsRecord(encoded), null, 2) + "\n";

    // Write file
    yield* fs.writeFileString(settingsPath, content).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          message: `Failed to write settings file: ${settingsPath}`,
          cause: error,
        }),
      ),
    );
  });
