/**
 * Zig package detector and reader for package-compatibility discovery.
 *
 * Parses `build.zig.zon` for URL-based dependencies and reads axm metadata
 * from the Zig package cache at `~/.cache/zig/`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:os homedir() has no @effect/platform equivalent.
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { PackageURL } from "packageurl-js";
import { AxmPackageMetaSchema } from "./axm-package-meta.js";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlSchema } from "./package-url.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const zigType = Schema.decodeUnknownSync(PackageTypeSchema)("generic");
const decodePurl = Schema.decodeUnknownSync(PackageUrlSchema);
const decodeAxmMeta = Schema.decodeUnknownResult(AxmPackageMetaSchema);

/**
 * Read a file as string, returning Option.none for NotFound and other errors.
 */
const readFileOptional = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(filePath).pipe(Effect.option);
    return content;
  });

/**
 * Parse JSON string, returning Option.none and logging a warning on failure.
 */
const parseJsonOptional = (content: string, context: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.try({
      try: (): unknown => JSON.parse(content),
      catch: () => ({ _tag: "JsonParseError" as const }),
    }).pipe(Effect.option);

    if (Option.isNone(result)) {
      yield* Effect.logWarning(`Malformed JSON in ${context}, skipping`);
      return Option.none<unknown>();
    }

    return Option.some(result.value);
  });

/**
 * Extract dependency names from build.zig.zon content.
 *
 * Zon uses a struct-like syntax:
 * ```
 * .dependencies = .{
 *     .zap = .{ .url = "...", .hash = "..." },
 *     .mach = .{ .url = "...", .hash = "..." },
 * },
 * ```
 *
 * We extract the dependency names (keys) using regex.
 */
const parseZonDependencies = (content: string): ReadonlyArray<string> => {
  // Find the start of the .dependencies block
  const startIdx = content.indexOf(".dependencies");
  if (startIdx === -1) return [];

  // Find the opening .{ after .dependencies =
  const openBrace = content.indexOf(".{", startIdx);
  if (openBrace === -1) return [];

  // Track brace depth to find the matching closing }
  let depth = 0;
  let endIdx = openBrace;
  for (let i = openBrace; i < content.length; i++) {
    if (content[i] === "{") depth++;
    if (content[i] === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  const depsBlock = content.slice(openBrace, endIdx + 1);
  const names: Array<string> = [];

  // Match dependency names: .name = .{ ... }
  // Also support quoted names: .@"name-with-dashes" = .{ ... }
  const depPattern = /\.(?:@"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))\s*=\s*\.?\{/g;
  let match = depPattern.exec(depsBlock);
  while (match !== null) {
    const name = match[1] ?? match[2];
    if (name !== undefined) {
      names.push(name);
    }
    match = depPattern.exec(depsBlock);
  }

  return names;
};

/**
 * Zig package detector.
 *
 * Scans `build.zig.zon` in the project directory and extracts dependency
 * names from the `.dependencies` field, producing `pkg:generic/zig/<name>` purls.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const zigDetector: PackageDetector = {
  type: zigType,
  detect: Effect.fn("detect.zig")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const manifestPath = path.join(projectDir, "build.zig.zon");

      const content = yield* readFileOptional(manifestPath);
      if (Option.isNone(content)) return [];

      const names = parseZonDependencies(content.value);
      if (names.length === 0) {
        // Check if the file looks like it should have dependencies but we couldn't parse
        if (
          content.value.includes(".dependencies") &&
          !content.value.includes(".dependencies = .{")
        ) {
          yield* Effect.logWarning(
            "Malformed build.zig.zon: could not parse .dependencies, skipping",
          );
        }
        return [];
      }

      const results: Array<DetectedPackage> = [];
      for (const name of names) {
        const purl = new PackageURL("generic", "zig", name, null, null, null);
        const purlParts = decodePurl(purl.toString());
        results.push({ purl: purlParts, type: zigType, source: manifestPath });
      }

      return results;
    },
    Effect.annotateLogs({ detector: "zig" }),
    Effect.withSpan("detect.zig"),
  ),
};

/**
 * Zig package reader.
 *
 * Reads `axm.json` sidecar files from `~/.cache/zig/p/<hash>/` for each
 * detected Zig package and extracts recommendation metadata.
 *
 * Since Zig uses content-addressed hashes for packages rather than named
 * directories, the reader does a best-effort scan of the cache.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const zigReader: PackageReader = {
  type: zigType,
  read: Effect.fn("read.zig")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const cacheDir = path.join(os.homedir(), ".cache", "zig", "p");

      // Check if cache directory exists
      const cacheDirExists = yield* fs.exists(cacheDir).pipe(Effect.option);
      if (Option.isNone(cacheDirExists) || !cacheDirExists.value) return Option.none();

      // Scan cache directory entries for axm.json
      const entries = yield* fs.readDirectory(cacheDir).pipe(Effect.option);
      if (Option.isNone(entries)) return Option.none();

      // Check each cache entry for axm.json with matching package name
      for (const entry of entries.value) {
        const axmJsonPath = path.join(cacheDir, entry, "axm.json");
        const content = yield* readFileOptional(axmJsonPath);
        if (Option.isNone(content)) continue;

        const parsed = yield* parseJsonOptional(content.value, `${pkg.purl.name}/axm.json`);
        if (Option.isNone(parsed)) continue;

        const metaResult = decodeAxmMeta(parsed.value);
        if (Result.isFailure(metaResult)) {
          yield* Effect.logWarning(
            `Invalid axm metadata in zig cache for ${pkg.purl.name}: schema validation failed`,
          );
          continue;
        }

        return Option.some(metaResult.success.extensions);
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "zig" }),
    Effect.withSpan("read.zig"),
  ),
};
