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

import { Unzip, UnzipInflate, unzipSync } from "fflate";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { RegistryOperationFailed } from "./errors.js";
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_BUFFERED_ARCHIVE_BYTES,
  MAX_EXTRACTED_ARCHIVE_BYTES,
} from "./archive-limits.js";
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
  if (index.archival !== null) {
    warnings.push(
      index.archival.reason === undefined
        ? `${extensionRef} is archived; historical releases remain available`
        : `${extensionRef} is archived: ${index.archival.reason}`,
    );
  }
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

export interface ArchiveExtractionLimits {
  readonly maxCompressedBytes?: number;
  readonly maxExpandedBytes?: number;
  readonly maxEntries?: number;
}

interface DecodedEntry {
  readonly chunks: ReadonlyArray<Uint8Array>;
  readonly size: number;
}

const extractionLimitFailure = (detail: string) =>
  new RegistryOperationFailed({ category: "quota", detail });

/** Validate the central directory before any inflation, then cap actual output chunks. */
const decodeBoundedZip = (
  archive: Uint8Array,
  limits: Required<ArchiveExtractionLimits>,
): ReadonlyMap<string, DecodedEntry> => {
  if (archive.byteLength > limits.maxCompressedBytes) {
    throw extractionLimitFailure(
      `Registry archive exceeds the ${limits.maxCompressedBytes} byte acquisition limit`,
    );
  }

  let declaredEntries = 0;
  let declaredBytes = 0;
  const declared = new Map<string, { readonly size: number; readonly compression: number }>();
  unzipSync(archive, {
    filter: (entry) => {
      if (declared.has(entry.name)) {
        throw new RegistryOperationFailed({
          category: "validation",
          detail: `Registry archive contains a duplicate entry: ${entry.name}`,
        });
      }
      declared.set(entry.name, { size: entry.originalSize, compression: entry.compression });
      declaredEntries += 1;
      declaredBytes += entry.originalSize;
      if (declaredEntries > limits.maxEntries) {
        throw extractionLimitFailure(
          `Registry archive exceeds the ${limits.maxEntries} entry limit`,
        );
      }
      if (declaredBytes > limits.maxExpandedBytes) {
        throw extractionLimitFailure(
          `Registry archive exceeds the ${limits.maxExpandedBytes} extracted byte limit`,
        );
      }
      return false;
    },
  });

  const entries = new Map<string, DecodedEntry>();
  const seenNames = new Set<string>();
  let expandedBytes = 0;
  let completedEntries = 0;
  const unzip = new Unzip((file) => {
    const expected = declared.get(file.name);
    if (
      expected === undefined ||
      expected.compression !== file.compression ||
      (file.originalSize !== undefined && expected.size !== file.originalSize)
    ) {
      throw new RegistryOperationFailed({
        category: "validation",
        detail: `Registry archive entry differs from its central directory: ${file.name}`,
      });
    }
    if (seenNames.has(file.name)) {
      throw new RegistryOperationFailed({
        category: "validation",
        detail: `Registry archive contains a duplicate entry: ${file.name}`,
      });
    }
    seenNames.add(file.name);
    const chunks: Array<Uint8Array> = [];
    let size = 0;
    file.ondata = (error, data, final) => {
      if (error !== null) throw error;
      size += data.byteLength;
      expandedBytes += data.byteLength;
      if (expandedBytes > limits.maxExpandedBytes) {
        throw extractionLimitFailure(
          `Registry archive exceeds the ${limits.maxExpandedBytes} extracted byte limit`,
        );
      }
      if (size > expected.size) {
        throw new RegistryOperationFailed({
          category: "validation",
          detail: `Registry archive entry has inconsistent size: ${file.name}`,
        });
      }
      if (data.byteLength > 0) chunks.push(new Uint8Array(data));
      if (final) {
        if (size !== expected.size) {
          throw new RegistryOperationFailed({
            category: "validation",
            detail: `Registry archive entry has inconsistent size: ${file.name}`,
          });
        }
        entries.set(file.name, { chunks, size });
        completedEntries += 1;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < archive.byteLength; offset += 64 * 1024) {
    const end = Math.min(offset + 64 * 1024, archive.byteLength);
    unzip.push(archive.subarray(offset, end), end === archive.byteLength);
  }
  if (completedEntries !== declaredEntries) {
    throw new RegistryOperationFailed({
      category: "validation",
      detail: "Registry archive entries do not match its central directory",
    });
  }
  return entries;
};

/** Extract a bounded ZIP archive into a caller-owned temporary directory. */
export const extractZip = (
  archive: Uint8Array,
  targetDir: string,
  options: ArchiveExtractionLimits = {},
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const requested = {
      maxCompressedBytes: options.maxCompressedBytes ?? MAX_BUFFERED_ARCHIVE_BYTES,
      maxExpandedBytes: options.maxExpandedBytes ?? MAX_EXTRACTED_ARCHIVE_BYTES,
      maxEntries: options.maxEntries ?? MAX_ARCHIVE_ENTRIES,
    };
    if (Object.values(requested).some((value) => !Number.isSafeInteger(value) || value < 1)) {
      return yield* new RegistryOperationFailed({
        category: "validation",
        detail: "Archive extraction limits must be positive finite integers",
      });
    }
    const limits = {
      maxCompressedBytes: Math.min(requested.maxCompressedBytes, MAX_BUFFERED_ARCHIVE_BYTES),
      maxExpandedBytes: Math.min(requested.maxExpandedBytes, MAX_EXTRACTED_ARCHIVE_BYTES),
      maxEntries: Math.min(requested.maxEntries, MAX_ARCHIVE_ENTRIES),
    };
    const entries = yield* Effect.try({
      try: () => decodeBoundedZip(archive, limits),
      catch: (e) =>
        e instanceof RegistryOperationFailed
          ? e
          : new RegistryOperationFailed({
              category: "validation",
              detail: "Failed to decompress zip archive",
              cause: e,
            }),
    });

    // Resolve the target directory once for containment checks.
    const baseDir = makeAbsolutePath(path, targetDir);

    // Write each entry to the target directory
    yield* Effect.forEach(
      entries,
      ([name, entry]) =>
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

            const data = new Uint8Array(entry.size);
            let offset = 0;
            for (const chunk of entry.chunks) {
              data.set(chunk, offset);
              offset += chunk.byteLength;
            }
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
