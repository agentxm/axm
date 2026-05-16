/**
 * pypi package detector and reader for package-compatibility discovery.
 *
 * Parses Python dependency files (pyproject.toml, requirements.txt,
 * setup.cfg, Pipfile) and reads axm metadata from installed packages.
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
import { AxmPackageMetaSchema } from "./axm-package-meta.js";
import { PackageTypeSchema } from "./package-type.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

// eslint-disable-next-line no-restricted-properties -- Centralized env var access for packaging detectors
const readEnv = (name: string): string | undefined => process.env[name];

const pypiType = Schema.decodeUnknownSync(PackageTypeSchema)("pypi");
const decodeAxmMeta = Schema.decodeUnknownResult(AxmPackageMetaSchema);

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a Python package name per purl spec:
 * lowercase, replace underscores/dots/runs-of-dashes with single dash.
 */
const normalizeName = (name: string): string => name.toLowerCase().replace(/[-_.]+/g, "-");

// ---------------------------------------------------------------------------
// Version extraction
// ---------------------------------------------------------------------------

/**
 * Parse a PEP 440 version specifier string and return the version
 * only if it is an exact pin without wildcards.
 */
const extractExactVersion = (specifier: string): string | undefined => {
  const trimmed = specifier.trim();
  if (trimmed === "") return undefined;

  // Only exact pins: ==X.Y.Z (no wildcard)
  const exactMatch = /^==([^*,!~<>=]+)$/.exec(trimmed);
  if (exactMatch?.[1] !== undefined) return exactMatch[1].trim();

  return undefined;
};

/**
 * Parse a dependency line into name and optional version.
 * Handles: `name`, `name[extras]`, `name>=1.0`, `name==1.0.0`, etc.
 */
const parseDependencyLine = (
  line: string,
): { readonly name: string; readonly version: string | undefined } | undefined => {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return undefined;

  // Match package name (possibly with extras), then optional version specifiers
  // Package names: letters, digits, hyphens, underscores, dots
  const match = /^([A-Za-z0-9][-A-Za-z0-9_.]*[A-Za-z0-9]|[A-Za-z0-9])(?:\[.*?\])?\s*(.*)$/.exec(
    trimmed,
  );
  if (!match) return undefined;

  const rawName = match[1] ?? "";
  const versionPart = match[2]?.trim().replace(/;.*$/, "").trim() ?? ""; // strip environment markers

  return {
    name: normalizeName(rawName),
    version: extractExactVersion(versionPart),
  };
};

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/** Read a file as string, returning Option.none for NotFound and other errors. */
const readFileOptional = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(filePath).pipe(Effect.option);
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

// ---------------------------------------------------------------------------
// File parsers
// ---------------------------------------------------------------------------

/** Extract quoted strings from a TOML array body. */
const extractQuotedStrings = (content: string): ReadonlyArray<string> => {
  const strings: Array<string> = [];
  const regex = /["']([^"']*?)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match[1] !== undefined) strings.push(match[1]);
  }
  return strings;
};

/**
 * Parse pyproject.toml for dependencies.
 * Uses simple regex parsing for the subset of TOML we need.
 * Returns an Effect so we can log warnings for malformed content.
 */
const parsePyprojectToml = (content: string, source: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.try({
      try: () => {
        const packages: Array<DetectedPackage> = [];

        // Parse [project] dependencies = [...]
        const projectDepsMatch =
          /\[project\]\s*\n(?:(?!\[).*\n)*?dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(content);
        if (projectDepsMatch) {
          const depsStr = projectDepsMatch[1] ?? "";
          for (const dep of extractQuotedStrings(depsStr)) {
            const parsed = parseDependencyLine(dep);
            if (parsed) {
              packages.push(makeDetectedPackage(parsed.name, parsed.version, source));
            }
          }
        }

        // Parse [project.optional-dependencies] groups
        const optDepsRegex = /\[project\.optional-dependencies\]\s*\n([\s\S]*?)(?=\n\[|\n*$)/gm;
        let optMatch;
        while ((optMatch = optDepsRegex.exec(content)) !== null) {
          const section = optMatch[1] ?? "";
          // Match group_name = [...]
          const groupRegex = /\w+\s*=\s*\[([\s\S]*?)\]/gm;
          let groupMatch;
          while ((groupMatch = groupRegex.exec(section)) !== null) {
            for (const dep of extractQuotedStrings(groupMatch[1] ?? "")) {
              const parsed = parseDependencyLine(dep);
              if (parsed) {
                packages.push(makeDetectedPackage(parsed.name, parsed.version, source));
              }
            }
          }
        }

        return packages;
      },
      catch: () => ({ _tag: "PyprojectParseError" as const }),
    }).pipe(Effect.option);

    if (Option.isNone(result)) {
      yield* Effect.logWarning("Malformed pyproject.toml, skipping");
      const empty: ReadonlyArray<DetectedPackage> = [];
      return empty;
    }

    return result.value;
  });

/**
 * Parse requirements.txt, following -r includes.
 */
const parseRequirementsTxt = (
  projectDir: string,
  content: string,
  source: string,
  visited: Set<string>,
): Effect.Effect<ReadonlyArray<DetectedPackage>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const packages: Array<DetectedPackage> = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and blank lines
      if (trimmed === "" || trimmed.startsWith("#")) continue;

      // Handle -r include directives
      const includeMatch = /^-r\s+(.+)$/.exec(trimmed);
      if (includeMatch) {
        const includeFile = (includeMatch[1] ?? "").trim();
        const includePath = path.join(projectDir, includeFile);
        if (!visited.has(includePath)) {
          visited.add(includePath);
          const includeContent = yield* readFileOptional(includePath);
          if (Option.isSome(includeContent)) {
            const included = yield* parseRequirementsTxt(
              projectDir,
              includeContent.value,
              includeFile,
              visited,
            );
            packages.push(...included);
          } else {
            yield* Effect.logWarning(`requirements.txt: -r target not found: ${includeFile}`);
          }
        }
        continue;
      }

      // Skip other pip options (-e, -i, --index-url, etc.)
      if (trimmed.startsWith("-")) continue;

      const parsed = parseDependencyLine(trimmed);
      if (parsed) {
        packages.push(makeDetectedPackage(parsed.name, parsed.version, source));
      }
    }

    return packages;
  });

/**
 * Parse setup.cfg [options] install_requires.
 * INI format: section headers in brackets, continuation lines are indented.
 */
const parseSetupCfg = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const packages: Array<DetectedPackage> = [];
  const lines = content.split("\n");

  let inOptions = false;
  let inInstallRequires = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headers
    if (trimmed.startsWith("[")) {
      inOptions = trimmed === "[options]";
      inInstallRequires = false;
      continue;
    }

    if (!inOptions) continue;

    // Check for install_requires key
    if (/^install_requires\s*=/.test(trimmed)) {
      inInstallRequires = true;
      // Value may be on the same line after =
      const afterEq = trimmed.replace(/^install_requires\s*=\s*/, "").trim();
      if (afterEq !== "") {
        const parsed = parseDependencyLine(afterEq);
        if (parsed) {
          packages.push(makeDetectedPackage(parsed.name, parsed.version, source));
        }
      }
      continue;
    }

    // Continuation lines (indented) under install_requires
    if (inInstallRequires) {
      // Non-indented non-empty line means we've left the value
      if (trimmed !== "" && !line.startsWith(" ") && !line.startsWith("\t")) {
        inInstallRequires = false;
        continue;
      }
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const parsed = parseDependencyLine(trimmed);
      if (parsed) {
        packages.push(makeDetectedPackage(parsed.name, parsed.version, source));
      }
    }
  }

  return packages;
};

/**
 * Parse Pipfile [packages] section.
 */
const parsePipfile = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const packages: Array<DetectedPackage> = [];

  // Find [packages] section start and extract lines until next section header
  const packagesIdx = content.indexOf("[packages]");
  if (packagesIdx === -1) return packages;

  const afterHeader = content.slice(packagesIdx + "[packages]".length);
  // Next section starts with \n[ at the beginning of a line
  const nextSectionIdx = afterHeader.search(/\n\[/);
  const sectionContent = nextSectionIdx >= 0 ? afterHeader.slice(0, nextSectionIdx) : afterHeader;
  const lines = sectionContent.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // Pipfile format: name = "version_spec" or name = "*" or name = {version = ">=1.0"}
    const kvMatch = /^([A-Za-z0-9][-A-Za-z0-9_.]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!kvMatch) continue;

    const rawName = kvMatch[1] ?? "";
    const valuePart = (kvMatch[2] ?? "").trim();

    let version: string | undefined;

    // Simple string value: ">=4.0" or "*"
    const strMatch = /^["']([^"']*)["']$/.exec(valuePart);
    if (strMatch) {
      const spec = strMatch[1] ?? "";
      if (spec !== "*") {
        version = extractExactVersion(spec);
      }
    }

    packages.push(makeDetectedPackage(normalizeName(rawName), version, source));
  }

  return packages;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeDetectedPackage = (
  name: string,
  version: string | undefined,
  source: string,
): DetectedPackage => ({
  purl: {
    type: pypiType,
    name,
    ...(version !== undefined ? { version } : {}),
  },
  type: pypiType,
  source,
});

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

/**
 * pypi package detector. Parses Python dependency files in priority order.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const pypiDetector: PackageDetector = {
  type: pypiType,
  detect: Effect.fn("detect.pypi")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
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

      // 1. pyproject.toml
      const pyprojectPath = path.join(projectDir, "pyproject.toml");
      const pyprojectContent = yield* readFileOptional(pyprojectPath);
      if (Option.isSome(pyprojectContent)) {
        const deps = yield* parsePyprojectToml(pyprojectContent.value, "pyproject.toml");
        addUnique(deps);
      }

      // 2. requirements.txt
      const reqPath = path.join(projectDir, "requirements.txt");
      const reqContent = yield* readFileOptional(reqPath);
      if (Option.isSome(reqContent)) {
        const reqPackages = yield* parseRequirementsTxt(
          projectDir,
          reqContent.value,
          "requirements.txt",
          new Set([reqPath]),
        );
        addUnique(reqPackages);
      }

      // 3. setup.cfg
      const setupCfgPath = path.join(projectDir, "setup.cfg");
      const setupCfgContent = yield* readFileOptional(setupCfgPath);
      if (Option.isSome(setupCfgContent)) {
        addUnique(parseSetupCfg(setupCfgContent.value, "setup.cfg"));
      }

      // 4. Pipfile
      const pipfilePath = path.join(projectDir, "Pipfile");
      const pipfileContent = yield* readFileOptional(pipfilePath);
      if (Option.isSome(pipfileContent)) {
        addUnique(parsePipfile(pipfileContent.value, "Pipfile"));
      }

      return allPackages;
    },
    Effect.annotateLogs({ detector: "pypi" }),
  ),
};

// ---------------------------------------------------------------------------
// Reader helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a dist-info directory name for comparison:
 * lowercase, replace underscores/dots/dashes uniformly.
 */
const normalizeDistInfoName = (name: string): string => name.toLowerCase().replace(/[-_.]+/g, "-");

/**
 * Parse an INI-style entry_points.txt and check for [axm] group.
 * Returns the first value from the [axm] group if present.
 */
const parseEntryPoints = (content: string): Option.Option<string> => {
  const lines = content.split("\n");
  let inAxmGroup = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section header
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);
    if (sectionMatch) {
      inAxmGroup = sectionMatch[1] === "axm";
      continue;
    }

    if (inAxmGroup && trimmed !== "" && !trimmed.startsWith("#")) {
      // key = value format
      const kvMatch = /^(\S+)\s*=\s*(.+)$/.exec(trimmed);
      if (kvMatch) {
        return Option.some((kvMatch[2] ?? "").trim());
      }
    }
  }

  return Option.none();
};

/**
 * Resolve the site-packages directory to scan.
 * Checks $VIRTUAL_ENV first, then falls back to system.
 */
const resolveSitePackages = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const virtualEnv = yield* Effect.sync(() => readEnv("VIRTUAL_ENV"));
    if (virtualEnv) {
      // Scan for python* directories under lib/
      const libDir = path.join(virtualEnv, "lib");
      const libExists = yield* fs.exists(libDir).pipe(Effect.catch(() => Effect.succeed(false)));
      if (libExists) {
        const entries = yield* fs.readDirectory(libDir).pipe(
          Effect.catch(() => {
            const empty: ReadonlyArray<string> = [];
            return Effect.succeed(empty);
          }),
        );
        for (const entry of entries) {
          if (entry.startsWith("python")) {
            const sp = path.join(libDir, entry, "site-packages");
            const spExists = yield* fs.exists(sp).pipe(Effect.catch(() => Effect.succeed(false)));
            if (spExists) return Option.some(sp);
          }
        }
      }
    }

    // Fallback: no site-packages found
    return Option.none<string>();
  });

/**
 * Find a .dist-info directory matching the given package name.
 */
const findDistInfo = (sitePackages: string, packageName: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const normalizedTarget = normalizeDistInfoName(packageName);

    const entries = yield* fs.readDirectory(sitePackages).pipe(
      Effect.catch(() => {
        const empty: ReadonlyArray<string> = [];
        return Effect.succeed(empty);
      }),
    );

    for (const entry of entries) {
      if (!entry.endsWith(".dist-info")) continue;

      // dist-info format: Name-Version.dist-info
      // Extract the name part (everything before the last hyphen-version)
      const withoutSuffix = entry.replace(/\.dist-info$/, "");
      // Split on hyphen that precedes a version (digit)
      const dashIdx = withoutSuffix.search(/-\d/);
      const dirName = dashIdx >= 0 ? withoutSuffix.substring(0, dashIdx) : withoutSuffix;

      if (normalizeDistInfoName(dirName) === normalizedTarget) {
        return Option.some(path.join(sitePackages, entry));
      }
    }

    return Option.none<string>();
  });

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/**
 * pypi package reader. Reads axm metadata from installed Python packages.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const pypiReader: PackageReader = {
  type: pypiType,
  read: Effect.fn("read.pypi")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      // 1. Resolve site-packages
      const sitePackagesOpt = yield* resolveSitePackages();
      if (Option.isNone(sitePackagesOpt)) return Option.none();

      const sitePackages = sitePackagesOpt.value;

      // 2. Find .dist-info directory
      const distInfoOpt = yield* findDistInfo(sitePackages, pkg.purl.name);
      if (Option.isNone(distInfoOpt)) return Option.none();

      const distInfoDir = distInfoOpt.value;

      // 3. Read entry_points.txt
      const entryPointsPath = path.join(distInfoDir, "entry_points.txt");
      const entryPointsContent = yield* readFileOptional(entryPointsPath);
      if (Option.isNone(entryPointsContent)) return Option.none();

      // 4. Check for [axm] group
      const axmEntry = parseEntryPoints(entryPointsContent.value);
      if (Option.isNone(axmEntry)) return Option.none();

      // 5. Locate axm.json from the entry point value
      // Entry format: "package_module:axm.json" -> look for axm.json in the package dir
      const entryValue = axmEntry.value;
      const colonIdx = entryValue.indexOf(":");
      const modulePart = colonIdx >= 0 ? entryValue.substring(0, colonIdx) : entryValue;
      const filePart = colonIdx >= 0 ? entryValue.substring(colonIdx + 1) : "axm.json";

      const axmJsonPath = path.join(sitePackages, modulePart, filePart);
      const axmJsonContent = yield* readFileOptional(axmJsonPath);
      if (Option.isNone(axmJsonContent)) return Option.none();

      // 6. Parse and validate axm.json
      const parsed = yield* parseJsonOptional(axmJsonContent.value, `${pkg.purl.name}/axm.json`);
      if (Option.isNone(parsed)) return Option.none();

      const metaResult = decodeAxmMeta(parsed.value);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(
          `Invalid axm metadata in ${pkg.purl.name}: schema validation failed`,
        );
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "pypi" }),
  ),
};
