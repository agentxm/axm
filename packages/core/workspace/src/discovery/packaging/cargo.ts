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
import { envWithDefault } from "../internal/environment.js";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAxmMeta, decodePurl, readFileOptional } from "./reader-io.js";
import { isTomlTable, parseTomlDocument, tomlTable, type TomlTable } from "./toml.js";
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

/** Dependency tables we read. */
const DEP_SECTIONS = ["dependencies", "dev-dependencies", "build-dependencies"] as const;

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
 * - Table: `{ version = "1.0", features = ["derive"] }`
 */
const parseDependencyValue = (name: string, value: unknown): CargoDep => {
  if (typeof value === "string") {
    return { name, version: value, isPathOrGit: false, packageName: undefined };
  }

  if (isTomlTable(value)) {
    if ("path" in value || "git" in value) {
      return { name, version: undefined, isPathOrGit: true, packageName: undefined };
    }
    const version = typeof value["version"] === "string" ? value["version"] : undefined;
    const packageName = typeof value["package"] === "string" ? value["package"] : undefined;
    return { name, version, isPathOrGit: false, packageName };
  }

  // Unknown format, skip
  return { name, version: undefined, isPathOrGit: false, packageName: undefined };
};

/**
 * Extract dependencies from a parsed Cargo.toml document.
 */
const parseCargoToml = (document: TomlTable, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  for (const section of DEP_SECTIONS) {
    const table = tomlTable(document, section);
    if (table === undefined) continue;

    for (const [depName, depValue] of Object.entries(table)) {
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

      const document = parseTomlDocument(content.value);
      if (document === undefined) {
        yield* Effect.logWarning("Malformed Cargo.toml, skipping");
        return [];
      }

      return parseCargoToml(document, cargoTomlPath);
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
 * Read the `[package.metadata.axm]` table from a Cargo.toml string.
 *
 * Returns `undefined` when the file does not parse or the table is absent.
 * `[package.metadata.*]` is Cargo's standard extensibility mechanism for
 * third-party tools. Supported forms:
 *
 *   [package.metadata.axm]
 *   extensions = [{ ref = "@owner/packs/example", versionRange = "^1.0.0" }]
 *
 *   [[package.metadata.axm.extensions]]
 *   ref = "@owner/packs/example"
 *   versionRange = "^1.0.0"
 */
const parsePackageMetadataAxm = (content: string): TomlTable | undefined =>
  tomlTable(tomlTable(tomlTable(parseTomlDocument(content), "package"), "metadata"), "axm");

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
