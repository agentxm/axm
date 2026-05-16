/**
 * Conan (C++) package detector and reader for package-compatibility discovery.
 *
 * Parses `conanfile.txt` `[requires]` sections and `conanfile.py` `requires`
 * attributes. Reads axm metadata from Conan cache `conandata.yml` or
 * `extension_properties`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:os homedir() has no @effect/platform equivalent.
import * as os from "node:os";

// eslint-disable-next-line no-restricted-properties -- Centralized env var access for packaging detectors
const readEnv = (name: string): string | undefined => process.env[name];
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { AxmPackageMetaSchema } from "./axm-package-meta.js";
import { PackageTypeSchema } from "./package-type.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const conanType = Schema.decodeUnknownSync(PackageTypeSchema)("conan");
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
 * Parse a Conan reference string like "name/version" or "name/version@user/channel".
 * Returns name and optional version.
 */
const parseConanRef = (
  ref: string,
): { readonly name: string; readonly version: string | undefined } | undefined => {
  const trimmed = ref.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return undefined;

  // Strip user/channel suffix if present: name/version@user/channel
  const atIdx = trimmed.indexOf("@");
  const refPart = atIdx >= 0 ? trimmed.slice(0, atIdx) : trimmed;

  const slashIdx = refPart.indexOf("/");
  if (slashIdx <= 0) return undefined;

  const name = refPart.slice(0, slashIdx).trim();
  const version = refPart.slice(slashIdx + 1).trim();

  if (name === "") return undefined;

  return { name, version: version !== "" ? version : undefined };
};

/**
 * Parse `conanfile.txt` content and extract dependencies from [requires] section.
 */
const parseConanfileTxt = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];
  let inRequiresSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section header
    if (trimmed.startsWith("[")) {
      inRequiresSection = trimmed === "[requires]";
      continue;
    }

    if (!inRequiresSection) continue;
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const parsed = parseConanRef(trimmed);
    if (parsed !== undefined) {
      results.push({
        purl: {
          type: conanType,
          name: parsed.name,
          ...(parsed.version !== undefined ? { version: parsed.version } : {}),
        },
        type: conanType,
        source,
      });
    }
  }

  return results;
};

/**
 * Parse `conanfile.py` content and extract dependencies from `requires` attribute.
 * Looks for patterns like: requires = "name/version", "name2/version2"
 * and self.requires("name/version")
 */
const parseConanfilePy = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];
  const seenNames = new Set<string>();

  // Match class-level `requires = "ref", "ref2"` or `requires = ("ref", "ref2")`
  const classRequiresRegex = /requires\s*=\s*(?:\(([^)]*)\)|([^\n]*))/g;
  let match: RegExpExecArray | null;

  while ((match = classRequiresRegex.exec(content)) !== null) {
    const value = match[1] ?? match[2] ?? "";
    const refs = value.match(/"([^"]+)"/g);
    if (refs) {
      for (const quotedRef of refs) {
        const ref = quotedRef.slice(1, -1);
        const parsed = parseConanRef(ref);
        if (parsed !== undefined && !seenNames.has(parsed.name)) {
          seenNames.add(parsed.name);
          results.push({
            purl: {
              type: conanType,
              name: parsed.name,
              ...(parsed.version !== undefined ? { version: parsed.version } : {}),
            },
            type: conanType,
            source,
          });
        }
      }
    }
  }

  // Match self.requires("ref")
  const selfRequiresRegex = /self\.requires\s*\(\s*"([^"]+)"/g;
  while ((match = selfRequiresRegex.exec(content)) !== null) {
    const ref = match[1];
    if (ref === undefined) continue;
    const parsed = parseConanRef(ref);
    if (parsed !== undefined && !seenNames.has(parsed.name)) {
      seenNames.add(parsed.name);
      results.push({
        purl: {
          type: conanType,
          name: parsed.name,
          ...(parsed.version !== undefined ? { version: parsed.version } : {}),
        },
        type: conanType,
        source,
      });
    }
  }

  return results;
};

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

/**
 * Conan package detector.
 *
 * Scans `conanfile.txt` `[requires]` section and `conanfile.py` `requires`
 * attribute in the project directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const conanDetector: PackageDetector = {
  type: conanType,
  detect: Effect.fn("detect.conan")(
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

      // 1. conanfile.txt
      const conanfileTxtPath = path.join(projectDir, "conanfile.txt");
      const conanfileTxtContent = yield* readFileOptional(conanfileTxtPath);
      if (Option.isSome(conanfileTxtContent)) {
        addUnique(parseConanfileTxt(conanfileTxtContent.value, conanfileTxtPath));
      }

      // 2. conanfile.py
      const conanfilePyPath = path.join(projectDir, "conanfile.py");
      const conanfilePyContent = yield* readFileOptional(conanfilePyPath);
      if (Option.isSome(conanfilePyContent)) {
        addUnique(parseConanfilePy(conanfilePyContent.value, conanfilePyPath));
      }

      return allPackages;
    },
    Effect.annotateLogs({ detector: "conan" }),
    Effect.withSpan("detect.conan"),
  ),
};

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/**
 * Parse YAML content, returning Option.none and logging a warning on failure.
 */
const parseYamlOptional = (content: string, context: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.try({
      try: (): unknown => YAML.parse(content),
      catch: () => ({ _tag: "YamlParseError" as const }),
    }).pipe(Effect.option);

    if (Option.isNone(result)) {
      yield* Effect.logWarning(`Malformed YAML in ${context}, skipping`);
      return Option.none<unknown>();
    }

    return Option.some(result.value);
  });

/** Schema for extracting the axm field from conandata.yml */
const ConanDataAxmSchema = Schema.Struct({
  axm: Schema.optional(Schema.Unknown),
});
const decodeConanDataAxm = Schema.decodeUnknownResult(ConanDataAxmSchema);

/**
 * Resolve the Conan cache directory.
 * Checks CONAN_USER_HOME, then defaults to ~/.conan2.
 */
const resolveConanCache = () =>
  Effect.sync(() => readEnv("CONAN_USER_HOME") ?? `${os.homedir()}/.conan2`);

/**
 * Conan package reader.
 *
 * Reads axm metadata from `conandata.yml` in the Conan cache or
 * `extension_properties` for each detected Conan package.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const conanReader: PackageReader = {
  type: conanType,
  read: Effect.fn("read.conan")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const conanCache = yield* resolveConanCache();

      // Try conandata.yml in the package's cache directory
      const version = pkg.purl.version ?? "0.0.0";
      const conanDataPath = path.join(
        conanCache,
        "p",
        pkg.purl.name,
        version,
        "export",
        "conandata.yml",
      );

      const content = yield* readFileOptional(conanDataPath);
      if (Option.isNone(content)) return Option.none();

      const parsed = yield* parseYamlOptional(content.value, `${pkg.purl.name}/conandata.yml`);
      if (Option.isNone(parsed)) return Option.none();

      // Extract axm metadata from conandata.yml
      const containerResult = decodeConanDataAxm(parsed.value);
      if (Result.isFailure(containerResult)) return Option.none();

      const axmRaw = containerResult.success.axm;
      if (axmRaw === undefined) return Option.none();

      const metaResult = decodeAxmMeta(axmRaw);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(
          `Invalid axm metadata in ${pkg.purl.name}: schema validation failed`,
        );
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "conan" }),
    Effect.withSpan("read.conan"),
  ),
};
