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
import { resolveVersionWithConstraint } from "../version-constraints/index.js";
import type { ExtensionType } from "../extensions/index.js";
import type { VersionEntry } from "./schema.js";

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
  versionConstraint: Option.Option<string>,
): Option.Option<VersionEntry> => {
  if (Option.isNone(versionConstraint)) {
    return selectVersion(versions);
  }

  const resolved = resolveVersionWithConstraint(versions, versionConstraint);
  if (Option.isNone(resolved)) {
    return Option.none();
  }

  return Option.fromUndefinedOr(
    versions.find((candidate) => candidate.version === resolved.value.version),
  );
};

// -----------------------------------------------------------------------------
// Type Pluralization
// -----------------------------------------------------------------------------

/** Pluralize extension type for directory segments. */
export const pluralizeType = (type: ExtensionType): string => {
  switch (type) {
    case "skill":
      return "skills";
    case "command":
      return "commands";
    case "pack":
      return "packs";
    case "mcp-server":
      return "mcp-servers";
  }
};

// -----------------------------------------------------------------------------
// Extension Directory
// -----------------------------------------------------------------------------

/** Build the path to an extension's directory within a registry. */
export const extensionDir = (
  registryRoot: string,
  owner: string,
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
          code: "SOURCE_FETCH_FAILED",
          what: "Failed to decompress zip archive",
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
                  code: "SOURCE_FETCH_FAILED",
                  what: `Failed to create directory: ${name}`,
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
                  code: "SOURCE_FETCH_FAILED",
                  what: `Failed to create parent directory for: ${name}`,
                  cause: e,
                }),
              ),
            );

            yield* fs.writeFile(fullPath, data).pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "SOURCE_FETCH_FAILED",
                  what: `Failed to write file: ${name}`,
                  cause: e,
                }),
              ),
            );
          }
        }),
      { concurrency: 1 },
    );
  });
