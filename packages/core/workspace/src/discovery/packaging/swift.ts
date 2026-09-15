/**
 * Swift package detector and reader for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import {
  PackageUrlPartsSchema,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging/package-url";
import { decodeAxmMeta, parseJsonOptional, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const swiftType = Schema.decodeUnknownSync(PackageTypeSchema)("swift");
const makePackageUrlParts = Schema.decodeUnknownSync(PackageUrlPartsSchema);

/**
 * Regex to match `exact: "version"` in a package declaration.
 */
const EXACT_VERSION_REGEX = /exact:\s*"([^"]+)"/;

/**
 * Parse a Swift package URL into namespace and name parts.
 * URL format: https://github.com/Owner/RepoName.git
 * namespace = host/org, name = repo (without .git)
 */
const parseSwiftUrl = (
  url: string,
): { readonly namespace: string; readonly name: string } | undefined => {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter((p) => p.length > 0);
    if (pathParts.length < 2) return undefined;

    const host = parsed.hostname;
    // All segments except the last form the org path
    const orgParts = pathParts.slice(0, -1);
    const rawName = pathParts[pathParts.length - 1];
    if (rawName === undefined) return undefined;

    // Strip .git suffix
    const name = rawName.endsWith(".git") ? rawName.slice(0, -4) : rawName;
    const namespace = `${host}/${orgParts.join("/")}`;

    return { namespace, name };
  } catch {
    return undefined;
  }
};

/**
 * Extract the version requirement from a package declaration line/context.
 * Returns the exact version if specified, undefined otherwise (ranges are versionless).
 */
const extractVersion = (packageContext: string): string | undefined => {
  const exactMatch = EXACT_VERSION_REGEX.exec(packageContext);
  if (exactMatch?.[1] !== undefined) return exactMatch[1];
  return undefined;
};

/**
 * Build PackageUrlParts directly for swift packages.
 * packageurl-js v2 requires a version for swift type purls, but we need
 * versionless purls for range dependencies. We construct parts directly
 * through the PackageUrlPartsSchema to bypass purl-string validation.
 */
const buildSwiftPurlParts = (
  namespace: string,
  name: string,
  version: string | undefined,
): PackageUrlParts =>
  makePackageUrlParts(
    version !== undefined
      ? { type: "swift", namespace, name, version }
      : { type: "swift", namespace, name },
  );

/**
 * Parse Package.swift content and extract dependencies using regex.
 * Since running `swift package dump-package` requires the Swift CLI,
 * we use simple regex to extract `.package(url: "...")` dependencies.
 */
const parsePackageSwift = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  // Find all .package(url: "...") declarations
  // We search for the entire package(...) block to extract version info too
  const packageBlockRegex = /\.package\([^)]*url:\s*"([^"]+)"[^)]*\)/g;
  let match: RegExpExecArray | null;

  while ((match = packageBlockRegex.exec(content)) !== null) {
    const url = match[1];
    if (url === undefined) continue;

    const parsed = parseSwiftUrl(url);
    if (parsed === undefined) continue;

    // Extract version from the full match context
    const version = extractVersion(match[0]);

    const purlParts = buildSwiftPurlParts(parsed.namespace, parsed.name, version);

    results.push({ purl: purlParts, type: swiftType, source });
  }

  return results;
};

/**
 * Swift package detector.
 *
 * Scans `Package.swift` in the project directory and extracts `.package(url: ...)`
 * dependencies using regex pattern matching.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const swiftDetector: PackageDetector = {
  type: swiftType,
  detect: Effect.fn("detect.swift")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const manifestPath = path.join(projectDir, "Package.swift");

      const content = yield* readFileOptional(manifestPath);
      if (Option.isNone(content)) return [];

      const deps = parsePackageSwift(content.value, manifestPath);
      return deps;
    },
    Effect.annotateLogs({ detector: "swift" }),
    Effect.withSpan("detect.swift"),
  ),
};

/**
 * Swift package reader.
 *
 * Reads `.build/checkouts/<package-name>/axm.json` for each detected SwiftPM
 * package and extracts recommendation metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const swiftReader: PackageReader = {
  type: swiftType,
  read: Effect.fn("read.swift")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      // Derive project directory from the source manifest path
      const projectDir = path.dirname(pkg.source);

      const axmJsonPath = path.join(projectDir, ".build", "checkouts", pkg.purl.name, "axm.json");

      const content = yield* readFileOptional(axmJsonPath);
      if (Option.isNone(content)) return Option.none();

      const parsed = yield* parseJsonOptional(content.value, `${pkg.purl.name}/axm.json`);
      if (Option.isNone(parsed)) return Option.none();

      // Validate axm metadata structure
      const metaResult = decodeAxmMeta(parsed.value);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(
          `Invalid axm metadata in ${pkg.purl.name}: schema validation failed`,
        );
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "swift" }),
    Effect.withSpan("read.swift"),
  ),
};
