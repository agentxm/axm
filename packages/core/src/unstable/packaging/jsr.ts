/**
 * JSR package detector and Deno reader for package-compatibility discovery.
 *
 * Parses `deno.json`/`deno.jsonc` for `jsr:@scope/name` imports and reads
 * axm metadata from Deno's module cache.
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

// eslint-disable-next-line no-restricted-properties -- Centralized env var access for packaging detectors
const readEnv = (name: string): string | undefined => process.env[name];
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlSchema } from "./package-url.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const jsrType = Schema.decodeUnknownSync(PackageTypeSchema)("jsr");
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
 * Strip single-line (//) and multi-line comments from JSONC content.
 * Simple approach that handles most common cases.
 */
const stripJsoncComments = (content: string): string => {
  let result = "";
  let i = 0;
  let inString = false;

  while (i < content.length) {
    // Track string boundaries
    if (content[i] === '"' && (i === 0 || content[i - 1] !== "\\")) {
      inString = !inString;
      result += content[i];
      i++;
      continue;
    }

    if (inString) {
      result += content[i];
      i++;
      continue;
    }

    // Single-line comment
    if (content[i] === "/" && content[i + 1] === "/") {
      while (i < content.length && content[i] !== "\n") i++;
      continue;
    }

    // Multi-line comment
    if (content[i] === "/" && content[i + 1] === "*") {
      i += 2;
      while (i < content.length - 1 && !(content[i] === "*" && content[i + 1] === "/")) i++;
      i += 2; // skip */
      continue;
    }

    result += content[i];
    i++;
  }

  return result;
};

/**
 * Returns true if the specifier is an exact semver version (no range operators).
 */
const isExactVersion = (version: string): boolean =>
  /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9._+-]*)?$/.test(version);

/**
 * Parse a JSR import specifier like `jsr:@scope/name@version`.
 * Returns parsed parts or undefined if not a JSR import.
 */
const parseJsrSpecifier = (
  specifier: string,
): { readonly scope: string; readonly name: string; readonly version?: string } | undefined => {
  if (!specifier.startsWith("jsr:")) return undefined;

  const rest = specifier.slice(4); // Remove "jsr:" prefix
  // Match @scope/name or @scope/name@version
  const match = /^(@[^/]+)\/([^@]+)(?:@(.+))?$/.exec(rest);
  if (match === null || match[1] === undefined || match[2] === undefined) return undefined;

  return {
    scope: match[1],
    name: match[2],
    ...(match[3] !== undefined ? { version: match[3] } : {}),
  };
};

/**
 * Extract JSR imports from a parsed deno.json imports map.
 */
const extractJsrImports = (
  imports: Record<string, string>,
  source: string,
): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  for (const specifier of Object.values(imports)) {
    const parsed = parseJsrSpecifier(specifier);
    if (parsed === undefined) continue; // Skip non-JSR imports (npm:, etc.)

    const version =
      parsed.version !== undefined && isExactVersion(parsed.version) ? parsed.version : undefined;

    const purl = new PackageURL("jsr", parsed.scope, parsed.name, version ?? null, null, null);
    const purlParts = decodePurl(purl.toString());
    results.push({ purl: purlParts, type: jsrType, source });
  }

  return results;
};

/** Schema to extract the optional "imports" field from deno.json. */
const DenoImportsSchema = Schema.Struct({
  imports: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
const decodeDenoImports = Schema.decodeUnknownResult(DenoImportsSchema);

/**
 * JSR package detector.
 *
 * Scans `deno.json` and `deno.jsonc` in the project directory and extracts
 * `jsr:@scope/name` imports, producing `pkg:jsr/<scope>/<name>` purls.
 * npm-prefixed imports are skipped.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const jsrDetector: PackageDetector = {
  type: jsrType,
  detect: Effect.fn("detect.jsr")(
    function* (projectDir: string) {
      const path = yield* Path.Path;

      // Try deno.json first, then deno.jsonc
      const denoJsonPath = path.join(projectDir, "deno.json");
      const denoJsoncPath = path.join(projectDir, "deno.jsonc");

      let content = yield* readFileOptional(denoJsonPath);
      let source = denoJsonPath;
      let isJsonc = false;

      if (Option.isNone(content)) {
        content = yield* readFileOptional(denoJsoncPath);
        source = denoJsoncPath;
        isJsonc = true;
      }

      if (Option.isNone(content)) return [];

      // Strip comments for .jsonc files
      const jsonContent = isJsonc ? stripJsoncComments(content.value) : content.value;

      const parsed = yield* parseJsonOptional(jsonContent, source);
      if (Option.isNone(parsed)) return [];

      const importsResult = decodeDenoImports(parsed.value);
      if (Result.isFailure(importsResult)) return [];

      const imports = importsResult.success.imports;
      if (imports === undefined) return [];

      return extractJsrImports(imports, source);
    },
    Effect.annotateLogs({ detector: "jsr" }),
    Effect.withSpan("detect.jsr"),
  ),
};

/** Schema to extract the optional "axm" field from deno.json. */
const AxmContainerSchema = Schema.Struct({
  axm: Schema.optional(Schema.Unknown),
});
const decodeAxmContainer = Schema.decodeUnknownResult(AxmContainerSchema);

/**
 * Resolve the Deno cache directory.
 * Uses $DENO_DIR if set, otherwise platform-specific defaults.
 */
const resolveDenoDir = () =>
  Effect.sync(() => {
    const denoDir = readEnv("DENO_DIR");
    if (denoDir !== undefined && denoDir !== "") return denoDir;

    // Platform-specific defaults
    if (process.platform === "darwin") {
      return `${os.homedir()}/Library/Caches/deno`;
    }
    return `${os.homedir()}/.cache/deno`;
  });

/**
 * Deno package reader.
 *
 * Reads axm metadata from cached module metadata in Deno's module cache.
 * Checks for an `"axm"` field in cached `deno.json` files.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const denoReader: PackageReader = {
  type: jsrType,
  read: Effect.fn("read.deno")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const denoDir = yield* resolveDenoDir();

      // Check if deno cache directory exists
      const denoDirExists = yield* fs.exists(denoDir).pipe(Effect.option);
      if (Option.isNone(denoDirExists) || !denoDirExists.value) return Option.none();

      const pkgNamespace = pkg.purl.namespace;
      if (pkgNamespace === undefined) return Option.none();
      const scope = pkgNamespace;

      // Look for cached module metadata
      // Deno caches JSR packages in registry cache
      const registryCacheDir = path.join(denoDir, "registries", "jsr.io");
      const cacheDirExists = yield* fs.exists(registryCacheDir).pipe(Effect.option);
      if (Option.isNone(cacheDirExists) || !cacheDirExists.value) return Option.none();

      // Check the cached package directory for deno.json with axm field
      const pkgCacheDir = path.join(registryCacheDir, scope, pkg.purl.name);
      const pkgDirExists = yield* fs.exists(pkgCacheDir).pipe(Effect.option);
      if (Option.isNone(pkgDirExists) || !pkgDirExists.value) return Option.none();

      // Scan version directories for deno.json with axm field
      const versionDirs = yield* fs.readDirectory(pkgCacheDir).pipe(Effect.option);
      if (Option.isNone(versionDirs)) return Option.none();

      for (const versionDir of versionDirs.value) {
        const denoJsonPath = path.join(pkgCacheDir, versionDir, "deno.json");
        const content = yield* readFileOptional(denoJsonPath);
        if (Option.isNone(content)) continue;

        const parsed = yield* parseJsonOptional(
          content.value,
          `${scope}/${pkg.purl.name}/deno.json`,
        );
        if (Option.isNone(parsed)) continue;

        // Extract and validate the "axm" field
        const axmContainerResult = decodeAxmContainer(parsed.value);
        if (Result.isFailure(axmContainerResult)) continue;

        const axmRaw = axmContainerResult.success.axm;
        if (axmRaw === undefined) continue;

        const metaResult = decodeAxmMeta(axmRaw);
        if (Result.isFailure(metaResult)) {
          yield* Effect.logWarning(
            `Invalid axm metadata in deno cache for ${scope}/${pkg.purl.name}: schema validation failed`,
          );
          continue;
        }

        return Option.some(metaResult.success.extensions);
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "deno" }),
    Effect.withSpan("read.deno"),
  ),
};
