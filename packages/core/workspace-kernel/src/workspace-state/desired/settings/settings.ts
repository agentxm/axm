import { withWork } from "@agentxm/host-primitives/work-observation";
/**
 * Settings management for AXM workspace configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { sweepStaleAtomicWriteTemps, writeFileAtomic } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as JsonPatch from "effect/JsonPatch";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Predicate from "effect/Predicate";
import { SettingsWriteError } from "./errors.js";
import { protectWorkspacePath, recordFilePublication } from "../../../settlement/index.js";
import {
  SETTINGS_KEY_ORDER,
  SETTINGS_KNOWN_KEYS,
  type Settings,
  SettingsSchema,
} from "./schema.js";
import { applyJsonPatchToText } from "./format-preserving-json.js";
import { prepareSettingsRoundTrip, type SettingsRoundTripContext } from "./round-trip.js";

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

const isEmptySettingsConfig = (key: string, value: unknown): boolean => {
  if (key !== "knowledgeConfig" || !Predicate.isReadonlyObject(value)) return false;
  return value["instructions"] !== false;
};

/**
 * Reorder settings keys to match the canonical schema order.
 *
 * Creates a new object with keys in `SETTINGS_KEY_ORDER`, omitting keys
 * not present in the input.
 *
 * @experimental This API is unstable and may change without notice.
 */
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
  canonicalContent: () => string,
  applyPatch: typeof applyJsonPatchToText = applyJsonPatchToText,
): Effect.Effect<ExistingSettingsRenderResult> =>
  Effect.gen(function* (): Effect.fn.Return<ExistingSettingsRenderResult> {
    const patch = JsonPatch.get(prior, target);
    if (patch.length === 0) {
      return { content: priorText };
    }

    const priorWasCanonical = hasCanonicalTopLevelOrder(prior);
    const edited = yield* applyPatch(priorText, prior, patch, {
      preserveInsertionBaseline: true,
      getInsertionIndex: (path, properties) =>
        insertionIndexFor(priorWasCanonical, path, properties),
    });
    if (edited._tag === "Failure") {
      return { content: canonicalContent(), fallbackReason: "edit_failed" };
    }

    const parsed = yield* Effect.sync(() => parseJson(edited.text)).pipe((effect) =>
      withWork("axm.parse.settings-round-trip", effect, {
        attributes: { "axm.work.count": 1, "axm.parse.phase": "rendered" },
      }),
    );
    if (parsed === undefined || JsonPatch.get(parsed, target).length !== 0) {
      return { content: canonicalContent(), fallbackReason: "edited_content_invalid" };
    }

    return {
      content:
        isJsonObject(target) && Object.keys(target).length === 0
          ? `{}` + (priorText.match(/\s*$/)?.[0] ?? "")
          : edited.text,
    };
  });

// -----------------------------------------------------------------------------
// Core Functions
// -----------------------------------------------------------------------------

/**
 * Write settings to the selected scope's settings path.
 *
 * Creates the directory if it doesn't exist. Pretty-prints JSON with 2-space indent.
 *
 * @param settingsPath - Exact project or user settings path
 * @param settings - Settings object to write
 *
 * @experimental This API is unstable and may change without notice.
 */
export const writeSettingsAtPath = (
  settingsPath: string,
  settings: Settings,
  roundTrip?: SettingsRoundTripContext,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsDir = path.dirname(settingsPath);

    // Ensure directory exists
    yield* fs
      .makeDirectory(settingsDir, { recursive: true })
      .pipe(
        Effect.mapError(
          (cause) => new SettingsWriteError({ path: settingsDir, step: "mkdir", cause }),
        ),
      );

    // Encode through schema (converts Option -> nullable, URL -> string, etc.)
    const encoded = yield* Schema.encodeEffect(SettingsSchema)(settings).pipe(
      Effect.mapError(
        (cause) => new SettingsWriteError({ path: settingsPath, step: "encode", cause }),
      ),
    );

    const ordered = orderSettingsRecord(encoded);
    const canonicalContent = () => serializeCanonicalSettings(ordered);
    const targetResult = yield* Effect.result(Schema.decodeUnknownEffect(Schema.Json)(ordered));
    let content: string | undefined;
    let priorRaw: string | undefined;
    let existed = true;

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
      } else if (!existsResult.success) {
        existed = false;
      } else {
        const readResult = yield* Effect.result(fs.readFileString(settingsPath));
        if (readResult._tag === "Failure") {
          yield* Effect.logDebug("Falling back to canonical settings serialization", {
            settingsPath,
            reason: "read_failed",
          });
        } else if (readResult.success.trim() !== "") {
          priorRaw = readResult.success;
          const prior = yield* Effect.sync(() => parseJson(readResult.success)).pipe((effect) =>
            withWork("axm.parse.settings-round-trip", effect, {
              attributes: { "axm.work.count": 1, "axm.parse.phase": "prior" },
            }),
          );
          if (prior === undefined) {
            yield* Effect.logDebug("Falling back to canonical settings serialization", {
              settingsPath,
              reason: "parse_failed",
            });
          } else {
            const rendered = yield* renderExistingSettings(
              readResult.success,
              prior,
              targetResult.success,
              canonicalContent,
            ).pipe((effect) =>
              withWork("axm.render.settings", effect, { attributes: { "axm.work.count": 1 } }),
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

    content ??= canonicalContent();
    // This is the owner's live read. Do not reopen the same file just to compare
    // bytes again in the atomic publisher, or render a canonical no-op fallback.
    if (content === priorRaw) {
      yield* Effect.annotateCurrentSpan("axm.changed", false);
      return;
    }
    const restoration =
      roundTrip === undefined || priorRaw === undefined || priorRaw === content
        ? undefined
        : yield* prepareSettingsRoundTrip({
            context: roundTrip,
            settingsPath,
            before: priorRaw,
            after: content,
          });
    content = restoration?.content ?? content;
    if (restoration !== undefined) yield* restoration.revalidate;
    if (content === priorRaw) {
      yield* Effect.annotateCurrentSpan("axm.changed", false);
      return;
    }
    yield* protectWorkspacePath(settingsPath);

    // Write to a temp file then atomically rename into place, so an interrupted
    // write can never truncate or corrupt the user's existing settings file.
    // The temp file is removed on any failure or interruption.
    yield* sweepStaleAtomicWriteTemps(fs, settingsPath);
    // A write that would leave the same bytes in place is not a durable
    // change, so it neither touches the file nor enters the footprint. A
    // prior file that cannot be read is replaced, as it always was.
    const written = yield* writeFileAtomic(fs, {
      targetPath: settingsPath,
      content,
      onPublished: (publication) =>
        recordFilePublication(
          { path: settingsPath, change: existed ? "modified" : "created" },
          publication,
        ),
      mapError: (failure) =>
        new SettingsWriteError({
          path: failure.step === "write-temp" ? failure.tempPath : settingsPath,
          step: failure.step,
          cause: failure.cause,
        }),
    });
    if (written === "written") {
      yield* Effect.annotateCurrentSpan("axm.changed", true);
      if (restoration !== undefined) yield* restoration.finish;
    }
  }).pipe(
    Effect.withSpan("axm.publish.document", { attributes: { "axm.document.kind": "settings" } }),
    Effect.uninterruptible,
  );
