/**
 * Registry utility functions extracted from sources/providers/registry.ts.
 *
 * Shared helpers for registry operations: version selection, integrity
 * computation, zip extraction, type pluralization, and path building.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// TODO: (#24, #43) node:child_process is a convention violation (CLAUDE.md requires @effect/platform).
// Replace execFileSync/execSync with Effect.async + child_process.exec or a JS zip library.
import { execFileSync, execSync } from "node:child_process";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeAppError } from "../app-error/index.js";
import type { ExtensionType } from "../extensions/index.js";
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
  namespace: string,
  type: ExtensionType,
  name: string,
  join: (...parts: readonly string[]) => string,
): string => join(registryRoot, "extensions", namespace, pluralizeType(type), name);

// -----------------------------------------------------------------------------
// Zip Extraction
// -----------------------------------------------------------------------------

/**
 * Extract a zip archive to a target directory.
 * Uses the `unzip` CLI command for simplicity.
 *
 * TODO: Replace `unzip` CLI with a JS zip library (e.g., fflate, yauzl) for
 * Windows portability. The `unzip` binary is not available on Windows.
 */
export const extractZip = (archive: Uint8Array, targetDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Verify unzip binary is available
    yield* Effect.try({
      try: () => execSync("which unzip", { stdio: "pipe" }),
      catch: () =>
        makeAppError({
          code: "UNZIP_NOT_FOUND",
          what: "The `unzip` command is not available on this system",
          howToFix:
            "Install `unzip` via your package manager (e.g., `apt install unzip`, `brew install unzip`). Windows is not yet supported for registry installs.",
        }),
    });

    // Write archive to a temp file
    const archivePath = path.join(targetDir, "__archive__.zip");
    yield* fs.writeFile(archivePath, archive).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "SOURCE_FETCH_FAILED",
          what: `Failed to write temp archive`,
          cause: e,
        }),
      ),
    );

    // Extract using unzip command (execFileSync avoids shell injection)
    yield* Effect.try({
      try: () =>
        execFileSync("unzip", ["-o", "-q", archivePath, "-d", targetDir], {
          stdio: "pipe",
        }),
      catch: (e) =>
        makeAppError({ code: "SOURCE_FETCH_FAILED", what: `Failed to extract archive`, cause: e }),
    });

    // Clean up temp archive file
    yield* fs.remove(archivePath).pipe(Effect.ignore);
  });
