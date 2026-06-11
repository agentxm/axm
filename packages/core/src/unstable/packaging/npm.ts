/**
 * npm package detector and reader for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { PackageURL } from "packageurl-js";
import { PackageTypeSchema } from "./package-type.js";
import { decodeAxmMeta, decodePurl, parseJsonOptional, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const npmType = Schema.decodeUnknownSync(PackageTypeSchema)("npm");

/** Schema to extract the optional "axm" field from a package.json object. */
const AxmContainerSchema = Schema.Struct({
  axm: Schema.optional(Schema.Unknown),
});
const decodeAxmContainer = Schema.decodeUnknownResult(AxmContainerSchema);

/** Prefixes that indicate non-registry specifiers to skip. */
const SKIP_PREFIXES = ["file:", "link:", "workspace:", "git+", "git:", "github:"] as const;

/** Returns true if the specifier should be skipped (non-registry). */
const isSkippedSpecifier = (specifier: string): boolean => {
  if (SKIP_PREFIXES.some((prefix) => specifier.startsWith(prefix))) return true;
  // URL-based specifiers
  if (specifier.startsWith("http://") || specifier.startsWith("https://")) return true;
  return false;
};

/**
 * Returns true if the specifier is an exact semver version (no range operators).
 * Exact versions match: digits and dots only, e.g. "18.2.0", "1.0.0-beta.1".
 */
const isExactVersion = (specifier: string): boolean =>
  /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9._+-]*)?$/.test(specifier);

/**
 * Parse an npm alias specifier like "npm:real-name@version" or "npm:@scope/name@version".
 * Returns { name, specifier } where name is the real package name and specifier is the version part.
 */
const parseNpmAlias = (
  specifier: string,
): { readonly name: string; readonly specifier: string } | undefined => {
  if (!specifier.startsWith("npm:")) return undefined;
  const rest = specifier.slice(4); // Remove "npm:" prefix

  // Handle scoped: npm:@scope/name@version
  if (rest.startsWith("@")) {
    const atIdx = rest.indexOf("@", 1);
    if (atIdx === -1) return { name: rest, specifier: "*" };
    return { name: rest.slice(0, atIdx), specifier: rest.slice(atIdx + 1) };
  }

  // Handle unscoped: npm:name@version
  const atIdx = rest.indexOf("@");
  if (atIdx === -1) return { name: rest, specifier: "*" };
  return { name: rest.slice(0, atIdx), specifier: rest.slice(atIdx + 1) };
};

/**
 * Parse a package name into namespace and name parts.
 * "@scope/name" -> { namespace: "@scope", name: "name" }
 * "name" -> { name: "name" }
 */
const parsePackageName = (
  pkgName: string,
): { readonly namespace?: string; readonly name: string } => {
  if (pkgName.startsWith("@")) {
    const slashIdx = pkgName.indexOf("/");
    if (slashIdx > 0) {
      return { namespace: pkgName.slice(0, slashIdx), name: pkgName.slice(slashIdx + 1) };
    }
  }
  return { name: pkgName };
};

/**
 * Convert a single dependency entry to a DetectedPackage, or undefined if skipped.
 */
const depToPurl = (
  depName: string,
  specifier: string,
  source: string,
): DetectedPackage | undefined => {
  if (isSkippedSpecifier(specifier)) return undefined;

  // Resolve npm aliases to real package name
  const alias = parseNpmAlias(specifier);
  const resolvedName = alias ? alias.name : depName;
  const resolvedSpecifier = alias ? alias.specifier : specifier;

  const { namespace, name } = parsePackageName(resolvedName);
  const version = isExactVersion(resolvedSpecifier) ? resolvedSpecifier : undefined;

  // Construct purl string and decode through schema
  const purl = new PackageURL("npm", namespace ?? null, name, version ?? null, null, null);
  const purlParts = decodePurl(purl.toString());

  return { purl: purlParts, type: npmType, source };
};

/**
 * Schema to loosely decode the dependency-relevant shape of package.json.
 * Accepts any object shape and extracts the three dependency sections
 * as optional string-to-string records.
 */
const DependencySectionsSchema = Schema.Struct({
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  peerDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

const decodeDependencySections = Schema.decodeUnknownResult(DependencySectionsSchema);

/**
 * Extract dependencies from a parsed package.json value.
 */
const extractDeps = (manifest: unknown, source: string): ReadonlyArray<DetectedPackage> => {
  const decoded = decodeDependencySections(manifest);
  if (Result.isFailure(decoded)) return [];

  const sections = [
    decoded.success.dependencies,
    decoded.success.devDependencies,
    decoded.success.peerDependencies,
  ] as const;
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
 * npm package detector.
 *
 * Scans `package.json` in the project directory and extracts dependencies
 * from `dependencies`, `devDependencies`, and `peerDependencies`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const npmDetector: PackageDetector = {
  type: npmType,
  detect: Effect.fn("detect.npm")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const manifestPath = path.join(projectDir, "package.json");

      const content = yield* readFileOptional(manifestPath);
      if (Option.isNone(content)) return [];

      const parsed = yield* parseJsonOptional(content.value, "package.json");
      if (Option.isNone(parsed)) return [];

      return extractDeps(parsed.value, manifestPath);
    },
    Effect.annotateLogs({ detector: "npm" }),
    Effect.withSpan("detect.npm"),
  ),
};

/**
 * npm package reader.
 *
 * Reads `node_modules/<name>/package.json` for each detected npm package
 * and extracts the `"axm"` field containing recommendation metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const npmReader: PackageReader = {
  type: npmType,
  read: Effect.fn("read.npm")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      // Derive project directory from the source manifest path
      const projectDir = path.dirname(pkg.source);

      // Reconstruct the package name from purl parts
      const pkgName = pkg.purl.namespace ? `${pkg.purl.namespace}/${pkg.purl.name}` : pkg.purl.name;

      const pkgJsonPath = path.join(projectDir, "node_modules", pkgName, "package.json");

      const content = yield* readFileOptional(pkgJsonPath);
      if (Option.isNone(content)) return Option.none();

      const parsed = yield* parseJsonOptional(content.value, pkgName);
      if (Option.isNone(parsed)) return Option.none();

      // Extract and validate the "axm" field using schema
      const axmContainerResult = decodeAxmContainer(parsed.value);
      if (Result.isFailure(axmContainerResult)) {
        // No valid axm field present (or missing entirely)
        return Option.none();
      }

      const axmRaw = axmContainerResult.success.axm;
      if (axmRaw === undefined) return Option.none();

      // Validate axm metadata structure
      const metaResult = decodeAxmMeta(axmRaw);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(`Invalid axm metadata in ${pkgName}: schema validation failed`);
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "npm" }),
    Effect.withSpan("read.npm"),
  ),
};
