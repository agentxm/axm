/**
 * Ruby gem package detector and reader for package-compatibility discovery.
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
import { envWithDefault } from "../utils/environment.js";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAxmMeta, decodePurl, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const gemType = Schema.decodeUnknownSync(PackageTypeSchema)("gem");

/** Range operators that indicate non-exact version constraints. */
const RANGE_OPERATORS = ["~>", ">=", "<=", ">", "<", "!="] as const;

/**
 * Returns true if the version specifier is an exact version (no range operators).
 * Exact versions are bare numeric strings like "5.6.7".
 */
const isExactVersion = (specifier: string): boolean => {
  const trimmed = specifier.trim();
  if (RANGE_OPERATORS.some((op) => trimmed.startsWith(op))) return false;
  return /^\d+(\.\d+)*$/.test(trimmed);
};

/**
 * Regex to match `gem 'name'` or `gem "name"` directives in a Gemfile.
 * Captures: gem name, optional version string, optional options.
 */
const GEMFILE_GEM_RE = /^\s*gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?(?:,\s*(.*))?$/;

/** Patterns for path/git/github options that indicate non-registry sources. */
const SKIP_OPTIONS_RE = /\b(?:path|git|github)\s*:/;

/**
 * Parse a Gemfile line into a gem name and optional version, or undefined if skipped.
 */
const parseGemfileLine = (line: string, source: string): DetectedPackage | undefined => {
  const match = GEMFILE_GEM_RE.exec(line);
  if (match === null) return undefined;

  const name = match[1];
  const versionStr = match[2];
  const options = match[3];

  if (name === undefined) return undefined;

  // Check for path/git/github options - skip non-registry sources
  if (options !== undefined && SKIP_OPTIONS_RE.test(options)) return undefined;

  // Also check the full line for options that might come after the version
  const afterName = line.slice(line.indexOf(name) + name.length);
  if (SKIP_OPTIONS_RE.test(afterName)) return undefined;

  const version = versionStr !== undefined && isExactVersion(versionStr) ? versionStr : undefined;

  const purl = new PackageURL("gem", null, name, version ?? null, null, null);
  const purlParts = decodePurl(purl.toString());

  return { purl: purlParts, type: gemType, source };
};

/**
 * Parse Gemfile content and extract gem dependencies.
 */
const parseGemfile = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const detected = parseGemfileLine(trimmed, source);
    if (detected !== undefined) results.push(detected);
  }

  return results;
};

/**
 * Regex to match add_dependency, add_runtime_dependency, add_development_dependency
 * in gemspec files.
 */
const GEMSPEC_DEP_RE =
  /\.\s*add_(?:runtime_|development_)?dependency\s*\(?\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?/;

/**
 * Parse a gemspec file and extract dependency declarations.
 */
const parseGemspec = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];

  for (const line of lines) {
    const match = GEMSPEC_DEP_RE.exec(line);
    if (match === null) continue;

    const name = match[1];
    if (name === undefined) continue;

    const versionStr = match[2];
    const version = versionStr !== undefined && isExactVersion(versionStr) ? versionStr : undefined;

    const purl = new PackageURL("gem", null, name, version ?? null, null, null);
    const purlParts = decodePurl(purl.toString());

    results.push({ purl: purlParts, type: gemType, source });
  }

  return results;
};

/**
 * Gem package detector.
 *
 * Scans `Gemfile` and `*.gemspec` files in the project directory and extracts
 * gem dependencies. Deduplicates gems that appear in both sources.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const gemDetector: PackageDetector = {
  type: gemType,
  detect: Effect.fn("detect.gem")(
    function* (projectDir: string) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const results: Array<DetectedPackage> = [];
      const seen = new Set<string>();

      const addUnique = (deps: ReadonlyArray<DetectedPackage>): void => {
        for (const dep of deps) {
          const key = dep.purl.name;
          if (!seen.has(key)) {
            seen.add(key);
            results.push(dep);
          }
        }
      };

      // Parse Gemfile
      const gemfilePath = path.join(projectDir, "Gemfile");
      const gemfileContent = yield* readFileOptional(gemfilePath);
      if (Option.isSome(gemfileContent)) {
        const deps = parseGemfile(gemfileContent.value, gemfilePath);
        addUnique(deps);
      }

      // Parse *.gemspec files
      const dirEntries = yield* fs.readDirectory(projectDir).pipe(Effect.option);
      if (Option.isSome(dirEntries)) {
        for (const entry of dirEntries.value) {
          if (entry.endsWith(".gemspec")) {
            const gemspecPath = path.join(projectDir, entry);
            const gemspecContent = yield* readFileOptional(gemspecPath);
            if (Option.isSome(gemspecContent)) {
              const deps = parseGemspec(gemspecContent.value, gemspecPath);
              addUnique(deps);
            }
          }
        }
      }

      return results;
    },
    Effect.annotateLogs({ detector: "gem" }),
    Effect.withSpan("detect.gem"),
  ),
};

/**
 * Resolve the GEM_HOME or default gem installation directory.
 * Uses GEM_HOME env var, falling back to the default Ruby gems directory.
 */
const resolveGemDir = () => envWithDefault("GEM_HOME", `${os.homedir()}/.gem/ruby`);

/**
 * Parse the `axm_extensions` value from a gemspec metadata string.
 * The value format is a JSON-stringified array of extension declaration objects.
 */
const parseAxmMetadataFromGemspec = (content: string): unknown | undefined => {
  const match = /"axm_extensions"\s*=>\s*"((?:\\.|[^"\\])*)"/.exec(content);
  if (match === null || match[1] === undefined) return undefined;

  const rawValue = match[1];

  try {
    const decodedValue: unknown = JSON.parse(`"${rawValue}"`);
    if (typeof decodedValue !== "string") return undefined;

    return { extensions: JSON.parse(decodedValue) };
  } catch {
    return undefined;
  }
};

/**
 * Gem package reader.
 *
 * Reads gemspec metadata from `<gem-dir>/specifications/<gem>.gemspec`
 * and extracts `axm_`-prefixed metadata keys.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const gemReader: PackageReader = {
  type: gemType,
  read: Effect.fn("read.gem")(
    function* (pkg: DetectedPackage) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const gemDir = yield* resolveGemDir();
      const gemName = pkg.purl.name;
      const version = pkg.purl.version;

      // Try to find the gemspec in the specifications directory.
      // Gemspec filename format: <name>-<version>.gemspec
      const specsDir = path.join(gemDir, "specifications");

      // If no version, try to find any matching gemspec
      if (version !== undefined) {
        const gemspecPath = path.join(specsDir, `${gemName}-${version}.gemspec`);
        const content = yield* readFileOptional(gemspecPath);
        if (Option.isNone(content)) return Option.none();

        const axmMeta = parseAxmMetadataFromGemspec(content.value);
        if (axmMeta === undefined) return Option.none();

        const metaResult = decodeAxmMeta(axmMeta);
        if (Result.isFailure(metaResult)) {
          yield* Effect.logWarning(
            `Invalid axm metadata in ${gemName}-${version}: schema validation failed`,
          );
          return Option.none();
        }

        return Option.some(metaResult.success.extensions);
      }

      // No version - scan specs directory for matching gemspec
      const dirEntries = yield* fs.readDirectory(specsDir).pipe(Effect.option);
      if (Option.isNone(dirEntries)) return Option.none();

      const matchingSpec = dirEntries.value.find(
        (entry) => entry.startsWith(`${gemName}-`) && entry.endsWith(".gemspec"),
      );
      if (matchingSpec === undefined) return Option.none();

      const gemspecPath = path.join(specsDir, matchingSpec);
      const content = yield* readFileOptional(gemspecPath);
      if (Option.isNone(content)) return Option.none();

      const axmMeta = parseAxmMetadataFromGemspec(content.value);
      if (axmMeta === undefined) return Option.none();

      const metaResult = decodeAxmMeta(axmMeta);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(`Invalid axm metadata in ${gemName}: schema validation failed`);
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "gem" }),
    Effect.withSpan("read.gem"),
  ),
};
