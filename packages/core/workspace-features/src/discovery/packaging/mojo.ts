/**
 * Mojo package detector and reader for package-compatibility discovery.
 *
 * Parses `pixi.toml` for dependencies and reads
 * agentExtensions metadata from pixi environment cache at `.pixi/envs/`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import {
  parseJsonOptional,
  preparedReader,
  readAgentExtensions,
  readFileOptional,
  sharedListing,
  sharedPerKey,
} from "./reader-io.js";
import { parseTomlDocument, tomlStringEntries, tomlTable } from "./toml.js";
import { makeDetectedPackage } from "./detected-package.js";
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
 * Read the string-valued `[dependencies]` entries of a pixi.toml document.
 * Returns an array of { name, version } entries.
 */
const parseTomlDependencies = (
  content: string,
): ReadonlyArray<{ readonly name: string; readonly version: string }> =>
  tomlStringEntries(tomlTable(parseTomlDocument(content), "dependencies")).map(
    ({ key, value }) => ({ name: key, version: value }),
  );

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
          const detected = makeDetectedPackage({
            type: mojoType,
            name: dep.name,
            version,
            source: pixiPath,
          });
          if (Option.isSome(detected)) results.push(detected.value);
        } else {
          const detected = makeDetectedPackage({
            type: condaType,
            name: dep.name,
            version,
            source: pixiPath,
          });
          if (Option.isSome(detected)) results.push(detected.value);
        }
      }

      return results;
    },
    Effect.annotateLogs({ detector: "mojo" }),
    Effect.withSpan("detect.mojo"),
  ),
};

/** The entries of a directory that can be listed, otherwise `none`, absence included. */
const listDirectory = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(directory).pipe(Effect.option);
    return Option.map(entries, sharedListing);
  });

/**
 * Mojo package reader.
 *
 * Reads `agent-extensions.json` sidecar files from `.pixi/envs/<env>/conda-meta/`
 * in the project directory for each detected Mojo/conda package. Packages of
 * one read share the environment and `conda-meta` listings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const mojoReader: PackageReader = preparedReader(
  mojoType,
  Effect.gen(function* () {
    const listing = yield* sharedPerKey(listDirectory);
    return Effect.fn("read.mojo")(
      function* (pkg: DetectedPackage) {
        const path = yield* Path.Path;

        // Derive project directory from the source manifest path
        const projectDir = path.dirname(pkg.source);

        const pixiEnvsDir = path.join(projectDir, ".pixi", "envs");

        // Scan environment directories of an existing .pixi/envs
        const envDirs = yield* listing(pixiEnvsDir);
        if (Option.isNone(envDirs)) return Option.none();

        for (const envDir of envDirs.value) {
          const condaMetaDir = path.join(pixiEnvsDir, envDir, "conda-meta");

          // Scan for package directories matching the package name
          const metaEntries = yield* listing(condaMetaDir);
          if (Option.isNone(metaEntries)) continue;

          for (const entry of metaEntries.value) {
            // Match entries that start with the package name
            if (!entry.startsWith(pkg.purl.name)) continue;

            const agentExtensionsJsonPath = path.join(condaMetaDir, entry, "agent-extensions.json");
            const content = yield* readFileOptional(agentExtensionsJsonPath);
            if (Option.isNone(content)) continue;

            const parsed = yield* parseJsonOptional(
              content.value,
              `${pkg.purl.name}/agent-extensions.json`,
            );
            if (Option.isNone(parsed)) continue;

            const recommendations = yield* readAgentExtensions(
              parsed.value,
              `pixi cache for ${pkg.purl.name}`,
            );
            if (Option.isSome(recommendations)) return recommendations;
          }
        }

        return Option.none();
      },
      Effect.annotateLogs({ reader: "mojo" }),
      Effect.withSpan("read.mojo"),
    );
  }),
);
