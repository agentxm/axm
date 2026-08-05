/**
 * Bazel package detector and reader for package-compatibility discovery.
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
import { readEnv } from "../utils/index.js";
import { PackageTypeSchema } from "./package-type.js";
import { decodeAxmMeta, decodePurl, parseJsonOptional, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const bazelType = Schema.decodeUnknownSync(PackageTypeSchema)("bazel");

/**
 * Parse MODULE.bazel content for bazel_dep() calls.
 * Format: bazel_dep(name = "rules_go", version = "0.41.0")
 */
const parseModuleBazel = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  // Match bazel_dep(...) calls, handling multi-line
  const bazelDepRegex = /bazel_dep\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = bazelDepRegex.exec(content)) !== null) {
    const args = match[1];
    if (args === undefined) continue;

    // Extract name attribute
    const nameMatch = /name\s*=\s*"([^"]+)"/.exec(args);
    if (nameMatch === null || nameMatch[1] === undefined) continue;
    const name = nameMatch[1];

    // Extract optional version attribute
    const versionMatch = /version\s*=\s*"([^"]+)"/.exec(args);
    const version = versionMatch?.[1];

    const purl = new PackageURL("bazel", null, name, version ?? null, null, null);
    const purlParts = decodePurl(purl.toString());
    results.push({ purl: purlParts, type: bazelType, source });
  }

  return results;
};

/**
 * Bazel package detector.
 *
 * Scans `MODULE.bazel` for `bazel_dep()` calls. Dependencies are deduplicated
 * by name.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const bazelDetector: PackageDetector = {
  type: bazelType,
  detect: Effect.fn("detect.bazel")(
    function* (projectDir: string) {
      const path = yield* Path.Path;

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

      // Parse MODULE.bazel (preferred Bzlmod format)
      const moduleBazelPath = path.join(projectDir, "MODULE.bazel");
      const moduleContent = yield* readFileOptional(moduleBazelPath);
      if (Option.isSome(moduleContent)) {
        const deps = parseModuleBazel(moduleContent.value, moduleBazelPath);
        if (deps.length === 0 && moduleContent.value.trim().length > 0) {
          if (
            !moduleContent.value.includes("module(") &&
            !moduleContent.value.includes("bazel_dep")
          ) {
            yield* Effect.logWarning("Malformed MODULE.bazel, skipping");
          }
        }
        addDeps(deps);
      }

      return allDeps;
    },
    Effect.annotateLogs({ detector: "bazel" }),
    Effect.withSpan("detect.bazel"),
  ),
};

/**
 * Bazel package reader.
 *
 * Reads `axm.json` from the Bazel external repository directory under
 * the output base (`external/<repo>/`). The output base is checked via
 * the BAZEL_OUTPUT_BASE environment variable or a default location.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const bazelReader: PackageReader = {
  type: bazelType,
  read: Effect.fn("read.bazel")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      const pkgName = pkg.purl.name;

      // Derive project directory from the source manifest path
      const projectDir = path.dirname(pkg.source);

      // Try to find output base from environment or common location
      const outputBase = readEnv("BAZEL_OUTPUT_BASE");

      // Candidate paths for axm.json
      const candidatePaths: Array<string> = [];

      if (outputBase !== undefined) {
        candidatePaths.push(path.join(outputBase, "external", pkgName, "axm.json"));
      }

      // Also try project-local bazel-out external directory
      candidatePaths.push(path.join(projectDir, "bazel-out", "external", pkgName, "axm.json"));
      candidatePaths.push(
        path.join(
          projectDir,
          "bazel-" + path.basename(projectDir),
          "external",
          pkgName,
          "axm.json",
        ),
      );

      for (const candidatePath of candidatePaths) {
        const content = yield* readFileOptional(candidatePath);
        if (Option.isNone(content)) continue;

        const parsed = yield* parseJsonOptional(content.value, `${pkgName}/axm.json`);
        if (Option.isNone(parsed)) return Option.none();

        const metaResult = decodeAxmMeta(parsed.value);
        if (Result.isFailure(metaResult)) {
          yield* Effect.logWarning(`Invalid axm metadata in ${pkgName}: schema validation failed`);
          return Option.none();
        }

        return Option.some(metaResult.success.extensions);
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "bazel" }),
    Effect.withSpan("read.bazel"),
  ),
};
