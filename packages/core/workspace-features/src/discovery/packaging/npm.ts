/**
 * npm package detector and reader for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { valid } from "semver";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { makeDetectedPackage } from "./detected-package.js";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { parseJsonOptional, readAgentExtensions, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const npmType = Schema.decodeUnknownSync(PackageTypeSchema)("npm");

/** Schema to detect the portable field in a package.json object. */
const AgentExtensionsContainerSchema = Schema.Struct({
  agentExtensions: Schema.optional(Schema.Unknown),
});
const decodeAgentExtensionsContainer = Schema.decodeUnknownResult(AgentExtensionsContainerSchema);

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
 * Describe dependency intent before local resolution supplies authoritative package facts.
 */
const depToPurl = (
  depName: string,
  specifier: string,
  source: string,
): DetectedPackage | undefined => {
  // Resolve npm aliases to real package name
  const alias = parseNpmAlias(specifier);
  const resolvedName = alias ? alias.name : depName;
  const resolvedSpecifier = alias ? alias.specifier : specifier;

  const { namespace, name } = parsePackageName(resolvedName);
  const version = isExactVersion(resolvedSpecifier) ? resolvedSpecifier : undefined;

  return Option.getOrUndefined(
    makeDetectedPackage({
      type: npmType,
      ...(namespace === undefined ? {} : { namespace }),
      name,
      ...(version === undefined ? {} : { version }),
      source,
    }),
  );
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
  optionalDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

const decodeDependencySections = Schema.decodeUnknownResult(DependencySectionsSchema);

const InstalledPackageSchema = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
});
const decodeInstalledPackage = Schema.decodeUnknownResult(InstalledPackageSchema);

// A dependency key is a package name, never an arbitrary filesystem path.
const isPackageName = (name: string): boolean =>
  /^(?:@[a-z0-9._~-]+\/)?[a-z0-9_~][a-z0-9._~-]*$/iu.test(name);

const localDirectory = (specifier: string): string | undefined => {
  for (const prefix of ["file:", "link:", "workspace:"]) {
    if (!specifier.startsWith(prefix)) continue;
    const relative = specifier.slice(prefix.length);
    if (prefix !== "workspace:" || relative.startsWith(".")) return relative;
  }
  return undefined;
};

/** Resolve the declared installation key, including aliases and hoisted dependencies. */
const resolveMetadataPath = Effect.fn("discover.npm.resolveMetadataPath")(function* (
  projectDir: string,
  name: string,
  specifier: string,
) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  let directory = path.resolve(projectDir);
  while (true) {
    if (path.basename(directory) !== "node_modules") {
      const candidate = path.join(directory, "node_modules", name, "package.json");
      if (yield* fs.exists(candidate)) return Option.some(candidate);
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  const local = localDirectory(specifier);
  if (local !== undefined) {
    const candidate = path.resolve(projectDir, local, "package.json");
    if (yield* fs.exists(candidate)) return Option.some(candidate);
  }
  return Option.none<string>();
});

const resolveDependency = Effect.fn("discover.npm.resolveDependency")(function* (
  declaration: { readonly name: string; readonly specifier: string },
  source: string,
) {
  const path = yield* Path.Path;
  const fallback = depToPurl(declaration.name, declaration.specifier, source);
  const unresolved =
    fallback === undefined
      ? undefined
      : {
          ...fallback,
          declaration,
          resolution: { state: "unavailable" as const },
        };
  if (!isPackageName(declaration.name)) return undefined;
  const metadataPath = yield* resolveMetadataPath(
    path.dirname(source),
    declaration.name,
    declaration.specifier,
  );
  if (Option.isNone(metadataPath)) return unresolved;
  const content = yield* readFileOptional(metadataPath.value);
  if (Option.isNone(content)) return unresolved;
  const parsed = yield* parseJsonOptional(content.value, metadataPath.value);
  if (Option.isNone(parsed)) return unresolved;
  const decoded = decodeInstalledPackage(parsed.value);
  if (
    Result.isFailure(decoded) ||
    !isPackageName(decoded.success.name) ||
    valid(decoded.success.version) === null
  ) {
    yield* Effect.logWarning(
      `Invalid installed package identity in ${metadataPath.value}, skipping`,
    );
    return unresolved;
  }
  const detected = makeDetectedPackage({
    type: npmType,
    ...parsePackageName(decoded.success.name),
    version: decoded.success.version,
    source,
  });
  return Option.isNone(detected)
    ? unresolved
    : {
        ...detected.value,
        declaration,
        resolution: { state: "resolved" as const, metadataPath: metadataPath.value },
      };
});

/** Keep declaration provenance until the adapter has observed the actual package. */
const extractDeps = Effect.fn("discover.npm.extractDeps")(function* (
  manifest: unknown,
  source: string,
) {
  const decoded = decodeDependencySections(manifest);
  if (Result.isFailure(decoded)) return [];
  // Optional dependencies override the same key in dependencies, as npm specifies.
  const dependencies = {
    ...decoded.success.peerDependencies,
    ...decoded.success.devDependencies,
    ...decoded.success.dependencies,
    ...decoded.success.optionalDependencies,
  };
  const results = yield* Effect.forEach(Object.entries(dependencies), ([name, specifier]) =>
    resolveDependency({ name, specifier }, source),
  );
  return results.filter((result) => result !== undefined);
});

/**
 * npm package detector.
 *
 * Scans `package.json` in the project directory and extracts dependencies
 * from dependency sections, then resolves installed or explicitly local metadata.
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

      return yield* extractDeps(parsed.value, manifestPath);
    },
    Effect.annotateLogs({ detector: "npm" }),
    Effect.withSpan("detect.npm"),
  ),
};

/**
 * npm package reader.
 *
 * Reads the resolved metadata location and extracts the portable recommendations.
 * Identity must still match the detector observation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const npmReader: PackageReader = {
  type: npmType,
  read: Effect.fn("read.npm")(
    function* (pkg: DetectedPackage) {
      if (pkg.resolution?.state !== "resolved") return Option.none();
      const content = yield* readFileOptional(pkg.resolution.metadataPath);
      if (Option.isNone(content)) return Option.none();
      const parsed = yield* parseJsonOptional(content.value, pkg.resolution.metadataPath);
      if (Option.isNone(parsed)) return Option.none();
      const identity = decodeInstalledPackage(parsed.value);
      const pkgName = pkg.purl.namespace ? `${pkg.purl.namespace}/${pkg.purl.name}` : pkg.purl.name;
      if (
        Result.isFailure(identity) ||
        identity.success.name !== pkgName ||
        identity.success.version !== pkg.purl.version
      ) {
        yield* Effect.logWarning(
          `Package identity changed in ${pkg.resolution.metadataPath}, skipping`,
        );
        return Option.none();
      }

      const containerResult = decodeAgentExtensionsContainer(parsed.value);
      if (Result.isFailure(containerResult)) {
        return Option.none();
      }

      if (containerResult.success.agentExtensions === undefined) return Option.none();

      return yield* readAgentExtensions(parsed.value, `${pkgName}`);
    },
    Effect.annotateLogs({ reader: "npm" }),
    Effect.withSpan("read.npm"),
  ),
};
