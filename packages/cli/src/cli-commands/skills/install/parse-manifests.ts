/**
 * Plugin manifest parsing for skill discovery.
 *
 * Parses .claude-plugin/marketplace.json and .claude-plugin/plugin.json
 * to discover explicitly declared skill directories.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
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
const validatePath = (
  rawPath: string,
  basePath: string,
  path: Path.Path,
): Option.Option<string> => {
  // Must start with ./
  if (!rawPath.startsWith("./")) return Option.none();
  // Must not contain ..
  if (rawPath.includes("..")) return Option.none();
  // Resolve and check within basePath
  const resolved = path.resolve(basePath, rawPath);
  const normalizedBase = path.resolve(basePath);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    return Option.none();
  }
  // Return parent directory of the skill path
  return Option.some(path.dirname(resolved));
};

// -----------------------------------------------------------------------------
// Manifest Parsers
// -----------------------------------------------------------------------------

const MarketplacePlugin = Schema.Struct({
  source: Schema.optional(Schema.Unknown),
  skills: Schema.optional(Schema.Array(Schema.String)),
});

const MarketplaceManifest = Schema.Struct({
  metadata: Schema.optional(Schema.Struct({ pluginRoot: Schema.optional(Schema.String) })),
  plugins: Schema.Array(MarketplacePlugin),
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
 * Validate a directory path from a manifest (not a skill path — no dirname).
 * Must start with `./`, must not contain `..`, and must resolve within basePath.
 * Returns the resolved directory path on success.
 */
const validateDirPath = (
  rawPath: string,
  basePath: string,
  path: Path.Path,
): Option.Option<string> => {
  if (!rawPath.startsWith("./")) return Option.none();
  if (rawPath.includes("..")) return Option.none();
  const resolved = path.resolve(basePath, rawPath);
  const normalizedBase = path.resolve(basePath);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    return Option.none();
  }
  return Option.some(resolved);
};

/**
 * Resolve a plugin's base directory from its source field and pluginRoot.
 * - string source: must start with `./`, resolve relative to basePath + pluginRoot
 * - omitted source: resolve to basePath + pluginRoot (or basePath if no pluginRoot)
 * - object source: skip (remote plugin)
 */
const resolvePluginBase = (
  source: unknown | undefined,
  basePath: string,
  pluginRoot: string | undefined,
  path: Path.Path,
): Option.Option<string> => {
  const rootBase = pluginRoot ? path.resolve(basePath, pluginRoot) : path.resolve(basePath);

  // Object source → skip plugin
  if (typeof source === "object" && source !== null) return Option.none();

  if (typeof source === "string") {
    return validateDirPath(source, rootBase, path);
  }

  // Omitted source → root-level plugin
  return Option.some(rootBase);
};

/**
 * Parse .claude-plugin/marketplace.json and return validated skill parent directories.
 *
 * Supports metadata.pluginRoot, per-plugin source (string/omitted/object),
 * per-plugin skills array, and conventional {pluginBase}/skills/ directory.
 */
const parseMarketplaceJson = (
  basePath: string,
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const manifestPath = path.join(basePath, ".claude-plugin", "marketplace.json");
    const json = yield* readJsonFile(manifestPath);
    if (Option.isNone(json)) return [];

    const data = yield* Schema.decodeUnknown(MarketplaceManifest)(json.value).pipe(Effect.option);
    if (Option.isNone(data)) return [];

    // pluginRoot validation: if present and doesn't start with ./, skip entire manifest
    const pluginRoot = data.value.metadata?.pluginRoot;
    if (pluginRoot !== undefined && !pluginRoot.startsWith("./")) return [];

    return data.value.plugins.flatMap((plugin) => {
      const pluginBase = resolvePluginBase(plugin.source, basePath, pluginRoot, path);
      if (Option.isNone(pluginBase)) return [];

      // Conventional {pluginBase}/skills/ always added
      const conventional = [path.join(pluginBase.value, "skills")];

      // Explicit skill paths transformed via dirname
      const explicit = (plugin.skills ?? []).flatMap((skillPath) => {
        const validated = validatePath(skillPath, pluginBase.value, path);
        return Option.isSome(validated) ? [validated.value] : [];
      });

      return [...conventional, ...explicit];
    });
  });

/**
 * Parse .claude-plugin/plugin.json and return validated skill parent directories.
 *
 * Expected shape: { skills: string[] }
 */
const parsePluginJson = (
  basePath: string,
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const manifestPath = path.join(basePath, ".claude-plugin", "plugin.json");
    const json = yield* readJsonFile(manifestPath);
    if (Option.isNone(json)) return [];

    const data = yield* Schema.decodeUnknown(PluginManifest)(json.value).pipe(Effect.option);
    if (Option.isNone(data)) return [];

    return Array.filterMap(data.value.skills, (skillPath) =>
      validatePath(skillPath, basePath, path),
    );
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
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const [marketplaceDirs, pluginDirs] = yield* Effect.all(
      [parseMarketplaceJson(basePath), parsePluginJson(basePath)],
      { concurrency: "unbounded" },
    );
    return Array.dedupe([...marketplaceDirs, ...pluginDirs]);
  });
