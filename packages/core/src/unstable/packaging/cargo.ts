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

const parseTomlInlineString = (value: string): string | undefined => {
  try {
    const decoded: unknown = JSON.parse(value);
    return typeof decoded === "string" ? decoded : undefined;
  } catch {
    return undefined;
  }
};

const parseTomlInlineTableArray = (rawValue: string): unknown => {
  if (rawValue === "[]") return [];

  try {
    return JSON.parse(rawValue);
  } catch {
    // TOML inline tables use `key = "value"`, which is not JSON. Parse the
    // package metadata subset AXM supports without pulling in a full TOML parser.
  }

  const entries: Array<Record<string, string>> = [];
  for (const match of rawValue.matchAll(/\{([^{}]*)\}/g)) {
    const tableBody = match[1];
    if (tableBody === undefined) continue;

    const entry: Record<string, string> = {};
    for (const part of tableBody.split(",")) {
      const pair = /^\s*([A-Za-z0-9_-]+)\s*=\s*("(?:\\.|[^"\\])*")\s*$/.exec(part);
      const key = pair?.[1];
      const encodedValue = pair?.[2];
      if (key === undefined || encodedValue === undefined) continue;

      const value = parseTomlInlineString(encodedValue);
      if (value !== undefined) entry[key] = value;
    }

    if (Object.keys(entry).length > 0) entries.push(entry);
  }

  return entries.length > 0 ? entries : rawValue;
};

/**
 * Parse the `[package.metadata.axm]` table from a Cargo.toml string.
 *
 * Returns `undefined` when the section is absent. `Cargo.toml` is TOML; we
 * scan section headers line-by-line rather than depending on a full TOML
 * parser, mirroring `julia.ts`/`parseAxmSection`. Supported forms:
 *
 *   [package.metadata.axm]
 *   extensions = [{ ref = "@owner/packs/example", versionRange = "^1.0.0" }]
 *
 *   [package.metadata.axm.extensions]  # not supported; arrays are
 *                                                 # always inline below the
 *                                                 # `[package.metadata.axm]`
 *                                                 # header.
 */
const parsePackageMetadataAxm = (content: string): Record<string, unknown> | undefined => {
  const lines = content.split("\n");
  let inAxmSection = false;
  let found = false;
  const fields: Record<string, unknown> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // Section headers (`[section.path]` or `[[array.of.tables]]`)
    if (trimmed.startsWith("[")) {
      if (inAxmSection) break; // leaving the [package.metadata.axm] table
      inAxmSection = trimmed === "[package.metadata.axm]";
      if (inAxmSection) found = true;
      continue;
    }

    if (!inAxmSection) continue;

    const match = /^([^=\s]+)\s*=\s*(.+)$/.exec(trimmed);
    if (match === null) continue;

    const key = match[1];
    const rawValue = match[2]?.trim();
    if (key === undefined || rawValue === undefined) continue;

    if (rawValue.startsWith("[")) {
      fields[key] = parseTomlInlineTableArray(rawValue);
    } else if (rawValue.startsWith('"')) {
      fields[key] = rawValue.slice(1, -1);
    } else if (rawValue === "true" || rawValue === "false") {
      fields[key] = rawValue === "true";
    } else {
      fields[key] = rawValue;
    }
  }

  return found ? fields : undefined;
};

/**
 * Cargo package reader.
 *
 * Reads `[package.metadata.axm]` from
 * `$CARGO_HOME/registry/src/<index>/<crate>-<version>/Cargo.toml` for each
 * detected cargo crate. `[package.metadata.*]` is Cargo's standard
 * extensibility mechanism for third-party tools (used by docs.rs, cargo-deb,
 * cargo-bundle, etc.).
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

      const registrySrcDir = path.join(cargoHome, "registry", "src");

      const indexDirs = yield* fs.readDirectory(registrySrcDir).pipe(Effect.option);
      if (Option.isNone(indexDirs)) return Option.none();

      for (const indexDir of indexDirs.value) {
        const indexPath = path.join(registrySrcDir, indexDir);

        const crateDir =
          version !== undefined
            ? `${crateName}-${version}`
            : yield* findMatchingCrateDir(fs, indexPath, crateName);
        if (crateDir === undefined) continue;

        const cargoTomlPath = path.join(indexPath, crateDir, "Cargo.toml");
        const content = yield* readFileOptional(cargoTomlPath);
        if (Option.isNone(content)) {
          if (version !== undefined) return Option.none();
          continue;
        }

        const axmFields = parsePackageMetadataAxm(content.value);
        if (axmFields === undefined) {
          if (version !== undefined) return Option.none();
          continue;
        }

        const metaResult = decodeAxmMeta(axmFields);
        if (Result.isFailure(metaResult)) {
          yield* Effect.logWarning(
            `Invalid axm metadata in ${crateDir}/Cargo.toml: schema validation failed`,
          );
          return Option.none();
        }

        return Option.some(metaResult.success.extensions);
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "cargo" }),
    Effect.withSpan("read.cargo"),
  ),
};

const findMatchingCrateDir = (fs: FileSystem.FileSystem, indexPath: string, crateName: string) =>
  Effect.gen(function* () {
    const entries = yield* fs.readDirectory(indexPath).pipe(Effect.option);
    if (Option.isNone(entries)) return undefined;
    return entries.value.find((entry) => entry === crateName || entry.startsWith(`${crateName}-`));
  });
