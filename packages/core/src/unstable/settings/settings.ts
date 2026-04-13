/**
 * Settings management for .axm/settings.json.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
import { decodeHandleSync } from "../extensions/handle.js";
import { readAndValidateJsonFile } from "../schema/index.js";
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
 * Default profile for skill resolution when not specified in settings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DEFAULT_PROFILE = decodeHandleSync("@community");

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

const orderSettingsRecord = (
  settings: Readonly<Record<string, unknown>>,
): Record<string, unknown> =>
  SETTINGS_KEY_ORDER.reduce<Record<string, unknown>>((ordered, key) => {
    const value = settings[key];
    return value === undefined ? ordered : { ...ordered, [key]: value };
  }, {});

export const orderSettingsKeys = (settings: Settings): Settings =>
  decodeSettingsSync(orderSettingsRecord(encodeSettingsSync(settings)));

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
    const path = yield* Path.Path;
    const settingsPath = path.join(axmDir, SETTINGS_FILENAME);

    const result = yield* readAndValidateJsonFile(settingsPath, SettingsSchema);

    switch (result._tag) {
      case "ok":
        return Option.some(result.value);
      case "missing":
        return Option.none<Settings>();
      case "read-failure":
        return yield* makeAppError({
          code: "SETTINGS_PARSE_FAILED",
          what: `Failed to read settings file: ${settingsPath}`,
          details: [result.error],
        });
      case "unparseable":
        return yield* makeAppError({
          code: "SETTINGS_PARSE_FAILED",
          what: `Failed to parse settings JSON at ${settingsPath}`,
          details: [result.error, ...(result.location !== undefined ? [result.location] : [])],
        });
      case "schema-invalid":
        return yield* makeAppError({
          code: "SETTINGS_PARSE_FAILED",
          what: `Invalid settings format: ${settingsPath}`,
          details: [...result.issues],
        });
    }
  });

/**
 * Read settings from .axm/settings.json, falling back to defaults on missing
 * file or read/parse error.
 *
 * @param axmDir - Path to the .axm directory
 * @returns Settings object (never fails)
 *
 * @remarks All errors — including schema validation failures — are silently
 * swallowed, returning default settings. Only use this in contexts where a
 * prior check (e.g. workspace-ready) has already validated the settings file.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const readSettingsOrDefault = (axmDir: string) =>
  readSettings(axmDir).pipe(
    Effect.map(Option.getOrElse(() => createDefaultSettings())),
    Effect.orElseSucceed(() => createDefaultSettings()),
  );

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
          code: "SETTINGS_WRITE_FAILED",
          what: `Failed to create directory: ${axmDir}`,
          cause: error,
        }),
      ),
    );

    // Encode through schema (converts Option -> nullable, URL -> string, etc.)
    const encoded = yield* Schema.encodeEffect(SettingsSchema)(settings).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "SETTINGS_WRITE_FAILED",
          what: `Failed to encode settings: ${error.message}`,
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
          code: "SETTINGS_WRITE_FAILED",
          what: `Failed to write settings file: ${settingsPath}`,
          cause: error,
        }),
      ),
    );
  });
