/**
 * Registry utility functions extracted from sources/providers/registry.ts.
 *
 * Shared helpers for registry operations: version selection, integrity
 * computation, zip extraction, type pluralization, and path building.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { unzipSync } from "fflate";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeAppError } from "../app-error/index.js";
import type { Handle } from "../extensions/handle.js";
import { resolveVersionInRange } from "../version-constraints/version-constraints.js";
import { toExtensionTypePlural, type ExtensionType } from "../extensions/index.js";
import type { VersionEntry } from "./schema.js";
import { filterMatureVersions, type ReleaseAgePolicy } from "./release-age-policy.js";

// -----------------------------------------------------------------------------
// Version Selection
// -----------------------------------------------------------------------------

/**
 * Select the best matching version from a list of versions.
 *
 * Returns the first version (newest first).
 */
export const selectVersion = (
  versions: ReadonlyArray<VersionEntry>,
): Option.Option<VersionEntry> => {
  if (versions.length === 0) return Option.none();
  const [latest] = versions;
  return latest === undefined ? Option.none() : Option.some(latest);
};

export const resolveVersionEntry = (
  versions: ReadonlyArray<VersionEntry>,
  versionRange: Option.Option<string>,
): Option.Option<VersionEntry> => {
  if (Option.isNone(versionRange)) {
    return selectVersion(versions);
  }

  const resolved = resolveVersionInRange(versions, versionRange);
  if (Option.isNone(resolved)) {
    return Option.none();
  }

  return Option.fromUndefinedOr(
    versions.find((candidate) => candidate.version === resolved.value.version),
  );
};

export const resolveVersionEntryWithReleaseAge = (
  versions: ReadonlyArray<VersionEntry>,
  versionRange: Option.Option<string>,
  releaseAgePolicy: Option.Option<ReleaseAgePolicy>,
): Option.Option<VersionEntry> => {
  if (Option.isNone(releaseAgePolicy)) {
    return resolveVersionEntry(versions, versionRange);
  }

  return resolveVersionEntry(filterMatureVersions(versions, releaseAgePolicy.value), versionRange);
};

// -----------------------------------------------------------------------------
// Type Pluralization
// -----------------------------------------------------------------------------

/** Pluralize extension type for directory segments. */
export const pluralizeType = (type: ExtensionType): string => toExtensionTypePlural(type);

// -----------------------------------------------------------------------------
// Extension Directory
// -----------------------------------------------------------------------------

/** Build the path to an extension's directory within a registry. */
export const extensionDir = (
  registryRoot: string,
  owner: Handle,
  type: ExtensionType,
  name: string,
  join: (...parts: readonly string[]) => string,
): string => join(registryRoot, "extensions", owner, pluralizeType(type), name);

// -----------------------------------------------------------------------------
// Zip Extraction
// -----------------------------------------------------------------------------

/**
 * Extract a zip archive to a target directory.
 * Uses fflate for in-memory decompression (portable across platforms).
 */
export const extractZip = (archive: Uint8Array, targetDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Decompress zip archive in memory
    const entries = yield* Effect.try({
      try: () => unzipSync(archive),
      catch: (e) =>
        makeAppError({
          code: "network",
          detail: "Failed to decompress zip archive",
          cause: e,
        }),
    });

    // Write each entry to the target directory
    yield* Effect.forEach(
      Object.entries(entries),
      ([name, data]) =>
        Effect.gen(function* () {
          const fullPath = path.join(targetDir, name);

          // Directory entries end with '/'
          if (name.endsWith("/")) {
            yield* fs.makeDirectory(fullPath, { recursive: true }).pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "network",
                  detail: `Failed to create directory: ${name}`,
                  cause: e,
                }),
              ),
            );
          } else {
            // Ensure parent directory exists
            const parentDir = path.dirname(fullPath);
            yield* fs.makeDirectory(parentDir, { recursive: true }).pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "network",
                  detail: `Failed to create parent directory for: ${name}`,
                  cause: e,
                }),
              ),
            );

            yield* fs.writeFile(fullPath, data).pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "network",
                  detail: `Failed to write file: ${name}`,
                  cause: e,
                }),
              ),
            );
          }
        }),
      { concurrency: 1 },
    );
  });
