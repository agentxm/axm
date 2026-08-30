/**
 * Go module package detector and reader for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:os homedir() has no @effect/platform equivalent.
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { readEnv } from "../utils/index.js";
import { makeDetectedPackage } from "./detected-package.js";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAxmMeta, parseJsonOptional, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const golangType = Schema.decodeUnknownSync(PackageTypeSchema)("golang");

/** Regex matching a major-version path suffix like /v2, /v3, etc. */
const MAJOR_VERSION_SUFFIX = /\/v\d+$/;

/**
 * Strip major version path suffix (/v2, /v3, etc.) from a Go module path.
 */
const stripMajorVersionSuffix = (modulePath: string): string =>
  modulePath.replace(MAJOR_VERSION_SUFFIX, "");

/**
 * Split a Go module path into purl namespace and name.
 * The namespace is the path prefix (lowercased), and the name is the last segment.
 */
const parseModulePath = (
  rawModulePath: string,
): { readonly namespace: string; readonly name: string } => {
  const modulePath = stripMajorVersionSuffix(rawModulePath);
  const lastSlash = modulePath.lastIndexOf("/");
  if (lastSlash === -1) {
    return { namespace: "", name: modulePath.toLowerCase() };
  }
  return {
    namespace: modulePath.slice(0, lastSlash).toLowerCase(),
    name: modulePath.slice(lastSlash + 1).toLowerCase(),
  };
};

/**
 * Parse a single require line into a DetectedPackage, or undefined if invalid/indirect.
 * A require line has the form: module_path version [// indirect]
 */
const parseRequireLine = (line: string, source: string): DetectedPackage | undefined => {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("//")) return undefined;

  // Filter out indirect dependencies
  if (trimmed.includes("// indirect")) return undefined;

  // Split into module path and version
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return undefined;

  const modulePath = parts[0];
  const version = parts[1];
  if (modulePath === undefined || version === undefined) return undefined;

  const { namespace, name } = parseModulePath(modulePath);

  return Option.getOrUndefined(
    makeDetectedPackage({
      type: golangType,
      ...(namespace === "" ? {} : { namespace }),
      name,
      version,
      source,
    }),
  );
};

/**
 * Parse go.mod content and extract direct dependencies.
 */
const parseGoMod = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];
  let inRequireBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Single-line require: require module_path version
    if (trimmed.startsWith("require ") && !trimmed.includes("(")) {
      const rest = trimmed.slice("require ".length);
      const detected = parseRequireLine(rest, source);
      if (detected !== undefined) results.push(detected);
      continue;
    }

    // Start of require block
    if (trimmed.startsWith("require (") || trimmed === "require (") {
      inRequireBlock = true;
      continue;
    }

    // End of require block
    if (inRequireBlock && trimmed === ")") {
      inRequireBlock = false;
      continue;
    }

    // Line inside require block
    if (inRequireBlock) {
      const detected = parseRequireLine(trimmed, source);
      if (detected !== undefined) results.push(detected);
    }
  }

  return results;
};

/**
 * Resolve the GOPATH, defaulting to ~/go when not set.
 */
const resolveGopath = () => Effect.sync(() => readEnv("GOPATH") ?? `${os.homedir()}/go`);

/**
 * Go module package detector.
 *
 * Scans `go.mod` in the project directory and extracts direct dependencies
 * from `require` directives, filtering out `// indirect` entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const golangDetector: PackageDetector = {
  type: golangType,
  detect: Effect.fn("detect.golang")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const goModPath = path.join(projectDir, "go.mod");

      const content = yield* readFileOptional(goModPath);
      if (Option.isNone(content)) return [];

      const deps = parseGoMod(content.value, goModPath);
      if (deps.length === 0 && content.value.trim().length > 0) {
        // Content exists but no deps found - could be valid go.mod with no deps,
        // or malformed. Only warn if it looks malformed (no module directive).
        if (!content.value.includes("module ")) {
          yield* Effect.logWarning("Malformed go.mod: missing module directive, skipping");
        }
      }

      return deps;
    },
    Effect.annotateLogs({ detector: "golang" }),
    Effect.withSpan("detect.golang"),
  ),
};

/**
 * Go module package reader.
 *
 * Reads `axm.json` from `$GOPATH/pkg/mod/<module>@<version>/` for each
 * detected Go module and extracts recommendation metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const golangReader: PackageReader = {
  type: golangType,
  read: Effect.fn("read.golang")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      const gopath = yield* resolveGopath();

      // Reconstruct the module path from purl parts
      const modulePath = pkg.purl.namespace
        ? `${pkg.purl.namespace}/${pkg.purl.name}`
        : pkg.purl.name;
      const version = pkg.purl.version ?? "v0.0.0";

      const axmJsonPath = path.join(gopath, "pkg", "mod", `${modulePath}@${version}`, "axm.json");

      const content = yield* readFileOptional(axmJsonPath);
      if (Option.isNone(content)) return Option.none();

      const parsed = yield* parseJsonOptional(content.value, `${modulePath}@${version}/axm.json`);
      if (Option.isNone(parsed)) return Option.none();

      // Validate axm metadata structure
      const metaResult = decodeAxmMeta(parsed.value);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(
          `Invalid axm metadata in ${modulePath}@${version}: schema validation failed`,
        );
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "golang" }),
    Effect.withSpan("read.golang"),
  ),
};
