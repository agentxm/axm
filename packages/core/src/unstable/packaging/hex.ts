/**
 * Hex package detector and reader for package-compatibility discovery.
 *
 * Supports both Elixir (mix.exs) and Gleam (gleam.toml) projects.
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

const hexType = Schema.decodeUnknownSync(PackageTypeSchema)("hex");
const decodePurl = Schema.decodeUnknownSync(PackageUrlSchema);
const decodeAxmMeta = Schema.decodeUnknownResult(AxmPackageMetaSchema);

/**
 * Returns true if the specifier is an exact semver version (no range operators).
 */
const isExactVersion = (specifier: string): boolean =>
  /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9._+-]*)?$/.test(specifier);

/**
 * Regex to detect :path or :git options which indicate non-registry deps.
 */
const PATH_OR_GIT_REGEX = /(?:path|git):\s*"/;

/**
 * Parse mix.exs content and extract dependency tuples from the deps function.
 */
const parseMixExs = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  // Extract the full dep tuples to check for path/git options
  const fullTuples = new Map<string, string>();
  let fullMatch: RegExpExecArray | null;
  const fullRegex = /\{:(\w+)[^}]*\}/g;
  while ((fullMatch = fullRegex.exec(content)) !== null) {
    const name = fullMatch[1];
    if (name !== undefined) {
      fullTuples.set(name, fullMatch[0]);
    }
  }

  // Now extract deps with version strings
  let match: RegExpExecArray | null;
  const depRegex = /\{:(\w+),\s*"([^"]*)"/g;
  while ((match = depRegex.exec(content)) !== null) {
    const name = match[1];
    const versionSpec = match[2];
    if (name === undefined || versionSpec === undefined) continue;

    // Check if this dep has path: or git: options (skip if so)
    const fullTuple = fullTuples.get(name);
    if (fullTuple !== undefined && PATH_OR_GIT_REGEX.test(fullTuple)) continue;

    const version = isExactVersion(versionSpec) ? versionSpec : undefined;

    const purl = new PackageURL("hex", null, name, version ?? null, null, null);
    const purlParts = decodePurl(purl.toString());

    results.push({ purl: purlParts, type: hexType, source });
  }

  return results;
};

/**
 * Parse a TOML-like section for dependencies.
 * Handles simple `name = "version"` entries within a section block.
 */
const parseTomlDeps = (
  content: string,
  sectionName: string,
  source: string,
): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  // Find the section
  const sectionRegex = new RegExp(`\\[${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`);
  const sectionMatch = sectionRegex.exec(content);
  if (sectionMatch === null) return [];

  const sectionStart = sectionMatch.index + sectionMatch[0].length;

  // Find the next section (or end of content)
  const nextSectionMatch = /\n\[/.exec(content.slice(sectionStart));
  const sectionEnd =
    nextSectionMatch !== null ? sectionStart + nextSectionMatch.index : content.length;
  const sectionContent = content.slice(sectionStart, sectionEnd);

  // Parse key = "value" entries
  const entryRegex = /^(\w+)\s*=\s*"([^"]*)"/gm;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(sectionContent)) !== null) {
    const name = match[1];
    const versionSpec = match[2];
    if (name === undefined || versionSpec === undefined) continue;

    const version = isExactVersion(versionSpec) ? versionSpec : undefined;

    const purl = new PackageURL("hex", null, name, version ?? null, null, null);
    const purlParts = decodePurl(purl.toString());

    results.push({ purl: purlParts, type: hexType, source });
  }

  return results;
};

/**
 * Parse gleam.toml content and extract dependencies from [dependencies] and [dev-dependencies].
 */
const parseGleamToml = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const deps = parseTomlDeps(content, "dependencies", source);
  const devDeps = parseTomlDeps(content, "dev-dependencies", source);
  return [...deps, ...devDeps];
};

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
 * Parse Erlang term format hex_metadata.config to extract the extra.axm field.
 * This is a simplified parser that extracts the axm JSON from the extra field.
 *
 * Erlang binary strings use `<<"...">>` delimiters. The axm value is a JSON
 * string embedded as an Erlang binary, potentially with escaped quotes inside.
 */
const parseHexMetadataExtra = (content: string): unknown | undefined => {
  // Look for <<"axm">> key followed by its value in <<"...">> format
  // The value may contain escaped quotes within the Erlang binary string
  const axmMatch = /<<"axm">>,\s*<<"((?:[^"\\]|\\.)*)">>/m.exec(content);
  if (axmMatch?.[1] !== undefined) {
    // Unescape any escaped quotes from the Erlang binary string encoding
    const jsonStr = axmMatch[1].replace(/\\"/g, '"');
    try {
      const parsed: unknown = JSON.parse(jsonStr);
      return parsed;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

/**
 * Hex package detector.
 *
 * Scans `mix.exs` and `gleam.toml` in the project directory and extracts
 * dependencies from Elixir dependency tuples and Gleam TOML sections.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const hexDetector: PackageDetector = {
  type: hexType,
  detect: Effect.fn("detect.hex")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const results: Array<DetectedPackage> = [];

      // Try mix.exs (Elixir)
      const mixPath = path.join(projectDir, "mix.exs");
      const mixContent = yield* readFileOptional(mixPath);
      if (Option.isSome(mixContent)) {
        const mixDeps = parseMixExs(mixContent.value, mixPath);
        results.push(...mixDeps);
      }

      // Try gleam.toml (Gleam)
      const gleamPath = path.join(projectDir, "gleam.toml");
      const gleamContent = yield* readFileOptional(gleamPath);
      if (Option.isSome(gleamContent)) {
        const gleamDeps = parseGleamToml(gleamContent.value, gleamPath);
        results.push(...gleamDeps);
      }

      return results;
    },
    Effect.annotateLogs({ detector: "hex" }),
    Effect.withSpan("detect.hex"),
  ),
};

/**
 * Hex package reader.
 *
 * Reads `deps/<package-name>/axm.json` as the primary source, falling back to
 * parsing `hex_metadata.config` for each detected Hex package.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const hexReader: PackageReader = {
  type: hexType,
  read: Effect.fn("read.hex")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      // Derive project directory from the source manifest path
      const projectDir = path.dirname(pkg.source);

      const pkgName = pkg.purl.name;

      // Try axm.json sidecar first
      const axmJsonPath = path.join(projectDir, "deps", pkgName, "axm.json");
      const axmContent = yield* readFileOptional(axmJsonPath);

      if (Option.isSome(axmContent)) {
        const parsed = yield* parseJsonOptional(axmContent.value, `${pkgName}/axm.json`);
        if (Option.isSome(parsed)) {
          const metaResult = decodeAxmMeta(parsed.value);
          if (Result.isFailure(metaResult)) {
            yield* Effect.logWarning(
              `Invalid axm metadata in ${pkgName}/axm.json: schema validation failed`,
            );
            return Option.none();
          }
          return Option.some(metaResult.success.recommendedExtensions);
        }
      }

      // Fall back to hex_metadata.config
      const hexMetaPath = path.join(projectDir, "deps", pkgName, "hex_metadata.config");
      const hexMetaContent = yield* readFileOptional(hexMetaPath);

      if (Option.isSome(hexMetaContent)) {
        const axmData = parseHexMetadataExtra(hexMetaContent.value);
        if (axmData !== undefined) {
          const metaResult = decodeAxmMeta(axmData);
          if (Result.isFailure(metaResult)) {
            yield* Effect.logWarning(
              `Invalid axm metadata in ${pkgName}/hex_metadata.config: schema validation failed`,
            );
            return Option.none();
          }
          return Option.some(metaResult.success.recommendedExtensions);
        }
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "hex" }),
    Effect.withSpan("read.hex"),
  ),
};
