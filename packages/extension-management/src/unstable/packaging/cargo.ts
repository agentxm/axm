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
import { parseTomlValue } from "@agentxm/extension-workspace";
import { envWithDefault } from "../utils/environment.js";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAxmMeta, decodePurl, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const cargoType = Schema.decodeUnknownSync(PackageTypeSchema)("cargo");

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
 * Parse the `[package.metadata.axm]` table from a Cargo.toml string.
 *
 * Returns `undefined` when the section is absent. `Cargo.toml` is TOML; we
 * scan section headers line-by-line rather than depending on a full TOML
 * parser, mirroring `julia.ts`/`parseAxmSection`. Supported forms:
 *
 *   [package.metadata.axm]
 *   extensions = [{ ref = "@owner/packs/example", versionRange = "^1.0.0" }]
 *
 *   [[package.metadata.axm.extensions]]
 *   ref = "@owner/packs/example"
 *   versionRange = "^1.0.0"
 */
const parsePackageMetadataAxm = (content: string): Record<string, unknown> | undefined => {
  const lines = content.split("\n");
  let inAxmSection = false;
  let found = false;
  const fields: Record<string, unknown> = {};
  const extensionEntries: Array<Record<string, unknown>> = [];
  let currentTable: Record<string, unknown> | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // Section headers (`[section.path]` or `[[array.of.tables]]`)
    if (trimmed.startsWith("[")) {
      const arrayTableMatch = /^\[\[package\.metadata\.axm\.([A-Za-z0-9_-]+)\]\]$/.exec(trimmed);
      const arrayTableKey = arrayTableMatch?.[1];
      if (arrayTableKey !== undefined) {
        found = true;
        inAxmSection = false;

        if (arrayTableKey === "extensions") {
          const entry: Record<string, unknown> = {};
          extensionEntries.push(entry);
          fields["extensions"] = extensionEntries;
          currentTable = entry;
        } else {
          currentTable = undefined;
        }

        continue;
      }

      const axmTableMatch = /^\[package\.metadata\.axm(?:\.([A-Za-z0-9_-]+))?\]$/.exec(trimmed);
      if (axmTableMatch !== null) {
        found = true;
        inAxmSection = axmTableMatch[1] === undefined;
        currentTable = undefined;
        continue;
      }

      inAxmSection = false;
      currentTable = undefined;
      continue;
    }

    const target = currentTable ?? (inAxmSection ? fields : undefined);
    if (target === undefined) continue;

    const match = /^([^=\s]+)\s*=\s*(.+)$/.exec(trimmed);
    if (match === null) continue;

    const key = match[1];
    const rawValue = match[2]?.trim();
    if (key === undefined || rawValue === undefined) continue;

    target[key] = parseTomlValue(rawValue);
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
