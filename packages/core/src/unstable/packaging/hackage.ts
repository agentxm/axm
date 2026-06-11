/**
 * Hackage (Haskell) package detector and reader for package-compatibility discovery.
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
import { PackageTypeSchema } from "./package-type.js";
import { decodeAxmMeta, decodePurl, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const hackageType = Schema.decodeUnknownSync(PackageTypeSchema)("hackage");

/**
 * Parse a cabal build-depends line into individual dependency entries.
 * build-depends can span multiple lines with comma separation.
 * Each entry is: package-name [version-constraint]
 */
const parseBuildDependsEntry = (
  entry: string,
): { readonly name: string; readonly version?: string } | undefined => {
  const trimmed = entry.trim();
  if (trimmed === "") return undefined;

  // Split on whitespace to get name and optional version constraint
  const parts = trimmed.split(/\s+/);
  const name = parts[0];
  if (name === undefined || name === "") return undefined;

  // Check for exact version pin: ==version
  const rest = parts.slice(1).join(" ").trim();
  const exactMatch = /^==\s*(\S+)$/.exec(rest);
  if (exactMatch?.[1]) {
    return { name, version: exactMatch[1] };
  }

  // Any other constraint or no constraint => versionless
  return { name };
};

/**
 * Parse all build-depends fields from a cabal file.
 * Extracts dependencies from all sections (library, executable, etc.)
 * and all conditional branches.
 */
const parseCabalBuildDepends = (
  content: string,
  source: string,
): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];
  const seen = new Set<string>();

  // Match all build-depends fields, handling multi-line values.
  // build-depends: entries are comma-separated and may span multiple lines
  // (continuation lines are indented further than the field name).
  const buildDependsRegex = /build-depends\s*:\s*([^\n]*(?:\n[ \t]+[^\n]*)*)/gi;
  let match: RegExpExecArray | null;

  while ((match = buildDependsRegex.exec(content)) !== null) {
    const depsBlock = match[1];
    if (depsBlock === undefined) continue;

    // Split on commas, handling multi-line
    const entries = depsBlock.split(",");

    for (const entry of entries) {
      const parsed = parseBuildDependsEntry(entry);
      if (parsed === undefined) continue;
      if (seen.has(parsed.name)) continue;
      seen.add(parsed.name);

      const purl = new PackageURL("hackage", null, parsed.name, parsed.version ?? null, null, null);
      const purlParts = decodePurl(purl.toString());
      results.push({ purl: purlParts, type: hackageType, source });
    }
  }

  return results;
};

/**
 * Parse stack.yaml extra-deps entries.
 * extra-deps entries have the format: package-version (e.g. aeson-2.1.0.0)
 * The last hyphen-separated segment that starts with a digit is the version.
 */
const parseExtraDep = (
  entry: string,
): { readonly name: string; readonly version: string } | undefined => {
  const trimmed = entry.trim().replace(/^-\s*/, "");
  if (trimmed === "" || trimmed.startsWith("#")) return undefined;

  // Skip entries that look like git references or URLs
  if (trimmed.includes("/") || trimmed.includes(":")) return undefined;

  // Find the last hyphen that separates name from version
  // Version starts with a digit
  const lastHyphen = trimmed.lastIndexOf("-");
  if (lastHyphen === -1) return undefined;

  const possibleVersion = trimmed.slice(lastHyphen + 1);
  if (!/^\d/.test(possibleVersion)) return undefined;

  const name = trimmed.slice(0, lastHyphen);
  if (name === "") return undefined;

  return { name, version: possibleVersion };
};

/**
 * Parse stack.yaml content for extra-deps.
 */
const parseStackYaml = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];
  const seen = new Set<string>();
  const lines = content.split("\n");
  let inExtraDeps = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Start of extra-deps block (YAML list)
    if (trimmed.startsWith("extra-deps:")) {
      inExtraDeps = true;
      // Check inline list format: extra-deps: [item1, item2]
      const inlineMatch = /extra-deps:\s*\[([^\]]*)\]/.exec(trimmed);
      if (inlineMatch?.[1]) {
        const entries = inlineMatch[1].split(",");
        for (const entry of entries) {
          const parsed = parseExtraDep(entry);
          if (parsed === undefined) continue;
          if (seen.has(parsed.name)) continue;
          seen.add(parsed.name);
          const purl = new PackageURL("hackage", null, parsed.name, parsed.version, null, null);
          const purlParts = decodePurl(purl.toString());
          results.push({ purl: purlParts, type: hackageType, source });
        }
        inExtraDeps = false;
      }
      continue;
    }

    // End of extra-deps block (next top-level key)
    if (
      inExtraDeps &&
      !line.startsWith(" ") &&
      !line.startsWith("\t") &&
      trimmed !== "" &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("#")
    ) {
      inExtraDeps = false;
      continue;
    }

    // List item in extra-deps
    if (inExtraDeps && trimmed.startsWith("-")) {
      const parsed = parseExtraDep(trimmed);
      if (parsed === undefined) continue;
      if (seen.has(parsed.name)) continue;
      seen.add(parsed.name);
      const purl = new PackageURL("hackage", null, parsed.name, parsed.version, null, null);
      const purlParts = decodePurl(purl.toString());
      results.push({ purl: purlParts, type: hackageType, source });
    }
  }

  return results;
};

/**
 * Hackage package detector.
 *
 * Scans `*.cabal` files for `build-depends` fields and `stack.yaml` for
 * `extra-deps` entries. Dependencies are deduplicated by name.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const hackageDetector: PackageDetector = {
  type: hackageType,
  detect: Effect.fn("detect.hackage")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const allDeps: Array<DetectedPackage> = [];
      const seenNames = new Set<string>();

      const addDeps = (deps: ReadonlyArray<DetectedPackage>): void => {
        for (const dep of deps) {
          if (!seenNames.has(dep.purl.name)) {
            seenNames.add(dep.purl.name);
            allDeps.push(dep);
          }
        }
      };

      // Scan for *.cabal files
      const entries = yield* fs.readDirectory(projectDir).pipe(Effect.option);
      if (Option.isSome(entries)) {
        const cabalFiles = entries.value.filter((e) => e.endsWith(".cabal"));
        for (const cabalFile of cabalFiles) {
          const cabalPath = path.join(projectDir, cabalFile);
          const content = yield* readFileOptional(cabalPath);
          if (Option.isSome(content)) {
            const deps = parseCabalBuildDepends(content.value, cabalPath);
            if (deps.length === 0 && content.value.trim().length > 0) {
              // Check if it looks like a valid cabal file
              if (!content.value.includes("name:") && !content.value.includes("cabal-version:")) {
                yield* Effect.logWarning(`Malformed cabal file: ${cabalFile}, skipping`);
              }
            }
            addDeps(deps);
          }
        }
      }

      // Parse stack.yaml
      const stackPath = path.join(projectDir, "stack.yaml");
      const stackContent = yield* readFileOptional(stackPath);
      if (Option.isSome(stackContent)) {
        const stackDeps = parseStackYaml(stackContent.value, stackPath);
        addDeps(stackDeps);
      }

      return allDeps;
    },
    Effect.annotateLogs({ detector: "hackage" }),
    Effect.withSpan("detect.hackage"),
  ),
};

/**
 * Parse x-axm custom fields from a cabal file content.
 * Returns a record mapping field names (without x-axm- prefix) to values.
 */
const parseXAxmFields = (content: string): Record<string, unknown> => {
  const fields: Record<string, unknown> = {};
  const regex = /^x-axm-(\S+)\s*:\s*(.+)$/gim;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const fieldName = match[1];
    const rawValue = match[2]?.trim();
    if (fieldName === undefined || rawValue === undefined) continue;

    // Try to parse JSON value, otherwise use as string
    try {
      fields[fieldName] = JSON.parse(rawValue);
    } catch {
      fields[fieldName] = rawValue;
    }
  }

  return fields;
};

/**
 * Hackage package reader.
 *
 * Reads `x-axm` prefixed custom fields from `.cabal` files in
 * `~/.cabal/store/ghc-<version>/<pkg>-<version>/` or `dist-newstyle/`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const hackageReader: PackageReader = {
  type: hackageType,
  read: Effect.fn("read.hackage")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const pkgName = pkg.purl.name;
      const version = pkg.purl.version;
      const home = os.homedir();

      // Try to find the .cabal file in known locations

      // 1. Try ~/.cabal/store/ghc-*/pkg-version/
      const cabalStoreDir = path.join(home, ".cabal", "store");
      const storeExists = yield* fs.readDirectory(cabalStoreDir).pipe(Effect.option);

      if (Option.isSome(storeExists)) {
        // Look for ghc-* directories
        for (const ghcDir of storeExists.value) {
          if (!ghcDir.startsWith("ghc-")) continue;

          const pkgDirName = version ? `${pkgName}-${version}` : pkgName;
          const pkgDir = path.join(cabalStoreDir, ghcDir, pkgDirName);
          const pkgEntries = yield* fs.readDirectory(pkgDir).pipe(Effect.option);

          if (Option.isSome(pkgEntries)) {
            const cabalFile = pkgEntries.value.find((e) => e.endsWith(".cabal"));
            if (cabalFile !== undefined) {
              const cabalPath = path.join(pkgDir, cabalFile);
              const content = yield* readFileOptional(cabalPath);
              if (Option.isSome(content)) {
                const xAxmFields = parseXAxmFields(content.value);
                if (Object.keys(xAxmFields).length === 0) return Option.none();

                const metaResult = decodeAxmMeta(xAxmFields);
                if (Result.isFailure(metaResult)) {
                  yield* Effect.logWarning(
                    `Invalid axm metadata in ${pkgName}: schema validation failed`,
                  );
                  return Option.none();
                }

                return Option.some(metaResult.success.extensions);
              }
            }
          }
        }
      }

      // 2. Try dist-newstyle/ relative to project dir
      const projectDir = path.dirname(pkg.source);
      const distDir = path.join(projectDir, "dist-newstyle");
      const distExists = yield* fs.access(distDir).pipe(Effect.option);

      if (Option.isSome(distExists)) {
        // Search recursively for the package's .cabal file
        // dist-newstyle has a deep structure, so look for any .cabal file matching the package name
        const pkgDirName = version ? `${pkgName}-${version}` : pkgName;
        const candidatePath = path.join(distDir, "build", pkgDirName, `${pkgName}.cabal`);
        const content = yield* readFileOptional(candidatePath);
        if (Option.isSome(content)) {
          const xAxmFields = parseXAxmFields(content.value);
          if (Object.keys(xAxmFields).length === 0) return Option.none();

          const metaResult = decodeAxmMeta(xAxmFields);
          if (Result.isFailure(metaResult)) {
            yield* Effect.logWarning(
              `Invalid axm metadata in ${pkgName}: schema validation failed`,
            );
            return Option.none();
          }

          return Option.some(metaResult.success.extensions);
        }
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "hackage" }),
    Effect.withSpan("read.hackage"),
  ),
};
