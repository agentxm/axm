/**
 * Mojo package detector and reader for package-compatibility discovery.
 *
 * Parses `pixi.toml` and `mojoproject.toml` for dependencies and reads
 * axm metadata from pixi environment cache at `.pixi/envs/`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

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

const mojoType = Schema.decodeUnknownSync(PackageTypeSchema)("generic");
const condaType = Schema.decodeUnknownSync(PackageTypeSchema)("conda");
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
 * Known Mojo-specific packages that should produce pkg:generic/mojo purls
 * rather than pkg:conda purls.
 */
const MOJO_SPECIFIC_PACKAGES = new Set([
  "max",
  "mojo",
  "modular",
  "mojo-stdlib",
  "max-engine",
  "max-graph",
  "max-serving",
]);

/**
 * Returns true if the specifier is an exact version (no range operators).
 */
const isExactVersion = (specifier: string): boolean =>
  /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9._+-]*)?$/.test(specifier);

/**
 * Parse a TOML [dependencies] section using simple regex.
 * Returns an array of { name, version } entries.
 */
const parseTomlDependencies = (
  content: string,
): ReadonlyArray<{ readonly name: string; readonly version: string }> => {
  // Find the [dependencies] section
  const depsMatch = /\[dependencies\]\s*\n([\s\S]*?)(?:\n\[|\n*$)/.exec(content);
  if (depsMatch === null || depsMatch[1] === undefined) return [];

  const depsBlock = depsMatch[1];
  const results: Array<{ readonly name: string; readonly version: string }> = [];

  // Match key = "value" or key = "value" patterns
  const linePattern = /^([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"$/gm;
  let match = linePattern.exec(depsBlock);
  while (match !== null) {
    if (match[1] !== undefined && match[2] !== undefined) {
      results.push({ name: match[1], version: match[2] });
    }
    match = linePattern.exec(depsBlock);
  }

  return results;
};

/**
 * Mojo package detector.
 *
 * Scans `pixi.toml` (preferred) and `mojoproject.toml` (deprecated fallback)
 * in the project directory. Mojo-specific packages produce `pkg:generic/mojo`
 * purls, while conda packages produce `pkg:conda` purls.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const mojoDetector: PackageDetector = {
  type: mojoType,
  detect: Effect.fn("detect.mojo")(
    function* (projectDir: string) {
      const path = yield* Path.Path;

      // pixi.toml takes precedence over mojoproject.toml
      const pixiPath = path.join(projectDir, "pixi.toml");
      const mojoPath = path.join(projectDir, "mojoproject.toml");

      let content = yield* readFileOptional(pixiPath);
      let source = pixiPath;

      if (Option.isNone(content)) {
        content = yield* readFileOptional(mojoPath);
        source = mojoPath;
      }

      if (Option.isNone(content)) return [];

      const deps = parseTomlDependencies(content.value);
      if (deps.length === 0) {
        // Check for malformed TOML if the file is non-trivial
        if (content.value.includes("[dependencies]")) {
          // Has section header but we couldn't parse any deps - might be valid (empty deps)
          return [];
        }
        // File exists but no [dependencies] section
        return [];
      }

      const results: Array<DetectedPackage> = [];

      for (const dep of deps) {
        const isMojoSpecific = MOJO_SPECIFIC_PACKAGES.has(dep.name);
        const version = isExactVersion(dep.version) ? dep.version : undefined;

        if (isMojoSpecific) {
          const purl = new PackageURL("generic", "mojo", dep.name, version ?? null, null, null);
          const purlParts = decodePurl(purl.toString());
          results.push({ purl: purlParts, type: mojoType, source });
        } else {
          const purl = new PackageURL("conda", null, dep.name, version ?? null, null, null);
          const purlParts = decodePurl(purl.toString());
          results.push({ purl: purlParts, type: condaType, source });
        }
      }

      return results;
    },
    Effect.annotateLogs({ detector: "mojo" }),
    Effect.withSpan("detect.mojo"),
  ),
};

/**
 * Mojo package reader.
 *
 * Reads `axm.json` sidecar files from `.pixi/envs/<env>/conda-meta/`
 * in the project directory for each detected Mojo/conda package.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const mojoReader: PackageReader = {
  type: mojoType,
  read: Effect.fn("read.mojo")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      // Derive project directory from the source manifest path
      const projectDir = path.dirname(pkg.source);

      const pixiEnvsDir = path.join(projectDir, ".pixi", "envs");

      // Check if .pixi/envs exists
      const envsDirExists = yield* fs.exists(pixiEnvsDir).pipe(Effect.option);
      if (Option.isNone(envsDirExists) || !envsDirExists.value) return Option.none();

      // Scan environment directories
      const envDirs = yield* fs.readDirectory(pixiEnvsDir).pipe(Effect.option);
      if (Option.isNone(envDirs)) return Option.none();

      for (const envDir of envDirs.value) {
        const condaMetaDir = path.join(pixiEnvsDir, envDir, "conda-meta");
        const condaMetaExists = yield* fs.exists(condaMetaDir).pipe(Effect.option);
        if (Option.isNone(condaMetaExists) || !condaMetaExists.value) continue;

        // Scan for package directories matching the package name
        const metaEntries = yield* fs.readDirectory(condaMetaDir).pipe(Effect.option);
        if (Option.isNone(metaEntries)) continue;

        for (const entry of metaEntries.value) {
          // Match entries that start with the package name
          if (!entry.startsWith(pkg.purl.name)) continue;

          const axmJsonPath = path.join(condaMetaDir, entry, "axm.json");
          const content = yield* readFileOptional(axmJsonPath);
          if (Option.isNone(content)) continue;

          const parsed = yield* parseJsonOptional(content.value, `${pkg.purl.name}/axm.json`);
          if (Option.isNone(parsed)) continue;

          const metaResult = decodeAxmMeta(parsed.value);
          if (Result.isFailure(metaResult)) {
            yield* Effect.logWarning(
              `Invalid axm metadata in pixi cache for ${pkg.purl.name}: schema validation failed`,
            );
            continue;
          }

          return Option.some(metaResult.success.extensions);
        }
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "mojo" }),
    Effect.withSpan("read.mojo"),
  ),
};
