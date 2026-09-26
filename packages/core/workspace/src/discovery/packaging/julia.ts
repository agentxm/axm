/**
 * Julia package detector and reader for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:os homedir() has no @effect/platform equivalent.
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAgentExtensions, readFileOptional } from "./reader-io.js";
import { parseTomlDocument, tomlStringEntries, tomlTable, type TomlTable } from "./toml.js";
import { makeDetectedPackage } from "./detected-package.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const juliaType = Schema.decodeUnknownSync(PackageTypeSchema)("julia");

/** UUID pattern for Julia dependency values. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract the `[deps]` table from a parsed Project.toml document. Julia's
 * Project.toml lists `PackageName = "uuid-string"` under `[deps]`.
 */
const parseDepsSection = (document: TomlTable, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  for (const { key: name, value } of tomlStringEntries(tomlTable(document, "deps"))) {
    // Validate it looks like a UUID
    if (!UUID_PATTERN.test(value)) continue;

    // Julia deps are always versionless (identified by UUID)
    const detected = makeDetectedPackage({ type: juliaType, name, source });
    if (Option.isSome(detected)) results.push(detected.value);
  }

  return results;
};

/**
 * Julia package detector.
 *
 * Scans `Project.toml` in the project directory and extracts dependencies
 * from the `[deps]` section. All purls are versionless since Julia
 * identifies packages by UUID.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const juliaDetector: PackageDetector = {
  type: juliaType,
  detect: Effect.fn("detect.julia")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const projectTomlPath = path.join(projectDir, "Project.toml");

      const content = yield* readFileOptional(projectTomlPath);
      if (Option.isNone(content)) return [];

      const document = parseTomlDocument(content.value);
      if (document === undefined) {
        yield* Effect.logWarning("Malformed Project.toml, skipping");
        return [];
      }

      return parseDepsSection(document, projectTomlPath);
    },
    Effect.annotateLogs({ detector: "julia" }),
    Effect.withSpan("detect.julia"),
  ),
};

/**
 * Read the top-level `agentExtensions` array from Project.toml.
 */
const parseAgentExtensions = (content: string): TomlTable | undefined => {
  const document = parseTomlDocument(content);
  const agentExtensions = document?.["agentExtensions"];
  return agentExtensions === undefined ? undefined : { agentExtensions };
};

/**
 * Julia package reader.
 *
 * Reads the top-level `agentExtensions` array from
 * `~/.julia/packages/<pkg>/<hash>/Project.toml`
 * for each detected Julia package.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const juliaReader: PackageReader = {
  type: juliaType,
  read: Effect.fn("read.julia")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;

      const pkgName = pkg.purl.name;
      const home = os.homedir();

      const juliaPkgsDir = path.join(home, ".julia", "packages", pkgName);

      // Scan hash directories
      const hashDirs = yield* fs.readDirectory(juliaPkgsDir).pipe(Effect.option);
      if (Option.isNone(hashDirs)) return Option.none();

      // Check each hash directory for portable metadata.
      for (const hashDir of hashDirs.value) {
        const projectTomlPath = path.join(juliaPkgsDir, hashDir, "Project.toml");
        const content = yield* readFileOptional(projectTomlPath);
        if (Option.isNone(content)) continue;

        const metadata = parseAgentExtensions(content.value);
        if (metadata === undefined) continue;

        const metaResult = yield* decodeAgentExtensions(metadata);
        if (Result.isFailure(metaResult)) {
          yield* Effect.logWarning(
            `Invalid agentExtensions metadata in ${pkgName}: schema validation failed`,
          );
          return Option.none();
        }

        return Option.some(metaResult.success.agentExtensions);
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "julia" }),
    Effect.withSpan("read.julia"),
  ),
};
