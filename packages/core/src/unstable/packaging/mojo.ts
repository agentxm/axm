/**
 * Mojo package detector and reader for package-compatibility discovery.
 *
 * Parses `pixi.toml` for dependencies and reads
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
import { parseTomlStringEntries, readTomlSection } from "../toml/index.js";
import { PackageTypeSchema } from "./package-type.js";
import { decodeAxmMeta, decodePurl, parseJsonOptional, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const mojoType = Schema.decodeUnknownSync(PackageTypeSchema)("mojo");
const condaType = Schema.decodeUnknownSync(PackageTypeSchema)("conda");

/**
 * Known Mojo-specific packages that should produce pkg:mojo purls
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
  const depsBlock = readTomlSection(content, "dependencies");
  if (depsBlock === undefined) return [];

  return parseTomlStringEntries(depsBlock).map(({ key, value }) => ({ name: key, version: value }));
};

/**
 * Mojo package detector.
 *
 * Scans `pixi.toml` in the project directory. Mojo-specific packages produce `pkg:mojo`
 * purls, while conda packages produce `pkg:conda` purls.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const mojoDetector: PackageDetector = {
  type: mojoType,
  detect: Effect.fn("detect.mojo")(
    function* (projectDir: string) {
      const path = yield* Path.Path;

      const pixiPath = path.join(projectDir, "pixi.toml");
      const content = yield* readFileOptional(pixiPath);

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
          const purl = new PackageURL("mojo", null, dep.name, version ?? null, null, null);
          const purlParts = decodePurl(purl.toString());
          results.push({ purl: purlParts, type: mojoType, source: pixiPath });
        } else {
          const purl = new PackageURL("conda", null, dep.name, version ?? null, null, null);
          const purlParts = decodePurl(purl.toString());
          results.push({ purl: purlParts, type: condaType, source: pixiPath });
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
