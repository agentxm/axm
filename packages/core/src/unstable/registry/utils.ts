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
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as semver from "semver";

import { makeAppError } from "../app-error/index.js";
import { makeAbsolutePath, safeChildPath } from "../utils/index.js";
import type { Handle } from "../extensions/handle.js";
import { resolveVersionInRange } from "../version-constraints/version-constraints.js";
import { toExtensionTypePlural, type ExtensionType } from "../extensions/index.js";
import type { ExtensionIndex, VersionEntry } from "./schema.js";
import {
  filterMatureVersions,
  isVersionEntryEligibleAt,
  releaseAgeEvidence,
  type ReleaseAgeEvaluation,
  type ReleaseAgeEvidence,
  type ReleaseAgeExemption,
} from "./release-age-policy.js";

// -----------------------------------------------------------------------------
// Version Selection
// -----------------------------------------------------------------------------

/**
 * Select the best matching version from a list of versions.
 *
 * Returns the maximum non-yanked version, independent of input order.
 */
export const selectVersion = (
  versions: ReadonlyArray<VersionEntry>,
): Option.Option<VersionEntry> => {
  const availableVersions = versions.filter((entry) => entry.yankedAt === undefined);
  return resolveVersionInRange(availableVersions, Option.none());
};

export const resolveVersionEntry = (
  versions: ReadonlyArray<VersionEntry>,
  versionRange: Option.Option<string>,
): Option.Option<VersionEntry> => {
  if (Option.isNone(versionRange)) {
    return selectVersion(versions);
  }

  if (semver.valid(versionRange.value) === versionRange.value) {
    return Option.fromUndefinedOr(
      versions.find((candidate) => candidate.version === versionRange.value),
    );
  }

  const availableVersions = versions.filter((entry) => entry.yankedAt === undefined);
  const resolved = resolveVersionInRange(availableVersions, versionRange);
  if (Option.isNone(resolved)) {
    return Option.none();
  }

  return Option.fromUndefinedOr(
    availableVersions.find((candidate) => candidate.version === resolved.value.version),
  );
};

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

export const resolveVersionEntryWithReleaseAge = (
  versions: ReadonlyArray<VersionEntry>,
  versionRange: Option.Option<string>,
  minimumReleaseAge: Option.Option<Duration.Duration>,
): Effect.Effect<Option.Option<VersionEntry>> => {
  if (Option.isNone(minimumReleaseAge)) {
    return Effect.succeed(resolveVersionEntry(versions, versionRange));
  }

  return filterMatureVersions(versions, minimumReleaseAge.value).pipe(
    Effect.map((mature) => resolveVersionEntry(mature, versionRange)),
  );
};

export type ReleaseAgeVersionResolution =
  | {
      readonly kind: "selected";
      readonly version: VersionEntry;
      readonly newerHeld?: ReleaseAgeEvidence;
    }
  | {
      readonly kind: "exempted";
      readonly version: VersionEntry;
      readonly bypassed: ReleaseAgeEvidence;
      readonly exemption: ReleaseAgeExemption;
    }
  | { readonly kind: "version_unsatisfied" }
  | { readonly kind: "policy_held"; readonly candidate: ReleaseAgeEvidence };

/**
 * Resolve one visible Registry index under one caller-supplied release-age
 * evaluation. The supplied timestamp makes a complete operation deterministic.
 */
export const resolveVersionEntryForReleaseAge = (
  versions: ReadonlyArray<VersionEntry>,
  versionRange: Option.Option<string>,
  evaluation: ReleaseAgeEvaluation,
  exemption?: ReleaseAgeExemption,
): ReleaseAgeVersionResolution => {
  const otherwiseSelected = resolveVersionEntry(versions, versionRange);
  if (Option.isNone(otherwiseSelected)) {
    return { kind: "version_unsatisfied" };
  }

  const candidate = otherwiseSelected.value;
  const candidateEligible = isVersionEntryEligibleAt(candidate, evaluation);
  if (!candidateEligible && exemption !== undefined) {
    return {
      kind: "exempted",
      version: candidate,
      bypassed: releaseAgeEvidence(candidate, evaluation),
      exemption,
    };
  }

  const eligible = versions.filter((entry) => isVersionEntryEligibleAt(entry, evaluation));
  const selected = resolveVersionEntry(eligible, versionRange);
  if (Option.isNone(selected)) {
    return {
      kind: "policy_held",
      candidate: releaseAgeEvidence(candidate, evaluation),
    };
  }

  return {
    kind: "selected",
    version: selected.value,
    ...(candidate.version === selected.value.version || candidateEligible
      ? {}
      : { newerHeld: releaseAgeEvidence(candidate, evaluation) }),
  };
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
            return yield* makeAppError({
              code: "validation",
              detail: `Refusing to extract entry outside the target directory: ${name}`,
            });
          }
          const fullPath = safePath.value;

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
