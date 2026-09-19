/**
 * Dart/Flutter pub package detector and reader for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:url URL <-> path conversion has no @effect/platform equivalent.
import { fileURLToPath, pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { PackageURL } from "packageurl-js";
import YAML from "yaml";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import {
  decodeAgentExtensions,
  decodePurl,
  parseJsonOptional,
  readFileOptional,
} from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const pubType = Schema.decodeUnknownSync(PackageTypeSchema)("pub");

/** Pub package names must be lowercase `[a-z0-9_]` only. */
const VALID_PUB_NAME = /^[a-z0-9_]+$/;

/**
 * Returns true if the specifier is an exact semver version (no range operators).
 * Exact versions match: digits and dots only, e.g. "1.2.0", "1.0.0+1".
 */
const isExactVersion = (specifier: string): boolean =>
  /^\d+\.\d+\.\d+(?:[+][a-zA-Z0-9._+-]*)?$/.test(specifier);

/**
 * Minimal line-based YAML parser for pubspec.yaml dependency sections.
 * Extracts `dependencies:` and `dev_dependencies:` maps.
 *
 * Returns a record of dependency name -> value string (version or structured).
 * Only handles flat key-value pairs and detects structured entries (path/git/sdk).
 */
const parsePubspecDeps = (
  content: string,
): {
  readonly deps: ReadonlyArray<{
    readonly name: string;
    readonly version: string | undefined;
    readonly isSkipped: boolean;
  }>;
} => {
  const lines = content.split("\n");
  const deps: Array<{
    readonly name: string;
    readonly version: string | undefined;
    readonly isSkipped: boolean;
  }> = [];
  let inDepSection = false;
  let currentDepName: string | undefined;
  let currentDepIsStructured = false;

  for (const line of lines) {
    // Skip comments
    if (line.trimStart().startsWith("#")) continue;

    // Detect top-level section headers (no leading whitespace)
    if (!line.startsWith(" ") && !line.startsWith("\t") && line.trim().length > 0) {
      const trimmed = line.trim();
      if (trimmed === "dependencies:" || trimmed === "dev_dependencies:") {
        inDepSection = true;
        currentDepName = undefined;
        currentDepIsStructured = false;
        continue;
      }
      // Any other top-level key ends the section
      if (trimmed.endsWith(":") || trimmed.includes(":")) {
        inDepSection = false;
        currentDepName = undefined;
        currentDepIsStructured = false;
        continue;
      }
    }

    if (!inDepSection) continue;

    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Determine indentation level
    const indent = line.length - line.trimStart().length;

    // dep-level entry (typically 2 spaces or 1 tab)
    if (indent > 0 && indent <= 4 && !trimmed.startsWith("-")) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const name = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      currentDepName = name;
      currentDepIsStructured = false;

      if (value.length === 0) {
        // Structured dependency follows on next lines
        currentDepIsStructured = true;
        continue;
      }

      // Simple version string: `http: ^1.0.0` or `http: 1.2.0` or `http: any`
      deps.push({ name, version: value, isSkipped: false });
      currentDepName = undefined;
    } else if (indent > 4 && currentDepName !== undefined && currentDepIsStructured) {
      // Sub-key of a structured dependency
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;
      const subKey = trimmed.slice(0, colonIdx).trim();

      if (subKey === "path" || subKey === "git" || subKey === "sdk") {
        deps.push({ name: currentDepName, version: undefined, isSkipped: true });
        currentDepName = undefined;
        currentDepIsStructured = false;
      } else if (subKey === "version") {
        const subValue = trimmed.slice(colonIdx + 1).trim();
        // Hosted dependency with explicit version
        deps.push({ name: currentDepName, version: subValue, isSkipped: false });
        currentDepName = undefined;
        currentDepIsStructured = false;
      }
    }
  }

  return { deps };
};

/**
 * Convert a parsed pub dependency to a DetectedPackage, or undefined if skipped.
 */
const depToPurl = (
  name: string,
  version: string | undefined,
  isSkipped: boolean,
  source: string,
): DetectedPackage | undefined => {
  if (isSkipped) return undefined;
  if (!VALID_PUB_NAME.test(name)) return undefined;

  const resolvedVersion = version !== undefined && isExactVersion(version) ? version : undefined;

  const purl = new PackageURL("pub", null, name, resolvedVersion ?? null, null, null);
  const purlParts = decodePurl(purl.toString());

  return { purl: purlParts, type: pubType, source };
};

/**
 * Pub package detector.
 *
 * Scans `pubspec.yaml` in the project directory and extracts dependencies
 * from `dependencies` and `dev_dependencies`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const pubDetector: PackageDetector = {
  type: pubType,
  detect: Effect.fn("detect.pub")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const manifestPath = path.join(projectDir, "pubspec.yaml");

      const content = yield* readFileOptional(manifestPath);
      if (Option.isNone(content)) return [];

      // Basic validation: check if it looks like YAML
      const trimmed = content.value.trim();
      if (trimmed.length === 0) return [];

      // Check for obviously malformed YAML
      if (trimmed.startsWith("{") && !trimmed.includes(":")) {
        yield* Effect.logWarning("Malformed pubspec.yaml, skipping");
        return [];
      }

      const { deps } = parsePubspecDeps(content.value);
      const results: Array<DetectedPackage> = [];

      for (const dep of deps) {
        const detected = depToPurl(dep.name, dep.version, dep.isSkipped, manifestPath);
        if (detected !== undefined) results.push(detected);
      }

      return results;
    },
    Effect.annotateLogs({ detector: "pub" }),
    Effect.withSpan("detect.pub"),
  ),
};

/**
 * Schema for package_config.json package entries.
 */
const PackageConfigEntrySchema = Schema.Struct({
  name: Schema.String,
  rootUri: Schema.String,
});

const PackageConfigSchema = Schema.Struct({
  packages: Schema.optional(Schema.Array(PackageConfigEntrySchema)),
});

const decodePackageConfig = Schema.decodeUnknownResult(PackageConfigSchema);

/**
 * Resolve a `package_config.json` `rootUri` to an absolute filesystem path.
 *
 * `rootUri` is a URI reference resolved against the location of
 * `package_config.json` (the `.dart_tool/` directory). A real `dart pub get`
 * writes absolute `file://` URIs for hosted packages, while path dependencies
 * and hand-written configs may use relative paths; resolving as a URL handles
 * both and decodes any percent-encoding. `path.resolve` cannot be used here —
 * it has no notion of URI schemes and mangles `file://` values into garbage
 * paths. Returns `Option.none` for a `rootUri` that is not a resolvable
 * `file:` location.
 */
const resolvePackageRoot = (dartToolDir: string, rootUri: string): Option.Option<string> => {
  try {
    const baseUrl = new URL(`${pathToFileURL(dartToolDir).href}/`);
    return Option.some(fileURLToPath(new URL(rootUri, baseUrl)));
  } catch {
    return Option.none();
  }
};

/**
 * Pub package reader.
 *
 * Reads `.dart_tool/package_config.json` to locate the package root,
 * then reads `pubspec.yaml` and extracts the top-level `agentExtensions` array.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const pubReader: PackageReader = {
  type: pubType,
  read: Effect.fn("read.pub")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      // Derive project directory from the source manifest path
      const projectDir = path.dirname(pkg.source);

      // Read .dart_tool/package_config.json
      const packageConfigPath = path.join(projectDir, ".dart_tool", "package_config.json");
      const configContent = yield* readFileOptional(packageConfigPath);
      if (Option.isNone(configContent)) return Option.none();

      const configParsed = yield* parseJsonOptional(configContent.value, "package_config.json");
      if (Option.isNone(configParsed)) return Option.none();

      const configResult = decodePackageConfig(configParsed.value);
      if (Result.isFailure(configResult)) return Option.none();

      const packages = configResult.success.packages;
      if (packages === undefined) return Option.none();

      // Find the package entry matching our detected package name
      const pkgEntry = packages.find((p) => p.name === pkg.purl.name);
      if (pkgEntry === undefined) return Option.none();

      // Resolve rootUri against the .dart_tool/ directory. package_config.json
      // entries are URI references — a real `dart pub get` writes absolute
      // `file://` URIs for hosted packages — so resolve as a URL, not a path.
      const dartToolDir = path.resolve(projectDir, ".dart_tool");
      const packageRoot = resolvePackageRoot(dartToolDir, pkgEntry.rootUri);
      if (Option.isNone(packageRoot)) return Option.none();

      // Read pubspec.yaml from package root
      const pubspecPath = path.join(packageRoot.value, "pubspec.yaml");
      const pubspecContent = yield* readFileOptional(pubspecPath);
      if (Option.isNone(pubspecContent)) return Option.none();

      const metadata = yield* Effect.try({
        try: (): unknown => YAML.parse(pubspecContent.value),
        catch: () => ({ _tag: "YamlParseError" as const }),
      }).pipe(Effect.option);
      if (Option.isNone(metadata)) return Option.none();

      const metaResult = yield* decodeAgentExtensions(metadata.value);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(
          `Invalid agentExtensions metadata in ${pkg.purl.name}: schema validation failed`,
        );
        return Option.none();
      }

      return Option.some(metaResult.success.agentExtensions);
    },
    Effect.annotateLogs({ reader: "pub" }),
    Effect.withSpan("read.pub"),
  ),
};
