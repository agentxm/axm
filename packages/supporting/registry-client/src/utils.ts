/**
 * Registry utility functions extracted from sources/providers/registry.ts.
 *
 * Shared helpers for registry operations: lifecycle warnings, zip extraction,
 * type pluralization, and path building. Version selection lives in the
 * Registry protocol; release-age policy in extension-resolution.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { unzipSync } from "fflate";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { RegistryOperationFailed } from "./errors.js";
import { safeChildPath } from "./path-safety.js";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  toExtensionTypePlural,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import type {
  ExtensionIndex,
  VersionEntry,
} from "@agentxm/registry-protocol/unstable/registry/schema";

// -----------------------------------------------------------------------------
// Lifecycle warnings
// -----------------------------------------------------------------------------

export const extensionLifecycleWarnings = (
  index: ExtensionIndex,
  version: VersionEntry,
): ReadonlyArray<string> => {
  const warnings: string[] = [];
  const extensionRef = `${index.owner}/${toExtensionTypePlural(index.type)}/${index.name}`;
  if (version.yankedAt !== undefined) {
    const context = [version.yankCategory, version.yankNotice].filter(
      (value): value is string => value !== undefined,
    );
    warnings.push(
      context.length === 0
        ? `${extensionRef}@${version.version} is yanked`
        : `${extensionRef}@${version.version} is yanked: ${context.join(": ")}`,
    );
  }
  return warnings;
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
        new RegistryOperationFailed({
          category: "validation",
          detail: "Failed to decompress zip archive",
          cause: e,
        }),
    });

    // Resolve the target directory once for containment checks.
    const baseDir = makeAbsolutePath(path, targetDir);

    // Write each entry to the target directory
    yield* Effect.forEach(
      Object.entries(entries),
      ([name, data]) =>
        Effect.gen(function* () {
          // Reject any entry whose resolved path escapes the target directory
          // (zip slip): `..` traversal or an absolute path.
          const safePath = yield* safeChildPath(baseDir, name);
          if (Option.isNone(safePath)) {
            return yield* new RegistryOperationFailed({
              category: "validation",
              detail: `Refusing to extract entry outside the target directory: ${name}`,
            });
          }
          const fullPath = safePath.value;

          // Directory entries end with '/'
          if (name.endsWith("/")) {
            yield* fs.makeDirectory(fullPath, { recursive: true }).pipe(
              Effect.mapError(
                (e) =>
                  new RegistryOperationFailed({
                    category: "network",
                    detail: `Failed to create directory: ${name}`,
                    cause: e,
                  }),
              ),
            );
          } else {
            // Ensure parent directory exists
            const parentDir = path.dirname(fullPath);
            yield* fs.makeDirectory(parentDir, { recursive: true }).pipe(
              Effect.mapError(
                (e) =>
                  new RegistryOperationFailed({
                    category: "network",
                    detail: `Failed to create parent directory for: ${name}`,
                    cause: e,
                  }),
              ),
            );

            yield* fs.writeFile(fullPath, data).pipe(
              Effect.mapError(
                (e) =>
                  new RegistryOperationFailed({
                    category: "network",
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
