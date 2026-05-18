/**
 * Julia package detector and reader for package-compatibility discovery.
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
import { parseTomlValue } from "../toml/index.js";
import { AxmPackageMetaSchema } from "./axm-package-meta.js";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlSchema } from "./package-url.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const juliaType = Schema.decodeUnknownSync(PackageTypeSchema)("julia");
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

/** UUID pattern for Julia dependency values. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse a simple TOML [deps] section from Project.toml content.
 * Julia's Project.toml uses TOML format with [deps] section containing:
 *   PackageName = "uuid-string"
 */
const parseDepsSection = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];
  const lines = content.split("\n");
  let inDepsSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headers
    if (trimmed.startsWith("[")) {
      inDepsSection = trimmed === "[deps]";
      continue;
    }

    if (!inDepsSection) continue;

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // Parse key = "value" entries
    const match = /^(\S+)\s*=\s*"([^"]*)"/.exec(trimmed);
    if (match === null) continue;

    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;

    // Validate it looks like a UUID
    if (!UUID_PATTERN.test(value)) continue;

    // Julia deps are always versionless (identified by UUID)
    const purl = new PackageURL("julia", null, name, null, null, null);
    const purlParts = decodePurl(purl.toString());
    results.push({ purl: purlParts, type: juliaType, source });
  }

  return results;
};

/**
 * Julia package detector.
 *
 * Scans `Project.toml` in the project directory and extracts dependencies
 * from the `[deps]` section. All purls are versionless since Julia
 * identifies packages by UUID.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const juliaDetector: PackageDetector = {
  type: juliaType,
  detect: Effect.fn("detect.julia")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const projectTomlPath = path.join(projectDir, "Project.toml");

      const content = yield* readFileOptional(projectTomlPath);
      if (Option.isNone(content)) return [];

      const deps = parseDepsSection(content.value, projectTomlPath);
      if (deps.length === 0 && content.value.trim().length > 0) {
        // Content exists but no deps found - check if it looks like valid TOML
        if (!content.value.includes("=") && !content.value.includes("[")) {
          yield* Effect.logWarning("Malformed Project.toml, skipping");
        }
      }

      return deps;
    },
    Effect.annotateLogs({ detector: "julia" }),
    Effect.withSpan("detect.julia"),
  ),
};

/**
 * Parse a simple TOML [axm] section from Project.toml content.
 * Returns the parsed fields as a record, or undefined if no [axm] section found.
 */
const parseAxmSection = (content: string): Record<string, unknown> | undefined => {
  const lines = content.split("\n");
  let inAxmSection = false;
  const fields: Record<string, unknown> = {};
  let foundSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headers
    if (trimmed.startsWith("[")) {
      if (inAxmSection) break; // End of [axm] section
      inAxmSection = trimmed === "[axm]";
      if (inAxmSection) foundSection = true;
      continue;
    }

    if (!inAxmSection) continue;

    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // Parse key = value entries
    const match = /^(\S+)\s*=\s*(.+)$/.exec(trimmed);
    if (match === null) continue;

    const key = match[1];
    const rawValue = match[2]?.trim();
    if (key === undefined || rawValue === undefined) continue;

    // Parse TOML values
    fields[key] = parseTomlValue(rawValue);
  }

  return foundSection ? fields : undefined;
};

/**
 * Julia package reader.
 *
 * Reads `[axm]` section from `~/.julia/packages/<pkg>/<hash>/Project.toml`
 * for each detected Julia package.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const juliaReader: PackageReader = {
  type: juliaType,
  read: Effect.fn("read.julia")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const pkgName = pkg.purl.name;
      const home = os.homedir();

      const juliaPkgsDir = path.join(home, ".julia", "packages", pkgName);

      // Scan hash directories
      const hashDirs = yield* fs.readDirectory(juliaPkgsDir).pipe(Effect.option);
      if (Option.isNone(hashDirs)) return Option.none();

      // Check each hash directory for Project.toml with [axm] section
      for (const hashDir of hashDirs.value) {
        const projectTomlPath = path.join(juliaPkgsDir, hashDir, "Project.toml");
        const content = yield* readFileOptional(projectTomlPath);
        if (Option.isNone(content)) continue;

        const axmFields = parseAxmSection(content.value);
        if (axmFields === undefined) continue;

        const metaResult = decodeAxmMeta(axmFields);
        if (Result.isFailure(metaResult)) {
          yield* Effect.logWarning(`Invalid axm metadata in ${pkgName}: schema validation failed`);
          return Option.none();
        }

        return Option.some(metaResult.success.extensions);
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "julia" }),
    Effect.withSpan("read.julia"),
  ),
};
