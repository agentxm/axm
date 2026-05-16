/**
 * Composer package detector and reader for package-compatibility discovery.
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
import { PackageURL } from "packageurl-js";
import { AxmPackageMetaSchema } from "./axm-package-meta.js";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlSchema } from "./package-url.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const composerType = Schema.decodeUnknownSync(PackageTypeSchema)("composer");
const decodePurl = Schema.decodeUnknownSync(PackageUrlSchema);
const decodeAxmMeta = Schema.decodeUnknownResult(AxmPackageMetaSchema);

/** Schema to extract the optional "extra" field from a composer.json object. */
const ExtraContainerSchema = Schema.Struct({
  extra: Schema.optional(
    Schema.Struct({
      axm: Schema.optional(Schema.Unknown),
    }),
  ),
});
const decodeExtraContainer = Schema.decodeUnknownResult(ExtraContainerSchema);

/**
 * Returns true if the specifier is an exact semver version (no range operators).
 * Exact versions match: digits and dots only, e.g. "7.5.0", "1.0.0-beta.1".
 */
const isExactVersion = (specifier: string): boolean =>
  /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9._+-]*)?$/.test(specifier);

/** Returns true if the dependency key is a platform requirement. */
const isPlatformRequirement = (name: string): boolean => name === "php" || name.startsWith("ext-");

/**
 * Convert a single composer dependency entry to a DetectedPackage, or undefined if skipped.
 */
const depToPurl = (
  depName: string,
  specifier: string,
  source: string,
): DetectedPackage | undefined => {
  if (isPlatformRequirement(depName)) return undefined;

  // Composer packages must be vendor/name format
  const slashIdx = depName.indexOf("/");
  if (slashIdx <= 0) return undefined;

  const namespace = depName.slice(0, slashIdx).toLowerCase();
  const name = depName.slice(slashIdx + 1).toLowerCase();
  const version = isExactVersion(specifier) ? specifier : undefined;

  const purl = new PackageURL("composer", namespace, name, version ?? null, null, null);
  const purlParts = decodePurl(purl.toString());

  return { purl: purlParts, type: composerType, source };
};

/**
 * Schema to loosely decode the dependency-relevant shape of composer.json.
 */
const DependencySectionsSchema = Schema.Struct({
  require: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  "require-dev": Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

const decodeDependencySections = Schema.decodeUnknownResult(DependencySectionsSchema);

/**
 * Extract dependencies from a parsed composer.json value.
 */
const extractDeps = (manifest: unknown, source: string): ReadonlyArray<DetectedPackage> => {
  const decoded = decodeDependencySections(manifest);
  if (Result.isFailure(decoded)) return [];

  const sections = [decoded.success.require, decoded.success["require-dev"]] as const;
  const results: Array<DetectedPackage> = [];

  for (const deps of sections) {
    if (deps === undefined) continue;
    for (const [name, specifier] of Object.entries(deps)) {
      const detected = depToPurl(name, specifier, source);
      if (detected !== undefined) results.push(detected);
    }
  }

  return results;
};

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
 * Composer package detector.
 *
 * Scans `composer.json` in the project directory and extracts dependencies
 * from `require` and `require-dev`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const composerDetector: PackageDetector = {
  type: composerType,
  detect: Effect.fn("detect.composer")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const manifestPath = path.join(projectDir, "composer.json");

      const content = yield* readFileOptional(manifestPath);
      if (Option.isNone(content)) return [];

      const parsed = yield* parseJsonOptional(content.value, "composer.json");
      if (Option.isNone(parsed)) return [];

      return extractDeps(parsed.value, manifestPath);
    },
    Effect.annotateLogs({ detector: "composer" }),
    Effect.withSpan("detect.composer"),
  ),
};

/**
 * Composer package reader.
 *
 * Reads `vendor/<namespace>/<name>/composer.json` for each detected Composer
 * package and extracts the `"extra"."axm"` field containing recommendation metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const composerReader: PackageReader = {
  type: composerType,
  read: Effect.fn("read.composer")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      // Derive project directory from the source manifest path
      const projectDir = path.dirname(pkg.source);

      // Reconstruct the package path from purl parts
      const pkgPath = pkg.purl.namespace ? `${pkg.purl.namespace}/${pkg.purl.name}` : pkg.purl.name;

      const composerJsonPath = path.join(projectDir, "vendor", pkgPath, "composer.json");

      const content = yield* readFileOptional(composerJsonPath);
      if (Option.isNone(content)) return Option.none();

      const parsed = yield* parseJsonOptional(content.value, pkgPath);
      if (Option.isNone(parsed)) return Option.none();

      // Extract and validate the "extra"."axm" field using schema
      const extraContainerResult = decodeExtraContainer(parsed.value);
      if (Result.isFailure(extraContainerResult)) {
        return Option.none();
      }

      const extra = extraContainerResult.success.extra;
      if (extra === undefined) return Option.none();

      const axmRaw = extra.axm;
      if (axmRaw === undefined) return Option.none();

      // Validate axm metadata structure
      const metaResult = decodeAxmMeta(axmRaw);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(`Invalid axm metadata in ${pkgPath}: schema validation failed`);
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "composer" }),
    Effect.withSpan("read.composer"),
  ),
};
