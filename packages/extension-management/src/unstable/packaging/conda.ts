/**
 * Conda package detector and reader for package-compatibility discovery.
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
import { envOption } from "../utils/environment.js";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAxmMeta, decodePurl, parseJsonOptional, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const condaType = Schema.decodeUnknownSync(PackageTypeSchema)("conda");
const pypiType = Schema.decodeUnknownSync(PackageTypeSchema)("pypi");

/**
 * Parse a conda dependency string like "numpy=1.24.0=py311h..." or "numpy >=1.24".
 *
 * Returns name, version (exact only), and optional channel.
 */
const parseCondaDep = (
  dep: string,
):
  | {
      readonly name: string;
      readonly version: string | undefined;
      readonly channel: string | undefined;
    }
  | undefined => {
  const trimmed = dep.trim();
  if (trimmed.length === 0) return undefined;

  // Check for channel prefix: conda-forge::numpy=1.24.0
  let channel: string | undefined;
  let rest: string;
  const channelIdx = trimmed.indexOf("::");
  if (channelIdx > 0) {
    channel = trimmed.slice(0, channelIdx);
    rest = trimmed.slice(channelIdx + 2);
  } else {
    channel = undefined;
    rest = trimmed;
  }

  // Check for range operators - produce versionless purl
  if (
    rest.includes(">=") ||
    rest.includes("<=") ||
    rest.includes(">") ||
    rest.includes("<") ||
    rest.includes("!=")
  ) {
    // Extract just the name
    const name = rest.split(/[><=!]/)[0]?.trim();
    if (name === undefined || name.length === 0) return undefined;
    return { name, version: undefined, channel };
  }

  // Parse name=version=build or name=version or name
  const parts = rest.split("=");
  const name = parts[0]?.trim();
  if (name === undefined || name.length === 0) return undefined;

  const version = parts[1]?.trim();
  if (version === undefined || version.length === 0) {
    return { name, version: undefined, channel };
  }

  return { name, version, channel };
};

/**
 * Parse a pip dependency string like "requests==2.31.0" or "flask>=2.0".
 *
 * Returns name and version (exact == only).
 */
const parsePipDep = (
  dep: string,
): { readonly name: string; readonly version: string | undefined } | undefined => {
  const trimmed = dep.trim();
  if (trimmed.length === 0) return undefined;

  // Check for exact version pin: ==
  const eqIdx = trimmed.indexOf("==");
  if (eqIdx > 0) {
    const name = trimmed.slice(0, eqIdx).trim();
    const version = trimmed.slice(eqIdx + 2).trim();
    if (name.length === 0) return undefined;
    // Normalize Python package name: lowercase, replace _ and . with -
    const normalizedName = name.toLowerCase().replace(/[_.]/g, "-");
    return { name: normalizedName, version: version.length > 0 ? version : undefined };
  }

  // Range specifiers: >=, <=, !=, ~=, >, <
  const rangeMatch = /^([a-zA-Z0-9._-]+)/.exec(trimmed);
  if (rangeMatch !== null && rangeMatch[1] !== undefined) {
    const normalizedName = rangeMatch[1].toLowerCase().replace(/[_.]/g, "-");
    return { name: normalizedName, version: undefined };
  }

  return undefined;
};

/**
 * Parse environment.yml content using line-based parsing.
 * Extracts conda dependencies and pip sub-list items.
 */
const parseEnvironmentYml = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];
  let inDependencies = false;
  let inPipSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;

    // Top-level section detection
    if (indent === 0 && trimmed.length > 0) {
      if (trimmed === "dependencies:") {
        inDependencies = true;
        inPipSection = false;
        continue;
      }
      if (trimmed.endsWith(":") || trimmed.includes(":")) {
        inDependencies = false;
        inPipSection = false;
        continue;
      }
    }

    if (!inDependencies) continue;
    if (trimmed.length === 0) continue;

    // Detect pip: sub-section
    if (trimmed === "- pip:" || trimmed === "pip:") {
      inPipSection = true;
      continue;
    }

    // pip sub-list items are more deeply indented
    if (inPipSection) {
      if (trimmed.startsWith("- ")) {
        const dep = trimmed.slice(2).trim();
        const parsed = parsePipDep(dep);
        if (parsed !== undefined) {
          const purl = new PackageURL(
            "pypi",
            null,
            parsed.name,
            parsed.version ?? null,
            null,
            null,
          );
          const purlParts = decodePurl(purl.toString());
          results.push({ purl: purlParts, type: pypiType, source });
        }
        continue;
      }
      // Non-list item after pip section means pip section ended
      if (!trimmed.startsWith("-")) {
        inPipSection = false;
      }
    }

    // Regular conda dependency
    if (!inPipSection && trimmed.startsWith("- ")) {
      const dep = trimmed.slice(2).trim();

      // Skip if it's a map item (pip: or other structured entries)
      if (dep.endsWith(":") || dep.includes(": ")) continue;

      const parsed = parseCondaDep(dep);
      if (parsed !== undefined) {
        const qualifiers = parsed.channel !== undefined ? { channel: parsed.channel } : null;
        const purl = new PackageURL(
          "conda",
          null,
          parsed.name,
          parsed.version ?? null,
          qualifiers,
          null,
        );
        const purlParts = decodePurl(purl.toString());
        results.push({ purl: purlParts, type: condaType, source });
      }
    }
  }

  return results;
};

/**
 * Parse meta.yaml content using line-based parsing.
 * Extracts dependencies from `requirements.host` and `requirements.run` lists.
 */
const parseMetaYaml = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];
  let inRequirements = false;
  let inSubSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;

    // Top-level section detection
    if (indent === 0 && trimmed.length > 0) {
      if (trimmed === "requirements:") {
        inRequirements = true;
        inSubSection = false;
        continue;
      }
      if (trimmed.endsWith(":") || trimmed.includes(":")) {
        inRequirements = false;
        inSubSection = false;
        continue;
      }
    }

    if (!inRequirements) continue;
    if (trimmed.length === 0) continue;

    // Detect host: or run: sub-sections
    if ((trimmed === "host:" || trimmed === "run:") && indent > 0) {
      inSubSection = true;
      continue;
    }

    // Other sub-sections like build:
    if (trimmed.endsWith(":") && indent > 0 && !trimmed.startsWith("-")) {
      if (trimmed === "build:") {
        inSubSection = false;
        continue;
      }
      inSubSection = true;
      continue;
    }

    // List items in host: or run: sections
    if (inSubSection && trimmed.startsWith("- ")) {
      const dep = trimmed.slice(2).trim();
      const parsed = parseCondaDep(dep);
      if (parsed !== undefined) {
        const purl = new PackageURL("conda", null, parsed.name, parsed.version ?? null, null, null);
        const purlParts = decodePurl(purl.toString());
        results.push({ purl: purlParts, type: condaType, source });
      }
    }
  }

  return results;
};

/**
 * Conda package detector.
 *
 * Scans `environment.yml` and `meta.yaml` in the project directory
 * for conda dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const condaDetector: PackageDetector = {
  type: condaType,
  detect: Effect.fn("detect.conda")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const results: Array<DetectedPackage> = [];

      // Parse environment.yml
      const envYmlPath = path.join(projectDir, "environment.yml");
      const envYmlContent = yield* readFileOptional(envYmlPath);
      if (Option.isSome(envYmlContent)) {
        const deps = parseEnvironmentYml(envYmlContent.value, envYmlPath);
        results.push(...deps);
      }

      // Parse meta.yaml
      const metaYamlPath = path.join(projectDir, "meta.yaml");
      const metaYamlContent = yield* readFileOptional(metaYamlPath);
      if (Option.isSome(metaYamlContent)) {
        const deps = parseMetaYaml(metaYamlContent.value, metaYamlPath);
        results.push(...deps);
      }

      return results;
    },
    Effect.annotateLogs({ detector: "conda" }),
    Effect.withSpan("detect.conda"),
  ),
};

/**
 * Schema to extract the optional extra.axm field from about.json.
 */
const AboutJsonSchema = Schema.Struct({
  extra: Schema.optional(
    Schema.Struct({
      axm: Schema.optional(Schema.Unknown),
    }),
  ),
});
const decodeAboutJson = Schema.decodeUnknownResult(AboutJsonSchema);

/**
 * Conda package reader.
 *
 * Reads `$CONDA_PREFIX/share/axm/<package>/axm.json` as primary source,
 * falling back to package cache `info/about.json` with `extra.axm` key.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const condaReader: PackageReader = {
  type: condaType,
  read: Effect.fn("read.conda")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      const condaPrefix = yield* envOption("CONDA_PREFIX");
      if (Option.isNone(condaPrefix)) return Option.none();

      const pkgName = pkg.purl.name;

      // Primary: $CONDA_PREFIX/share/axm/<package>/axm.json
      const axmJsonPath = path.join(condaPrefix.value, "share", "axm", pkgName, "axm.json");
      const primaryContent = yield* readFileOptional(axmJsonPath);

      if (Option.isSome(primaryContent)) {
        const parsed = yield* parseJsonOptional(
          primaryContent.value,
          `conda share/axm/${pkgName}/axm.json`,
        );
        if (Option.isSome(parsed)) {
          const metaResult = decodeAxmMeta(parsed.value);
          if (Result.isFailure(metaResult)) {
            yield* Effect.logWarning(
              `Invalid axm metadata in conda ${pkgName}: schema validation failed`,
            );
            return Option.none();
          }
          return Option.some(metaResult.success.extensions);
        }
      }

      // Fallback: $CONDA_PREFIX/pkgs/<package>*/info/about.json
      const fs = yield* FileSystem.FileSystem;
      const pkgsDir = path.join(condaPrefix.value, "pkgs");
      const pkgsDirEntries = yield* fs.readDirectory(pkgsDir).pipe(Effect.option);

      if (Option.isSome(pkgsDirEntries)) {
        // Find the first matching package directory
        const matchingDir = pkgsDirEntries.value.find((entry) => entry.startsWith(`${pkgName}-`));

        if (matchingDir !== undefined) {
          const aboutJsonPath = path.join(pkgsDir, matchingDir, "info", "about.json");
          const aboutContent = yield* readFileOptional(aboutJsonPath);

          if (Option.isSome(aboutContent)) {
            const parsed = yield* parseJsonOptional(
              aboutContent.value,
              `conda ${matchingDir}/info/about.json`,
            );
            if (Option.isSome(parsed)) {
              const aboutResult = decodeAboutJson(parsed.value);
              if (Result.isSuccess(aboutResult)) {
                const axmRaw = aboutResult.success.extra?.axm;
                if (axmRaw !== undefined) {
                  const metaResult = decodeAxmMeta(axmRaw);
                  if (Result.isFailure(metaResult)) {
                    yield* Effect.logWarning(
                      `Invalid axm metadata in conda cache ${pkgName}: schema validation failed`,
                    );
                    return Option.none();
                  }
                  return Option.some(metaResult.success.extensions);
                }
              }
            }
          }
        }
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "conda" }),
    Effect.withSpan("read.conda"),
  ),
};
