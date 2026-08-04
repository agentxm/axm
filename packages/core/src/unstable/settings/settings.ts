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
import { writeFileAtomic } from "../utils/index.js";
import {
  SETTINGS_KEY_ORDER,
  SETTINGS_KNOWN_KEYS,
  type Settings,
  SettingsSchema,
} from "./schema.js";

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
  "rulesConfig",
  "skillsConfig",
  "commandsConfig",
  "subagentsConfig",
  "packsConfig",
  "mcpServersConfig",
  "filesConfig",
  "hooksConfig",
  "knowledgeConfig",
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEmptySettingsConfig = (key: string, value: unknown): boolean => {
  if (!settingsConfigKeys.has(key) || !isRecord(value)) return false;
  if (key === "rulesConfig") return value["instructions"] === undefined;
  return Object.values(value).every(
    (field) => field === undefined || (Array.isArray(field) && field.length === 0),
  );
};

const orderSettingsRecord = (
  settings: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const ordered = SETTINGS_KEY_ORDER.reduce<Record<string, unknown>>((accumulated, key) => {
    const value = settings[key];
    return value === undefined || isEmptySettingsConfig(key, value)
      ? accumulated
      : { ...accumulated, [key]: value };
  }, {});
  // Unknown top-level keys are preserved after the canonical keys, in their
  // original relative order, so a write never discards data it did not create.
  for (const [key, value] of Object.entries(settings)) {
    if (!SETTINGS_KNOWN_KEYS.has(key) && value !== undefined) {
      ordered[key] = value;
    }
  }
  return ordered;
};

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
          detail: `Failed to create directory: ${axmDir}`,
          cause: error,
        }),
      ),
    );

    // Encode through schema (converts Option -> nullable, URL -> string, etc.)
    const encoded = yield* Schema.encodeEffect(SettingsSchema)(settings).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to encode settings: ${error.message}`,
          cause: error,
        }),
      ),
    );

    // Serialize to JSON with pretty printing and trailing newline.
    const content = JSON.stringify(orderSettingsRecord(encoded), null, 2) + "\n";

    // Write to a temp file then atomically rename into place, so an interrupted
    // write can never truncate or corrupt the user's existing settings file.
    // The temp file is removed on any failure or interruption.
    yield* writeFileAtomic(fs, {
      targetPath: settingsPath,
      content,
      mapError: (failure) =>
        makeAppError({
          code: "internal",
          detail:
            failure.step === "rename"
              ? `Failed to atomically replace settings file: ${settingsPath}`
              : `Failed to write settings temp file: ${failure.tempPath}`,
          cause: failure.cause,
        }),
    });
  });
