/**
 * Settings management for .axm/settings.json.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as JsonPatch from "effect/JsonPatch";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
import { sweepStaleAtomicWriteTemps, writeFileAtomic } from "../utils/index.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import { recordFootprint } from "../workspace/footprint-recorder.js";
import {
  SETTINGS_KEY_ORDER,
  SETTINGS_KNOWN_KEYS,
  type Settings,
  SettingsSchema,
} from "./schema.js";
import { applyJsonPatchToText } from "./format-preserving-json.js";

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
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEmptySettingsConfig = (key: string, value: unknown): boolean => {
  if (key !== "knowledgeConfig" || !isRecord(value)) return false;
  return value["instructions"] !== false;
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

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value);

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  typeof value === "object" && value !== null && !isJsonArray(value);

const parseJson = (text: string): Schema.Json | undefined => {
  try {
    return Schema.decodeUnknownSync(Schema.Json)(JSON.parse(text));
  } catch {
    return undefined;
  }
};

const serializeCanonicalSettings = (settings: Readonly<Record<string, unknown>>): string =>
  JSON.stringify(settings, null, 2) + "\n";

const ensureSingleTrailingNewline = (content: string): string =>
  content.replace(/[\r\n]+$/, "") + "\n";

const hasCanonicalTopLevelOrder = (settings: Schema.Json): boolean => {
  if (!isJsonObject(settings)) return false;

  let previousIndex = -1;
  let foundUnknownKey = false;
  for (const key of Object.keys(settings)) {
    const index = SETTINGS_KEY_ORDER.indexOf(key);
    if (index === -1) {
      foundUnknownKey = true;
      continue;
    }
    if (foundUnknownKey || index <= previousIndex) return false;
    previousIndex = index;
  }
  return true;
};

const insertionIndexFor = (
  priorWasCanonical: boolean,
  path: ReadonlyArray<string | number>,
  properties: ReadonlyArray<string>,
): number => {
  const key = path.length === 1 ? path[0] : undefined;
  if (!priorWasCanonical || typeof key !== "string") return properties.length;

  const keyIndex = SETTINGS_KEY_ORDER.indexOf(key);
  if (keyIndex === -1) return properties.length;

  const nextIndex = properties.findIndex((property) => {
    const propertyIndex = SETTINGS_KEY_ORDER.indexOf(property);
    return propertyIndex === -1 || propertyIndex > keyIndex;
  });
  return nextIndex === -1 ? properties.length : nextIndex;
};

type ExistingSettingsRenderResult = {
  readonly content: string;
  readonly fallbackReason?: "edit_failed" | "edited_content_invalid";
};

/** @internal */
export const renderExistingSettings = (
  priorText: string,
  prior: Schema.Json,
  target: Schema.Json,
  canonicalContent: string,
  applyPatch: typeof applyJsonPatchToText = applyJsonPatchToText,
): ExistingSettingsRenderResult => {
  const patch = JsonPatch.get(prior, target);
  if (patch.length === 0) {
    return { content: ensureSingleTrailingNewline(priorText) };
  }

  const priorWasCanonical = hasCanonicalTopLevelOrder(prior);
  const edited = applyPatch(priorText, prior, patch, {
    getInsertionIndex: (path, properties) => insertionIndexFor(priorWasCanonical, path, properties),
  });
  if (edited._tag === "Failure") {
    return { content: canonicalContent, fallbackReason: "edit_failed" };
  }

  const parsed = parseJson(edited.text);
  if (parsed === undefined || JsonPatch.get(parsed, target).length !== 0) {
    return { content: canonicalContent, fallbackReason: "edited_content_invalid" };
  }

  if (isJsonObject(target) && Object.keys(target).length === 0) {
    return { content: canonicalContent };
  }

  return { content: ensureSingleTrailingNewline(edited.text) };
};

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

    const ordered = orderSettingsRecord(encoded);
    const canonicalContent = serializeCanonicalSettings(ordered);
    const targetResult = yield* Effect.result(Schema.decodeUnknownEffect(Schema.Json)(ordered));
    let content = canonicalContent;

    if (targetResult._tag === "Failure") {
      yield* Effect.logDebug("Falling back to canonical settings serialization", {
        settingsPath,
        reason: "target_not_json",
      });
    } else {
      const existsResult = yield* Effect.result(fs.exists(settingsPath));
      if (existsResult._tag === "Failure") {
        yield* Effect.logDebug("Falling back to canonical settings serialization", {
          settingsPath,
          reason: "existence_check_failed",
        });
      } else if (existsResult.success) {
        const readResult = yield* Effect.result(fs.readFileString(settingsPath));
        if (readResult._tag === "Failure") {
          yield* Effect.logDebug("Falling back to canonical settings serialization", {
            settingsPath,
            reason: "read_failed",
          });
        } else if (readResult.success.trim() !== "") {
          const prior = parseJson(readResult.success);
          if (prior === undefined) {
            yield* Effect.logDebug("Falling back to canonical settings serialization", {
              settingsPath,
              reason: "parse_failed",
            });
          } else {
            const rendered = renderExistingSettings(
              readResult.success,
              prior,
              targetResult.success,
              canonicalContent,
            );
            content = rendered.content;
            if (rendered.fallbackReason !== undefined) {
              yield* Effect.logDebug("Falling back to canonical settings serialization", {
                settingsPath,
                reason: rendered.fallbackReason,
              });
            }
          }
        }
      }
    }

    yield* protectWorkspacePath(settingsPath);

    const existed = yield* fs.exists(settingsPath).pipe(Effect.orElseSucceed(() => true));
    // Write to a temp file then atomically rename into place, so an interrupted
    // write can never truncate or corrupt the user's existing settings file.
    // The temp file is removed on any failure or interruption.
    yield* sweepStaleAtomicWriteTemps(fs, settingsPath);
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
    yield* recordFootprint({ path: settingsPath, change: existed ? "modified" : "created" });
  });
