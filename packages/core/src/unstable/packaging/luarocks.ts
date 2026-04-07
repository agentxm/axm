/**
 * LuaRocks package detector and reader for package-compatibility discovery.
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

const luarocksType = Schema.decodeUnknownSync(PackageTypeSchema)("luarocks");
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

/** Dependencies to skip (Lua runtime itself). */
const SKIP_DEPS = new Set(["lua"]);

/**
 * Parse a single dependency string from a rockspec dependencies table.
 * Format: "name [operator version]"
 * Examples: "luasocket >= 3.0", "luafilesystem", "cjson == 1.0.0-1"
 */
const parseLuaDep = (
  entry: string,
): { readonly name: string; readonly version?: string } | undefined => {
  const trimmed = entry.trim().replace(/^["']|["']$/g, "");
  if (trimmed === "") return undefined;

  const parts = trimmed.split(/\s+/);
  const name = parts[0];
  if (name === undefined || name === "") return undefined;
  if (SKIP_DEPS.has(name.toLowerCase())) return undefined;

  // Check for exact version: name == version
  if (parts[1] === "==" && parts[2] !== undefined) {
    return { name, version: parts[2] };
  }

  // Any other operator or no version => versionless
  return { name };
};

/**
 * Parse a rockspec dependencies table from file content.
 * The dependencies table has the form:
 *   dependencies = { "dep1", "dep2 >= 1.0", ... }
 * This is a Lua table literal, so we use regex to extract entries.
 */
const parseRockspecDeps = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  // Find dependencies table - may span multiple lines
  const depsRegex = /dependencies\s*=\s*\{([^}]*)}/s;
  const match = depsRegex.exec(content);
  if (match === null || match[1] === undefined) return [];

  // Extract quoted strings from the table
  const stringRegex = /["']([^"']+)["']/g;
  let strMatch: RegExpExecArray | null;

  while ((strMatch = stringRegex.exec(match[1])) !== null) {
    const entry = strMatch[1];
    if (entry === undefined) continue;

    const parsed = parseLuaDep(entry);
    if (parsed === undefined) continue;

    const purl = new PackageURL("luarocks", null, parsed.name, parsed.version ?? null, null, null);
    const purlParts = decodePurl(purl.toString());
    results.push({ purl: purlParts, type: luarocksType, source });
  }

  return results;
};

/**
 * LuaRocks package detector.
 *
 * Scans `*.rockspec` files in the project directory and extracts
 * dependencies from the `dependencies` table. Skips the `lua` runtime.
 * Multiple rockspec files are processed and results deduplicated.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const luarocksDetector: PackageDetector = {
  type: luarocksType,
  detect: Effect.fn("detect.luarocks")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const entries = yield* fs.readDirectory(projectDir).pipe(Effect.option);
      if (Option.isNone(entries)) return [];

      const rockspecFiles = entries.value.filter((e) => e.endsWith(".rockspec"));
      if (rockspecFiles.length === 0) return [];

      const allDeps: Array<DetectedPackage> = [];
      const seenNames = new Set<string>();

      for (const rockspecFile of rockspecFiles) {
        const filePath = path.join(projectDir, rockspecFile);
        const content = yield* readFileOptional(filePath);
        if (Option.isNone(content)) continue;

        const deps = parseRockspecDeps(content.value, filePath);
        if (deps.length === 0 && content.value.trim().length > 0) {
          // Content exists but no deps - check if it looks like a valid rockspec
          if (!content.value.includes("package") && !content.value.includes("rockspec_format")) {
            yield* Effect.logWarning(`Malformed rockspec file: ${rockspecFile}, skipping`);
          }
        }

        for (const dep of deps) {
          if (!seenNames.has(dep.purl.name)) {
            seenNames.add(dep.purl.name);
            allDeps.push(dep);
          }
        }
      }

      return allDeps;
    },
    Effect.annotateLogs({ detector: "luarocks" }),
    Effect.withSpan("detect.luarocks"),
  ),
};

/**
 * LuaRocks package reader.
 *
 * Reads `axm.json` sidecar from the LuaRocks install tree.
 * Checks system tree (`/usr/local/lib/luarocks/rocks-5.x/`) and
 * user tree (`~/.luarocks/lib/luarocks/rocks-5.x/`).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const luarocksReader: PackageReader = {
  type: luarocksType,
  read: Effect.fn("read.luarocks")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      const pkgName = pkg.purl.name;
      const version = pkg.purl.version ?? "0.0.0-0";
      const home = os.homedir();

      // Lua version variants to check
      const luaVersions = ["5.4", "5.3", "5.2", "5.1"];

      // Candidate base paths
      const basePaths = [
        "/usr/local/lib/luarocks",
        path.join(home, ".luarocks", "lib", "luarocks"),
      ];

      for (const basePath of basePaths) {
        for (const luaVer of luaVersions) {
          const axmJsonPath = path.join(basePath, `rocks-${luaVer}`, pkgName, version, "axm.json");
          const content = yield* readFileOptional(axmJsonPath);
          if (Option.isNone(content)) continue;

          const parsed = yield* parseJsonOptional(content.value, `${pkgName}/${version}/axm.json`);
          if (Option.isNone(parsed)) return Option.none();

          const metaResult = decodeAxmMeta(parsed.value);
          if (Result.isFailure(metaResult)) {
            yield* Effect.logWarning(
              `Invalid axm metadata in ${pkgName}: schema validation failed`,
            );
            return Option.none();
          }

          return Option.some(metaResult.success.recommendedExtensions);
        }
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "luarocks" }),
    Effect.withSpan("read.luarocks"),
  ),
};
