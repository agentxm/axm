/**
 * CPAN (Perl) package detector and reader for package-compatibility discovery.
 *
 * Parses `cpanfile` (`requires 'Name'` lines) and `Makefile.PL` (`PREREQ_PM`).
 * Reads `x_axm` from `<lib-path>/.meta/<dist>/MYMETA.json`.
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

const cpanType = Schema.decodeUnknownSync(PackageTypeSchema)("cpan");
const decodeAxmMeta = Schema.decodeUnknownResult(AxmPackageMetaSchema);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Convert a Perl module name to a CPAN distribution-style name.
 * Module names use :: as separator (e.g., Moose::Util),
 * distribution names use - (e.g., Moose-Util).
 */
const moduleToDistName = (moduleName: string): string => moduleName.replace(/::/g, "-");

/**
 * Parse a `cpanfile` and extract dependencies.
 * Format: requires 'Module::Name', 'version';
 *         requires 'Module::Name';
 */
const parseCpanfile = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];
  const seenNames = new Set<string>();

  // Match: requires 'Name' or requires 'Name', 'version'
  // Also: requires "Name" or requires "Name", "version"
  const requiresRegex = /requires\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?;/g;
  let match: RegExpExecArray | null;

  while ((match = requiresRegex.exec(content)) !== null) {
    const moduleName = match[1];
    if (moduleName === undefined) continue;

    const name = moduleToDistName(moduleName);
    if (seenNames.has(name)) continue;
    seenNames.add(name);

    const versionSpec = match[2]?.trim();
    // Only exact versions (no ranges)
    const version =
      versionSpec !== undefined && /^\d+(?:\.\d+)*$/.test(versionSpec) ? versionSpec : undefined;

    results.push({
      purl: {
        type: cpanType,
        name,
        ...(version !== undefined ? { version } : {}),
      },
      type: cpanType,
      source,
    });
  }

  return results;
};

/**
 * Parse `Makefile.PL` and extract dependencies from PREREQ_PM.
 * Format: PREREQ_PM => { 'Module::Name' => 'version', ... }
 */
const parseMakefilePL = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];
  const seenNames = new Set<string>();

  // Match PREREQ_PM => { ... } block
  const prereqMatch = /PREREQ_PM\s*=>\s*\{([^}]*)}/s.exec(content);
  if (!prereqMatch) return [];

  const block = prereqMatch[1] ?? "";

  // Match 'Module::Name' => 'version' or "Module::Name" => "version"
  const entryRegex = /['"]([^'"]+)['"]\s*=>\s*['"]?([^'",}]*?)['"]?\s*(?:,|$)/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(block)) !== null) {
    const moduleName = match[1];
    if (moduleName === undefined) continue;

    const name = moduleToDistName(moduleName);
    if (seenNames.has(name)) continue;
    seenNames.add(name);

    const versionSpec = match[2]?.trim();
    const version =
      versionSpec !== undefined && versionSpec !== "" && /^\d+(?:\.\d+)*$/.test(versionSpec)
        ? versionSpec
        : undefined;

    results.push({
      purl: {
        type: cpanType,
        name,
        ...(version !== undefined ? { version } : {}),
      },
      type: cpanType,
      source,
    });
  }

  return results;
};

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

/**
 * CPAN package detector.
 *
 * Scans `cpanfile` and `Makefile.PL` in the project directory and extracts
 * dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const cpanDetector: PackageDetector = {
  type: cpanType,
  detect: Effect.fn("detect.cpan")(
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

      // 1. cpanfile
      const cpanfilePath = path.join(projectDir, "cpanfile");
      const cpanfileContent = yield* readFileOptional(cpanfilePath);
      if (Option.isSome(cpanfileContent)) {
        addUnique(parseCpanfile(cpanfileContent.value, cpanfilePath));
      }

      // 2. Makefile.PL
      const makefilePath = path.join(projectDir, "Makefile.PL");
      const makefileContent = yield* readFileOptional(makefilePath);
      if (Option.isSome(makefileContent)) {
        addUnique(parseMakefilePL(makefileContent.value, makefilePath));
      }

      return allPackages;
    },
    Effect.annotateLogs({ detector: "cpan" }),
    Effect.withSpan("detect.cpan"),
  ),
};

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/** Schema for extracting the x_axm field from MYMETA.json. */
const MymetaAxmSchema = Schema.Struct({
  x_axm: Schema.optional(Schema.Unknown),
});
const decodeMymetaAxm = Schema.decodeUnknownResult(MymetaAxmSchema);

/**
 * CPAN package reader.
 *
 * Reads `x_axm` from `<lib-path>/.meta/<dist>/MYMETA.json` for each
 * detected CPAN package and extracts recommendation metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const cpanReader: PackageReader = {
  type: cpanType,
  read: Effect.fn("read.cpan")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      // Default Perl local::lib path
      const libPath = yield* Effect.sync(
        () => readEnv("PERL5LIB") ?? readEnv("PERL_LOCAL_LIB_ROOT") ?? "local/lib/perl5",
      );

      const distName = pkg.purl.name;
      const version = pkg.purl.version;
      const metaDir = version !== undefined ? `${distName}-${version}` : distName;
      const mymetaPath = path.join(libPath, ".meta", metaDir, "MYMETA.json");

      const content = yield* readFileOptional(mymetaPath);
      if (Option.isNone(content)) return Option.none();

      const parsed = yield* parseJsonOptional(content.value, `${distName}/MYMETA.json`);
      if (Option.isNone(parsed)) return Option.none();

      // Extract x_axm metadata
      const containerResult = decodeMymetaAxm(parsed.value);
      if (Result.isFailure(containerResult)) return Option.none();

      const axmRaw = containerResult.success.x_axm;
      if (axmRaw === undefined) return Option.none();

      const metaResult = decodeAxmMeta(axmRaw);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(`Invalid axm metadata in ${distName}: schema validation failed`);
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "cpan" }),
    Effect.withSpan("read.cpan"),
  ),
};
