/**
 * Cargo (Rust) package detector and reader for package-compatibility discovery.
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
import { AxmPackageMetaSchema } from "./axm-package-meta.js";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlSchema } from "./package-url.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const cargoType = Schema.decodeUnknownSync(PackageTypeSchema)("cargo");
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
 * Returns true if the version specifier is an exact pin (starts with `=`).
 * In Cargo, `=1.0.193` means exact; bare `1.0` is a caret range.
 */
const isExactVersion = (specifier: string): boolean => specifier.startsWith("=");

/**
 * Strip leading `=` from an exact version pin.
 */
const stripExactPrefix = (specifier: string): string =>
  specifier.startsWith("=") ? specifier.slice(1) : specifier;

/** Regex to detect section headers like [dependencies] or [build-dependencies]. */
const SECTION_RE = /^\[([^\]]+)\]/;

/** Dependency section names we care about. */
const DEP_SECTIONS = new Set(["dependencies", "dev-dependencies", "build-dependencies"]);

/**
 * Represents a parsed dependency entry from Cargo.toml.
 */
interface CargoDep {
  readonly name: string;
  readonly version: string | undefined;
  readonly isPathOrGit: boolean;
  /** Real package name when `package` key is used for renaming. */
  readonly packageName: string | undefined;
}

/**
 * Parse a dependency value (the right-hand side of `name = ...`).
 * Handles:
 * - Shorthand string: `"1.0"` or `"=1.0.193"`
 * - Inline table: `{ version = "1.0", features = ["derive"] }`
 */
const parseDependencyValue = (name: string, value: string): CargoDep => {
  const trimmed = value.trim();

  // Shorthand string syntax: name = "1.0"
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const inner = trimmed.slice(1, -1);
    return { name, version: inner, isPathOrGit: false, packageName: undefined };
  }

  // Inline table syntax: name = { version = "1.0", ... }
  if (trimmed.startsWith("{")) {
    const hasPath = /\bpath\s*=/.test(trimmed);
    const hasGit = /\bgit\s*=/.test(trimmed);

    if (hasPath || hasGit) {
      return { name, version: undefined, isPathOrGit: true, packageName: undefined };
    }

    // Extract version
    const versionMatch = /\bversion\s*=\s*"([^"]*)"/.exec(trimmed);
    const version = versionMatch?.[1];

    // Extract package rename
    const packageMatch = /\bpackage\s*=\s*"([^"]*)"/.exec(trimmed);
    const packageName = packageMatch?.[1];

    return { name, version, isPathOrGit: false, packageName };
  }

  // Unknown format, skip
  return { name, version: undefined, isPathOrGit: false, packageName: undefined };
};

/**
 * Parse Cargo.toml content and extract dependencies.
 */
const parseCargoToml = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];
  let currentSection = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // Check for section header
    const sectionMatch = SECTION_RE.exec(trimmed);
    if (sectionMatch !== undefined && sectionMatch !== null && sectionMatch[1] !== undefined) {
      currentSection = sectionMatch[1];
      continue;
    }

    // Only process lines in dependency sections
    if (!DEP_SECTIONS.has(currentSection)) continue;

    // Parse key = value
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const depName = trimmed.slice(0, eqIdx).trim();
    const depValue = trimmed.slice(eqIdx + 1).trim();

    if (depName === "" || depValue === "") continue;

    const dep = parseDependencyValue(depName, depValue);

    // Skip path and git dependencies
    if (dep.isPathOrGit) continue;

    // Use the real package name if renamed
    const resolvedName = dep.packageName ?? dep.name;

    // Determine version: only exact pins get a version in the purl
    const version =
      dep.version !== undefined && isExactVersion(dep.version)
        ? stripExactPrefix(dep.version)
        : undefined;

    const purl = new PackageURL("cargo", null, resolvedName, version ?? null, null, null);
    const purlParts = decodePurl(purl.toString());

    results.push({ purl: purlParts, type: cargoType, source });
  }

  return results;
};

/**
 * Cargo package detector.
 *
 * Scans `Cargo.toml` in the project directory and extracts dependencies
 * from `[dependencies]`, `[dev-dependencies]`, and `[build-dependencies]`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const cargoDetector: PackageDetector = {
  type: cargoType,
  detect: Effect.fn("detect.cargo")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const cargoTomlPath = path.join(projectDir, "Cargo.toml");

      const content = yield* readFileOptional(cargoTomlPath);
      if (Option.isNone(content)) return [];

      // Validate that it looks like TOML (basic check)
      const trimmed = content.value.trim();
      if (trimmed.length > 0 && !trimmed.includes("=") && !trimmed.includes("[")) {
        yield* Effect.logWarning("Malformed Cargo.toml, skipping");
        return [];
      }

      return parseCargoToml(content.value, cargoTomlPath);
    },
    Effect.annotateLogs({ detector: "cargo" }),
    Effect.withSpan("detect.cargo"),
  ),
};

/**
 * Resolve the CARGO_HOME, defaulting to ~/.cargo when not set.
 */
const resolveCargoHome = () => envWithDefault("CARGO_HOME", `${os.homedir()}/.cargo`);

/**
 * Cargo package reader.
 *
 * Reads `axm.json` from `$CARGO_HOME/registry/src/<index>/<crate>-<version>/`
 * for each detected cargo crate and extracts recommendation metadata.
 *
 * When the crate version is unknown, scans the registry source directory
 * for any matching crate directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const cargoReader: PackageReader = {
  type: cargoType,
  read: Effect.fn("read.cargo")(
    function* (pkg: DetectedPackage) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const cargoHome = yield* resolveCargoHome();
      const crateName = pkg.purl.name;
      const version = pkg.purl.version;

      // Cargo stores downloaded crate sources in
      // $CARGO_HOME/registry/src/<index-hash>/<crate>-<version>/
      const registrySrcDir = path.join(cargoHome, "registry", "src");

      // Scan index directories inside registry/src/
      const indexDirs = yield* fs.readDirectory(registrySrcDir).pipe(Effect.option);
      if (Option.isNone(indexDirs)) return Option.none();

      // Search across index directories for the matching crate
      for (const indexDir of indexDirs.value) {
        const indexPath = path.join(registrySrcDir, indexDir);

        if (version !== undefined) {
          // Exact version: look for <crate>-<version>/axm.json
          const axmJsonPath = path.join(indexPath, `${crateName}-${version}`, "axm.json");
          const content = yield* readFileOptional(axmJsonPath);
          if (Option.isSome(content)) {
            const parsed = yield* parseJsonOptional(
              content.value,
              `${crateName}-${version}/axm.json`,
            );
            if (Option.isNone(parsed)) return Option.none();

            const metaResult = decodeAxmMeta(parsed.value);
            if (Result.isFailure(metaResult)) {
              yield* Effect.logWarning(
                `Invalid axm metadata in ${crateName}-${version}: schema validation failed`,
              );
              return Option.none();
            }

            return Option.some(metaResult.success.recommendedExtensions);
          }
        } else {
          // No version: find any matching crate directory
          const entries = yield* fs.readDirectory(indexPath).pipe(Effect.option);
          if (Option.isNone(entries)) continue;

          const matchingDir = entries.value.find(
            (entry) => entry === crateName || entry.startsWith(`${crateName}-`),
          );
          if (matchingDir === undefined) continue;

          const axmJsonPath = path.join(indexPath, matchingDir, "axm.json");
          const content = yield* readFileOptional(axmJsonPath);
          if (Option.isNone(content)) continue;

          const parsed = yield* parseJsonOptional(content.value, `${matchingDir}/axm.json`);
          if (Option.isNone(parsed)) return Option.none();

          const metaResult = decodeAxmMeta(parsed.value);
          if (Result.isFailure(metaResult)) {
            yield* Effect.logWarning(
              `Invalid axm metadata in ${matchingDir}: schema validation failed`,
            );
            return Option.none();
          }

          return Option.some(metaResult.success.recommendedExtensions);
        }
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "cargo" }),
    Effect.withSpan("read.cargo"),
  ),
};
