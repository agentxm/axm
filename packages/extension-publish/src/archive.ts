// @effect-diagnostics globalDate:off — ZIP's driver API requires one fixed Date value and never reads the ambient clock
/**
 * Build a deterministic zip archive of a directory.
 *
 * Uses fflate (pure JS) so publish works on platforms without a system
 * `zip` binary (notably Windows). Entries are walked via the platform
 * FileSystem service, sorted by relative path, and stamped with a fixed
 * mtime so the byte output is reproducible.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { zipSync, type Zippable } from "fflate";
import { PublishFailed } from "./errors.js";
import { expandGlob } from "./internal/glob.js";

// ZIP timestamps have no timezone. fflate serializes Date's local calendar
// fields, so construct those fields locally to keep the encoded bytes stable
// across host timezones.
// eslint-disable-next-line no-restricted-syntax -- ZIP's driver API requires Date; this fixed value never reads the ambient clock.
const DETERMINISTIC_MTIME = new Date(2020, 0, 1, 0, 0, 0, 0);
const READ_CONCURRENCY = 16;

/** @experimental This API is unstable and may change without notice. */
export interface BuildZipArchiveOptions {
  /**
   * Glob patterns matched against archive-relative POSIX paths. Absent or
   * empty leaves the archive exactly as it would have been built without this
   * option — the default path is unchanged, so already-published integrity
   * digests stay reproducible.
   */
  readonly ignore?: ReadonlyArray<string> | undefined;
}

/** One file in the deterministic Registry archive plan. */
export interface ArchivePlanFile {
  readonly path: string;
  readonly size: number;
  readonly matchedPatterns: ReadonlyArray<string>;
}

/** Match accounting for one declared ignore pattern. */
export interface ArchivePlanPattern {
  readonly pattern: string;
  readonly matchCount: number;
}

/** The effective Registry-only distribution boundary before ZIP construction. */
export interface ArchivePlan {
  readonly included: ReadonlyArray<ArchivePlanFile>;
  readonly excluded: ReadonlyArray<ArchivePlanFile>;
  readonly patterns: ReadonlyArray<ArchivePlanPattern>;
  readonly warnings: ReadonlyArray<string>;
  readonly includedCount: number;
  readonly excludedCount: number;
  readonly uncompressedBytes: number;
}

/** Deterministic archive bytes paired with the exact plan that produced them. */
export interface PlannedZipArchive {
  readonly archive: Uint8Array;
  readonly plan: ArchivePlan;
}

/**
 * Build a zip archive of a directory.
 * Files are stored at the root of the zip (no enclosing directory).
 * Directory entries are not emitted.
 */
export const planZipArchive = (dir: string, options?: BuildZipArchiveOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const files = yield* Effect.gen(function* () {
      const rawEntries = yield* fs.readDirectory(dir, { recursive: true });
      const toZipPath =
        path.sep === "/" ? (s: string) => s : (s: string) => s.split(path.sep).join("/");

      const candidates = yield* Effect.forEach(
        rawEntries,
        (relRaw) =>
          Effect.gen(function* () {
            const abs = path.join(dir, relRaw);
            const info = yield* fs.stat(abs);
            return {
              rel: toZipPath(relRaw),
              abs,
              isFile: info.type === "File",
              size: Number(info.size),
            } as const;
          }),
        { concurrency: READ_CONCURRENCY },
      );

      const onlyFiles = candidates.filter((c) => c.isFile);
      onlyFiles.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

      return onlyFiles;
    }).pipe(
      Effect.mapError(
        (cause) =>
          new PublishFailed({
            category: "internal",
            detail: "Failed to read source directory for zip archive",
            cause,
          }),
      ),
    );

    const patterns = options?.ignore ?? [];
    const paths = files.map((file) => file.rel);
    const matchesByPattern = patterns.map((pattern) => ({
      pattern,
      matches: new Set(expandGlob(pattern, paths)),
    }));
    const planned = files.map((file): ArchivePlanFile => ({
      path: file.rel,
      size: file.size,
      matchedPatterns: matchesByPattern
        .filter(({ matches }) => matches.has(file.rel))
        .map(({ pattern }) => pattern),
    }));
    const included = planned.filter((file) => file.matchedPatterns.length === 0);
    const excluded = planned.filter((file) => file.matchedPatterns.length > 0);
    const includedPaths = new Set(included.map((file) => file.path));

    const contents = yield* Effect.forEach(
      files.filter((file) => includedPaths.has(file.rel)),
      ({ rel, abs }) => fs.readFile(abs).pipe(Effect.map((bytes) => [rel, bytes] as const)),
      { concurrency: READ_CONCURRENCY },
    ).pipe(
      Effect.mapError(
        (cause) =>
          new PublishFailed({
            category: "internal",
            detail: "Failed to read file for zip archive",
            cause,
          }),
      ),
    );

    const zippable: Zippable = {};
    for (const [rel, bytes] of contents) {
      zippable[rel] = [bytes, { mtime: DETERMINISTIC_MTIME }];
    }

    const archive = yield* Effect.try({
      try: () => zipSync(zippable, { mtime: DETERMINISTIC_MTIME }),
      catch: (cause) =>
        new PublishFailed({
          category: "internal",
          detail: "Failed to build zip archive",
          cause,
        }),
    });
    const patternPlans = matchesByPattern.map(({ pattern, matches }) => ({
      pattern,
      matchCount: matches.size,
    }));
    return {
      archive,
      plan: {
        included,
        excluded,
        patterns: patternPlans,
        warnings: patternPlans
          .filter(({ matchCount }) => matchCount === 0)
          .map(({ pattern }) => `publish.ignore pattern "${pattern}" matched no files.`),
        includedCount: included.length,
        excludedCount: excluded.length,
        uncompressedBytes: included.reduce((total, file) => total + file.size, 0),
      },
    } satisfies PlannedZipArchive;
  });

export const buildZipArchive = (dir: string, options?: BuildZipArchiveOptions) =>
  planZipArchive(dir, options).pipe(Effect.map(({ archive }) => archive));
