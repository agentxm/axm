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
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { validateArchive } from "@agentxm/extension-content";
import { validateContainedLink } from "@agentxm/workspace-kernel/locations";
import { zipSync, type Zippable } from "fflate";
import { PublishFailed } from "./errors.js";
import { expandGlob } from "@agentxm/extension-model/unstable/extensions/name-patterns";

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
   * option.
   */
  readonly ignore?: ReadonlyArray<string> | undefined;
  /** Wrap an existing skill root under src/ with a separately supplied manifest. */
  readonly skillEnvelope?: Uint8Array;
}

/** One file, link, or empty directory in the deterministic Registry archive plan. */
export interface ArchivePlanEntry {
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
  readonly included: ReadonlyArray<ArchivePlanEntry>;
  readonly excluded: ReadonlyArray<ArchivePlanEntry>;
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
 * Empty directories have explicit entries; populated directories are implied by their children.
 */
export const planZipArchive = (dir: string, options?: BuildZipArchiveOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const files = yield* Effect.gen(function* () {
      const candidates: Array<{
        readonly rel: string;
        readonly abs: string;
        readonly size: number;
        readonly mode: number;
        readonly payload?: Uint8Array;
      }> = [];
      if (options?.skillEnvelope !== undefined) {
        candidates.push({
          rel: "skill.json",
          abs: "",
          size: options.skillEnvelope.byteLength,
          mode: 0o100644,
          payload: options.skillEnvelope,
        });
      }
      const pending = [""];
      while (pending.length > 0) {
        const parent = pending.pop();
        if (parent === undefined) break;
        const children = yield* fs.readDirectory(path.join(dir, parent));
        for (const name of children) {
          const relative = path.join(parent, name);
          const abs = path.join(dir, relative);
          const relativePath = relative.split(path.sep).join("/");
          const rel = options?.skillEnvelope === undefined ? relativePath : `src/${relativePath}`;
          const target = yield* fs.readLink(abs).pipe(Effect.option);
          if (Option.isSome(target)) {
            yield* validateContainedLink(dir, abs, target.value);
            const payload = new TextEncoder().encode(target.value);
            candidates.push({ rel, abs, size: payload.length, mode: 0o120777, payload });
            continue;
          }
          const info = yield* fs.stat(abs);
          if (info.type === "Directory") {
            const contents = yield* fs.readDirectory(abs);
            if (contents.length === 0) {
              candidates.push({
                rel: `${rel}/`,
                abs,
                size: 0,
                mode: 0o40000 | (info.mode & 0o777),
                payload: new Uint8Array(),
              });
            } else pending.push(relative);
          } else if (info.type === "File") {
            candidates.push({
              rel,
              abs,
              size: Number(info.size),
              mode: 0o100000 | (info.mode & 0o777),
            });
          } else {
            return yield* new PublishFailed({
              category: "validation",
              detail: `Cannot archive unsupported filesystem entry: ${rel}`,
            });
          }
        }
      }
      candidates.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
      return candidates;
    }).pipe(
      Effect.mapError((cause) =>
        cause instanceof PublishFailed
          ? cause
          : new PublishFailed({
              category: "validation",
              detail: "Failed to read a contained source payload for zip archive",
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
    const planned = files.map((file): ArchivePlanEntry => ({
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
      ({ rel, abs, payload, mode }) =>
        (payload === undefined ? fs.readFile(abs) : Effect.succeed(payload)).pipe(
          Effect.map((bytes) => [rel, bytes, mode] as const),
        ),
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
    for (const [rel, bytes, mode] of contents) {
      zippable[rel] = [bytes, { mtime: DETERMINISTIC_MTIME, os: 3, attrs: mode << 16 }];
    }

    const archive = yield* Effect.try({
      // Registry ingest validates each entry independently. Stored entries
      // avoid decompressor-specific limits while retaining deterministic ZIP
      // bytes and bounded source-size accounting.
      try: () => zipSync(zippable, { mtime: DETERMINISTIC_MTIME, level: 0 }),
      catch: (cause) =>
        new PublishFailed({
          category: "internal",
          detail: "Failed to build zip archive",
          cause,
        }),
    });
    // Shared admission also resolves the virtual link graph, including links
    // whose targets change meaning after an earlier link and a '..' segment.
    yield* validateArchive(archive).pipe(
      Effect.mapError(
        (cause) =>
          new PublishFailed({
            category: "validation",
            detail: cause.message,
            cause,
          }),
      ),
    );
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
