/**
 * Plugin manifest parsing for skill discovery.
 *
 * Parses .claude-plugin/marketplace.json and .claude-plugin/plugin.json
 * to discover explicitly declared skill directories.
 */

import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

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

    const data = json.value;
    if (
      typeof data !== "object" ||
      data === null ||
      !Array.isArray((data as { plugins?: unknown }).plugins)
    ) {
      return [];
    }

    const plugins = (data as { plugins: unknown[] }).plugins;
    const dirs: string[] = [];
    for (const plugin of plugins) {
      if (typeof plugin !== "object" || plugin === null) continue;
      const skillPath = (plugin as { skillPath?: unknown }).skillPath;
      if (typeof skillPath !== "string") continue;
      const validated = validatePath(skillPath, basePath);
      if (Option.isSome(validated)) {
        dirs.push(validated.value);
      }
    }
    return dirs;
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

    const data = json.value;
    if (
      typeof data !== "object" ||
      data === null ||
      !Array.isArray((data as { skills?: unknown }).skills)
    ) {
      return [];
    }

    const skills = (data as { skills: unknown[] }).skills;
    const dirs: string[] = [];
    for (const skillPath of skills) {
      if (typeof skillPath !== "string") continue;
      const validated = validatePath(skillPath, basePath);
      if (Option.isSome(validated)) {
        dirs.push(validated.value);
      }
    }
    return dirs;
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
    const marketplaceDirs = yield* parseMarketplaceJson(basePath);
    const pluginDirs = yield* parsePluginJson(basePath);

    // Deduplicate
    const seen = new Set<string>();
    const result: string[] = [];
    for (const dir of [...marketplaceDirs, ...pluginDirs]) {
      if (!seen.has(dir)) {
        seen.add(dir);
        result.push(dir);
      }
    }
    return result;
  });
