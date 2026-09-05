/**
 * CRAN (R) package detector and reader for package-compatibility discovery.
 *
 * Parses `DESCRIPTION` files for `Depends`, `Imports`, and `Suggests` fields.
 * Reads `Config/axm` prefixed fields from installed package DESCRIPTION files.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:os homedir() has no @effect/platform equivalent.
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { readEnv } from "../internal/environment.js";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAxmMeta, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const cranType = Schema.decodeUnknownSync(PackageTypeSchema)("cran");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a DESCRIPTION file into a key-value map.
 * Handles continuation lines (lines starting with whitespace are appended
 * to the previous field value).
 */
const parseDescriptionFile = (content: string): Record<string, string> => {
  const result: Record<string, string> = {};
  let currentKey: string | undefined;

  for (const line of content.split("\n")) {
    // Continuation line: starts with whitespace
    if (/^\s/.test(line) && currentKey !== undefined) {
      const existing = result[currentKey];
      if (existing !== undefined) {
        result[currentKey] = existing + " " + line.trim();
      }
      continue;
    }

    // New field: Key: Value
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      currentKey = line.slice(0, colonIdx).trim();
      result[currentKey] = line.slice(colonIdx + 1).trim();
    }
  }

  return result;
};

/**
 * Parse a comma-separated list of R package dependencies.
 * Each entry is like "name (>= version)" or just "name".
 * Filters out base R packages like "R" itself.
 */
const parseDependencyList = (value: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  for (const entry of value.split(",")) {
    const trimmed = entry.trim();
    if (trimmed === "") continue;

    // Parse "name (>= version)" or "name"
    const match = /^([A-Za-z][A-Za-z0-9.]*)(?:\s*\((.+)\))?$/.exec(trimmed);
    if (!match) continue;

    const name = match[1];
    if (name === undefined || name === "R") continue;

    // Only extract exact version constraints
    const constraint = match[2]?.trim();
    let version: string | undefined;
    if (constraint !== undefined) {
      const exactMatch = /^==\s*(.+)$/.exec(constraint);
      if (exactMatch) {
        version = exactMatch[1]?.trim();
      }
    }

    results.push({
      purl: {
        type: cranType,
        name,
        ...(version !== undefined ? { version } : {}),
      },
      type: cranType,
      source,
    });
  }

  return results;
};

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

/**
 * CRAN package detector.
 *
 * Scans `DESCRIPTION` file in the project directory and extracts dependencies
 * from `Depends`, `Imports`, and `Suggests` fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const cranDetector: PackageDetector = {
  type: cranType,
  detect: Effect.fn("detect.cran")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const descriptionPath = path.join(projectDir, "DESCRIPTION");

      const content = yield* readFileOptional(descriptionPath);
      if (Option.isNone(content)) return [];

      const fields = parseDescriptionFile(content.value);
      const allPackages: Array<DetectedPackage> = [];
      const seenNames = new Set<string>();

      const addUnique = (pkgs: ReadonlyArray<DetectedPackage>) => {
        for (const pkg of pkgs) {
          if (!seenNames.has(pkg.purl.name)) {
            seenNames.add(pkg.purl.name);
            allPackages.push(pkg);
          }
        }
      };

      // Extract from Depends, Imports, Suggests
      for (const field of ["Depends", "Imports", "Suggests"] as const) {
        const value = fields[field];
        if (value !== undefined) {
          addUnique(parseDependencyList(value, descriptionPath));
        }
      }

      return allPackages;
    },
    Effect.annotateLogs({ detector: "cran" }),
    Effect.withSpan("detect.cran"),
  ),
};

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/**
 * Resolve the R library path.
 * Checks R_LIBS_USER, then defaults to ~/R/library.
 */
const resolveRLibPath = () =>
  Effect.sync(() => readEnv("R_LIBS_USER") ?? `${os.homedir()}/R/library`);

/**
 * CRAN package reader.
 *
 * Reads `Config/axm` prefixed fields from `<lib-path>/<pkg>/DESCRIPTION`
 * for each detected CRAN package and extracts recommendation metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const cranReader: PackageReader = {
  type: cranType,
  read: Effect.fn("read.cran")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const libPath = yield* resolveRLibPath();

      const descriptionPath = path.join(libPath, pkg.purl.name, "DESCRIPTION");

      const content = yield* readFileOptional(descriptionPath);
      if (Option.isNone(content)) return Option.none();

      const fields = parseDescriptionFile(content.value);

      // Look for Config/axm fields - the metadata is stored as JSON in Config/axm
      const axmField = fields["Config/axm"];
      if (axmField === undefined) return Option.none();

      // Parse the axm metadata JSON
      const axmParsed = yield* Effect.try({
        try: (): unknown => JSON.parse(axmField),
        catch: () => ({ _tag: "JsonParseError" as const }),
      }).pipe(Effect.option);

      if (Option.isNone(axmParsed)) {
        yield* Effect.logWarning(`Malformed Config/axm in ${pkg.purl.name}: invalid JSON`);
        return Option.none();
      }

      const metaResult = decodeAxmMeta(axmParsed.value);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(
          `Invalid axm metadata in ${pkg.purl.name}: schema validation failed`,
        );
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "cran" }),
    Effect.withSpan("read.cran"),
  ),
};
