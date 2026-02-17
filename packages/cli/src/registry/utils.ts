/**
 * Registry utility functions extracted from sources/providers/registry.ts.
 *
 * Shared helpers for registry operations: version selection, integrity
 * computation, zip extraction, type pluralization, and path building.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { execSync } from "node:child_process";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeCliError } from "../cli-error/index.js";
import type { ExtensionType } from "../extensions/common.js";
import type { VersionEntry } from "./local-schema.js";

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
  return Option.some(versions[0]!);
};

// -----------------------------------------------------------------------------
// Type Pluralization
// -----------------------------------------------------------------------------

/** Pluralize extension type for directory segments. */
export const pluralizeType = (type: ExtensionType): string => {
  switch (type) {
    case "skill":
      return "skills";
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
  scope: string,
  type: ExtensionType,
  name: string,
  join: (...parts: readonly string[]) => string,
): string => join(registryRoot, "extensions", scope, pluralizeType(type), name);

// -----------------------------------------------------------------------------
// Zip Extraction
// -----------------------------------------------------------------------------

/**
 * Extract a zip archive to a target directory.
 * Uses the `unzip` CLI command for simplicity.
 *
 * TODO: Replace `unzip` CLI with a JS zip library for Windows portability.
 * Note: archivePath and targetDir are internally generated (not user-controlled),
 * so shell injection risk is mitigated.
 */
export const extractZip = (archive: Uint8Array, targetDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Write archive to a temp file
    const archivePath = path.join(targetDir, "__archive__.zip");
    yield* fs.writeFile(archivePath, archive).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SOURCE_FETCH_FAILED",
          what: `Failed to write temp archive`,
          cause: e,
        }),
      ),
    );

    // Extract using unzip command
    yield* Effect.try({
      try: () =>
        execSync(`unzip -o -q "${archivePath}" -d "${targetDir}"`, {
          stdio: "pipe",
        }),
      catch: (e) =>
        makeCliError({ code: "SOURCE_FETCH_FAILED", what: `Failed to extract archive`, cause: e }),
    });

    // Clean up temp archive file
    yield* fs.remove(archivePath).pipe(Effect.ignoreLogged);
  });
