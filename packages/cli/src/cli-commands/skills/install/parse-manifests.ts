/**
 * Plugin manifest parsing for skill discovery.
 *
 * Parses .claude-plugin/marketplace.json and .claude-plugin/plugin.json
 * to discover explicitly declared skill directories.
 */

import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

// -----------------------------------------------------------------------------
// Path Validation
// -----------------------------------------------------------------------------

/**
 * Validate a raw skill path from a manifest.
 * Must start with `./`, must not contain `..`, and must resolve within basePath.
 * Returns the parent directory of the skill path on success.
 */
const validatePath = (rawPath: string, basePath: string): Option.Option<string> => {
  // Must start with ./
  if (!rawPath.startsWith("./")) return Option.none();
  // Must not contain ..
  if (rawPath.includes("..")) return Option.none();
  // Resolve and check within basePath
  const resolved = nodePath.resolve(basePath, rawPath);
  const normalizedBase = nodePath.resolve(basePath);
  if (!resolved.startsWith(normalizedBase + nodePath.sep) && resolved !== normalizedBase) {
    return Option.none();
  }
  // Return parent directory of the skill path
  return Option.some(nodePath.dirname(resolved));
};

// -----------------------------------------------------------------------------
// Manifest Parsers
// -----------------------------------------------------------------------------

const MarketplaceManifest = Schema.Struct({
  plugins: Schema.Array(Schema.Struct({ skillPath: Schema.String })),
});

const PluginManifest = Schema.Struct({
  skills: Schema.Array(Schema.String),
});

/**
 * Read a file and parse as JSON, returning None on any failure.
 */
const readJsonFile = (
  filePath: string,
): Effect.Effect<Option.Option<unknown>, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(filePath).pipe(Effect.option);
    if (Option.isNone(content)) return Option.none();
    return yield* Effect.try(() => JSON.parse(content.value) as unknown).pipe(
      Effect.map((json) => Option.some(json)),
      Effect.orElseSucceed(() => Option.none()),
    );
  });

/**
 * Parse .claude-plugin/marketplace.json and return validated skill parent directories.
 *
 * Expected shape: { plugins: Array<{ skillPath: string }> }
 */
const parseMarketplaceJson = (
  basePath: string,
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const manifestPath = nodePath.join(basePath, ".claude-plugin", "marketplace.json");
    const json = yield* readJsonFile(manifestPath);
    if (Option.isNone(json)) return [];

    const data = yield* Schema.decodeUnknown(MarketplaceManifest)(json.value).pipe(Effect.option);
    if (Option.isNone(data)) return [];

    return Array.filterMap(data.value.plugins, (plugin) =>
      validatePath(plugin.skillPath, basePath),
    );
  });

/**
 * Parse .claude-plugin/plugin.json and return validated skill parent directories.
 *
 * Expected shape: { skills: string[] }
 */
const parsePluginJson = (
  basePath: string,
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const manifestPath = nodePath.join(basePath, ".claude-plugin", "plugin.json");
    const json = yield* readJsonFile(manifestPath);
    if (Option.isNone(json)) return [];

    const data = yield* Schema.decodeUnknown(PluginManifest)(json.value).pipe(Effect.option);
    if (Option.isNone(data)) return [];

    return Array.filterMap(data.value.skills, (skillPath) => validatePath(skillPath, basePath));
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Parse plugin manifests and return validated skill parent directories.
 * All paths are validated to be within basePath.
 * Errors are silently skipped (returns empty array on failure).
 */
export const parseManifests = (
  basePath: string,
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const [marketplaceDirs, pluginDirs] = yield* Effect.all(
      [parseMarketplaceJson(basePath), parsePluginJson(basePath)],
      { concurrency: "unbounded" },
    );
    return Array.dedupe([...marketplaceDirs, ...pluginDirs]);
  });
