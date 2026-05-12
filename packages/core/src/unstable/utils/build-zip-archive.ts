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
import { makeAppError } from "../app-error/index.js";

const DETERMINISTIC_MTIME = new Date("2020-01-01T00:00:00Z");
const READ_CONCURRENCY = 16;

/**
 * Build a zip archive of a directory.
 * Files are stored at the root of the zip (no enclosing directory).
 * Directory entries are not emitted.
 */
export const buildZipArchive = (dir: string) =>
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
            return { rel: toZipPath(relRaw), abs, isFile: info.type === "File" } as const;
          }),
        { concurrency: READ_CONCURRENCY },
      );

      const onlyFiles = candidates.filter((c) => c.isFile);
      onlyFiles.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
      return onlyFiles;
    }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          message: "Failed to read source directory for zip archive",
          cause,
        }),
      ),
    );

    const contents = yield* Effect.forEach(
      files,
      ({ rel, abs }) => fs.readFile(abs).pipe(Effect.map((bytes) => [rel, bytes] as const)),
      { concurrency: READ_CONCURRENCY },
    ).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          message: "Failed to read file for zip archive",
          cause,
        }),
      ),
    );

    const zippable: Zippable = {};
    for (const [rel, bytes] of contents) {
      zippable[rel] = [bytes, { mtime: DETERMINISTIC_MTIME }];
    }

    return yield* Effect.try({
      try: () => zipSync(zippable, { mtime: DETERMINISTIC_MTIME }),
      catch: (cause) =>
        makeAppError({
          code: "internal",
          message: "Failed to build zip archive",
          cause,
        }),
    });
  });
