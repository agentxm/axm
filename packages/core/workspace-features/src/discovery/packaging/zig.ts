/**
 * Zig package detector and reader for package-compatibility discovery.
 *
 * Parses `build.zig.zon` for URL-based dependencies and reads agentExtensions metadata
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
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAgentExtensions, parseJsonOptional, readFileOptional } from "./reader-io.js";
import { makeDetectedPackage } from "./detected-package.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const zigType = Schema.decodeUnknownSync(PackageTypeSchema)("zig");

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
 * names from the `.dependencies` field, producing `pkg:zig/<name>` purls.
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
        const detected = makeDetectedPackage({ type: zigType, name, source: manifestPath });
        if (Option.isSome(detected)) results.push(detected.value);
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
 * Reads `agent-extensions.json` sidecar files from `~/.cache/zig/p/<hash>/` for each
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

      // Scan cache directory entries for agent-extensions.json
      const entries = yield* fs.readDirectory(cacheDir).pipe(Effect.option);
      if (Option.isNone(entries)) return Option.none();

      // Check each cache entry for agent-extensions.json with matching package name
      for (const entry of entries.value) {
        const agentExtensionsJsonPath = path.join(cacheDir, entry, "agent-extensions.json");
        const content = yield* readFileOptional(agentExtensionsJsonPath);
        if (Option.isNone(content)) continue;

        const parsed = yield* parseJsonOptional(
          content.value,
          `${pkg.purl.name}/agent-extensions.json`,
        );
        if (Option.isNone(parsed)) continue;

        const metaResult = yield* decodeAgentExtensions(parsed.value);
        if (Result.isFailure(metaResult)) {
          yield* Effect.logWarning(
            `Invalid agentExtensions metadata in zig cache for ${pkg.purl.name}: schema validation failed`,
          );
          continue;
        }

        return Option.some(metaResult.success.agentExtensions);
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "zig" }),
    Effect.withSpan("read.zig"),
  ),
};
