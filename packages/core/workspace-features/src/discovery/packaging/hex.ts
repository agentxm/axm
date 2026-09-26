/**
 * Hex package detector and reader for package-compatibility discovery.
 *
 * Supports both Elixir (mix.exs) and Gleam (gleam.toml) projects.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAgentExtensions, parseJsonOptional, readFileOptional } from "./reader-io.js";
import { parseTomlDocument, tomlStringEntries, tomlTable } from "./toml.js";
import { makeDetectedPackage } from "./detected-package.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const hexType = Schema.decodeUnknownSync(PackageTypeSchema)("hex");

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

    const detected = makeDetectedPackage({ type: hexType, name, version, source });
    if (Option.isSome(detected)) results.push(detected.value);
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

  for (const { key: name, value: versionSpec } of tomlStringEntries(
    tomlTable(parseTomlDocument(content), sectionName),
  )) {
    const version = isExactVersion(versionSpec) ? versionSpec : undefined;

    const detected = makeDetectedPackage({ type: hexType, name, version, source });
    if (Option.isSome(detected)) results.push(detected.value);
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
 * Parse Erlang term format hex_metadata.config to extract the portable field.
 *
 * Erlang binary strings use `<<"...">>` delimiters. The `agentExtensions` value is a JSON
 * string embedded as an Erlang binary, potentially with escaped quotes inside.
 */
const parseHexMetadataExtra = (content: string): unknown | undefined => {
  const match = /<<"agentExtensions">>,\s*<<"((?:[^"\\]|\\.)*)">>/m.exec(content);
  if (match?.[1] !== undefined) {
    // Unescape any escaped quotes from the Erlang binary string encoding
    const jsonStr = match[1].replace(/\\"/g, '"');
    try {
      const parsed: unknown = JSON.parse(jsonStr);
      return { agentExtensions: parsed };
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
 * Reads `deps/<package-name>/agent-extensions.json` as the primary source, falling back to
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

      // Try agent-extensions.json sidecar first
      const agentExtensionsJsonPath = path.join(
        projectDir,
        "deps",
        pkgName,
        "agent-extensions.json",
      );
      const agentExtensionsContent = yield* readFileOptional(agentExtensionsJsonPath);

      if (Option.isSome(agentExtensionsContent)) {
        const parsed = yield* parseJsonOptional(
          agentExtensionsContent.value,
          `${pkgName}/agent-extensions.json`,
        );
        if (Option.isSome(parsed)) {
          const metaResult = yield* decodeAgentExtensions(parsed.value);
          if (Result.isFailure(metaResult)) {
            yield* Effect.logWarning(
              `Invalid agentExtensions metadata in ${pkgName}/agent-extensions.json: schema validation failed`,
            );
            return Option.none();
          }
          return Option.some(metaResult.success.agentExtensions);
        }
      }

      // Fall back to hex_metadata.config
      const hexMetaPath = path.join(projectDir, "deps", pkgName, "hex_metadata.config");
      const hexMetaContent = yield* readFileOptional(hexMetaPath);

      if (Option.isSome(hexMetaContent)) {
        const axmData = parseHexMetadataExtra(hexMetaContent.value);
        if (axmData !== undefined) {
          const metaResult = yield* decodeAgentExtensions(axmData);
          if (Result.isFailure(metaResult)) {
            yield* Effect.logWarning(
              `Invalid agentExtensions metadata in ${pkgName}/hex_metadata.config: schema validation failed`,
            );
            return Option.none();
          }
          return Option.some(metaResult.success.agentExtensions);
        }
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "hex" }),
    Effect.withSpan("read.hex"),
  ),
};
