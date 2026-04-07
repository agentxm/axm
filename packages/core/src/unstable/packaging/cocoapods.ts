/**
 * CocoaPods package detector and reader for package-compatibility discovery.
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

const cocoapodsType = Schema.decodeUnknownSync(PackageTypeSchema)("cocoapods");
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
 * Returns true if the specifier is an exact semver version (no range operators).
 */
const isExactVersion = (specifier: string): boolean =>
  /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9._+-]*)?$/.test(specifier);

/**
 * Convert a pod name (possibly with subspec) and version to a DetectedPackage.
 */
const podToPurl = (
  podFullName: string,
  version: string | undefined,
  source: string,
): DetectedPackage | undefined => {
  // Split on '/' to separate name from subspecs
  const parts = podFullName.split("/");
  const name = parts[0];
  if (name === undefined || name.length === 0) return undefined;

  const subpath = parts.length > 1 ? parts.slice(1).join("/") : null;
  const resolvedVersion = version !== undefined && isExactVersion(version) ? version : undefined;

  const purl = new PackageURL("cocoapods", null, name, resolvedVersion ?? null, null, subpath);
  const purlParts = decodePurl(purl.toString());

  return { purl: purlParts, type: cocoapodsType, source };
};

/**
 * Parse a Podfile and extract pod directives.
 *
 * Matches lines like:
 * - pod 'Alamofire', '~> 5.0'
 * - pod 'Alamofire', '5.6.2'
 * - pod 'Alamofire'
 * - pod 'ShareKit/Twitter'
 * - pod 'MyPod', :path => '../MyPod'  (skipped)
 * - pod 'MyPod', :git => 'https://...'  (skipped)
 */
const parsePodfile = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];

  // Match: pod 'Name' or pod "Name" with optional version and options
  const podPattern = /^\s*pod\s+['"]([^'"]+)['"]\s*(?:,\s*(.*))?$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;

    const match = podPattern.exec(trimmed);
    if (match === null) continue;

    const podName = match[1];
    const rest = match[2];

    if (podName === undefined) continue;

    // Skip :path and :git dependencies
    if (rest !== undefined) {
      if (rest.includes(":path") || rest.includes(":git")) continue;
    }

    // Extract version from rest
    let version: string | undefined;
    if (rest !== undefined) {
      // Match version string: '5.6.2' or '~> 5.0' or '>= 5.0'
      const versionMatch = /^['"]([^'"]+)['"]/.exec(rest.trim());
      if (versionMatch !== null && versionMatch[1] !== undefined) {
        const versionStr = versionMatch[1];
        // Only use exact versions, not ranges
        if (isExactVersion(versionStr)) {
          version = versionStr;
        }
      }
    }

    const detected = podToPurl(podName, version, source);
    if (detected !== undefined) results.push(detected);
  }

  return results;
};

/**
 * Parse a .podspec file and extract dependency directives.
 *
 * Matches lines like:
 * - s.dependency 'Alamofire', '~> 5.0'
 * - spec.dependency 'SwiftyJSON'
 * - ss.dependency 'Something'
 */
const parsePodspec = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];

  // Match: <var>.dependency 'Name', 'version' or <var>.dependency 'Name'
  const depPattern = /^\s*\w+\.dependency\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;

    const match = depPattern.exec(trimmed);
    if (match === null) continue;

    const depName = match[1];
    const versionStr = match[2];

    if (depName === undefined) continue;

    const version = versionStr !== undefined && isExactVersion(versionStr) ? versionStr : undefined;

    const detected = podToPurl(depName, version, source);
    if (detected !== undefined) results.push(detected);
  }

  return results;
};

/**
 * CocoaPods package detector.
 *
 * Scans `Podfile` and `*.podspec` files in the project directory
 * for pod dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const cocoapodsDetector: PackageDetector = {
  type: cocoapodsType,
  detect: Effect.fn("detect.cocoapods")(
    function* (projectDir: string) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const results: Array<DetectedPackage> = [];

      // Parse Podfile
      const podfilePath = path.join(projectDir, "Podfile");
      const podfileContent = yield* readFileOptional(podfilePath);
      if (Option.isSome(podfileContent)) {
        const deps = parsePodfile(podfileContent.value, podfilePath);
        results.push(...deps);
      }

      // Parse *.podspec files
      const dirEntries = yield* fs.readDirectory(projectDir).pipe(Effect.option);
      if (Option.isSome(dirEntries)) {
        const podspecFiles = dirEntries.value.filter((f) => f.endsWith(".podspec"));
        for (const podspecFile of podspecFiles) {
          const podspecPath = path.join(projectDir, podspecFile);
          const podspecContent = yield* readFileOptional(podspecPath);
          if (Option.isSome(podspecContent)) {
            const deps = parsePodspec(podspecContent.value, podspecPath);
            results.push(...deps);
          }
        }
      }

      return results;
    },
    Effect.annotateLogs({ detector: "cocoapods" }),
    Effect.withSpan("detect.cocoapods"),
  ),
};

/**
 * CocoaPods package reader.
 *
 * Reads `Pods/<pod-name>/axm.json` for each detected pod
 * and extracts recommendation metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const cocoapodsReader: PackageReader = {
  type: cocoapodsType,
  read: Effect.fn("read.cocoapods")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      // Derive project directory from the source manifest path
      const projectDir = path.dirname(pkg.source);

      // Pod name from purl
      const podName = pkg.purl.name;

      const axmJsonPath = path.join(projectDir, "Pods", podName, "axm.json");

      const content = yield* readFileOptional(axmJsonPath);
      if (Option.isNone(content)) return Option.none();

      const parsed = yield* parseJsonOptional(content.value, `${podName}/axm.json`);
      if (Option.isNone(parsed)) return Option.none();

      // Validate axm metadata structure
      const metaResult = decodeAxmMeta(parsed.value);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(`Invalid axm metadata in ${podName}: schema validation failed`);
        return Option.none();
      }

      return Option.some(metaResult.success.recommendedExtensions);
    },
    Effect.annotateLogs({ reader: "cocoapods" }),
    Effect.withSpan("read.cocoapods"),
  ),
};
