/**
 * Shared extension utilities.
 *
 * Cross-cutting utilities used by multiple extension types.
 * Promoted from skills-specific modules to avoid cross-feature dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { PlatformError } from "effect/PlatformError";
import * as Data from "effect/Data";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

// -----------------------------------------------------------------------------
// Path Safety Validation
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Extension Directory Copy
// -----------------------------------------------------------------------------

/**
 * VCS state is never copied in any copy mode. It does not belong to authored
 * package content, and copying a `.git` directory from a git-hosted or local
 * source would only bloat the canonical copy.
 */
const ALWAYS_EXCLUDED_NAMES = new Set([".git"]);

/**
 * Entries additionally omitted from an agent-facing artifact: human files,
 * AXM-managed install metadata, and authoring-private (`_`-prefixed) files.
 * These belong in the canonical copy (they are part of the published package)
 * but are trimmed when fanning out to an agent directory.
 */
const AGENT_ARTIFACT_EXCLUDED_NAMES = new Set(["README.md", "metadata.json"]);

export const MAX_COPIED_EXTENSION_BYTES = 256 * 1024 * 1024;
export const MAX_COPIED_EXTENSION_ENTRIES = 10_000;

export class DirectoryCopyLimitExceeded extends Data.TaggedError("DirectoryCopyLimitExceeded")<{
  readonly resource: "bytes" | "entries";
  readonly limit: number;
}> {}

const isExcluded = (name: string, forAgentArtifact: boolean): boolean => {
  if (ALWAYS_EXCLUDED_NAMES.has(name)) return true;
  if (!forAgentArtifact) return false;
  return AGENT_ARTIFACT_EXCLUDED_NAMES.has(name) || name.startsWith("_");
};

const scanCopy = (
  src: string,
  dest: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  forAgentArtifact: boolean,
  maxBytes: number,
  maxEntries: number,
) =>
  Effect.gen(function* () {
    const pending = [{ source: src, target: dest }];
    const directories: Array<string> = [];
    const files: Array<{ source: string; target: string }> = [];
    let entries = 0;
    let bytes = 0;

    while (pending.length > 0) {
      const next = pending.pop();
      if (next === undefined) break;
      // stat follows symlinks so copied content is dereferenced.
      const info = yield* fs.stat(next.source);
      if (info.type === "Directory") {
        directories.push(next.target);
        const children = (yield* fs.readDirectory(next.source)).filter(
          (name) => !isExcluded(name, forAgentArtifact),
        );
        entries += children.length;
        if (entries > maxEntries) {
          return yield* new DirectoryCopyLimitExceeded({ resource: "entries", limit: maxEntries });
        }
        for (const name of children) {
          pending.push({
            source: path.join(next.source, name),
            target: path.join(next.target, name),
          });
        }
      } else {
        bytes += Number(info.size);
        if (bytes > maxBytes) {
          return yield* new DirectoryCopyLimitExceeded({ resource: "bytes", limit: maxBytes });
        }
        files.push(next);
      }
    }

    return { directories, files };
  });

/**
 * Options for {@link copyExtensionDirectory}.
 */
export type CopyExtensionDirectoryOptions = {
  /**
   * When true, omit entries that should not appear in a fanned-out agent
   * artifact: `README.md`, `metadata.json`, and `_`-prefixed names (`.git` is
   * always omitted).
   *
   * Defaults to `false` — a faithful copy of the source, matching what
   * `publish` packages into the archive. Canonical materialization must use
   * the faithful copy so realigning a lockfile does not strip authored files
   * (e.g. `README.md`) that the published package contains.
   */
  readonly forAgentArtifact?: boolean;
  readonly maxBytes?: number;
  readonly maxEntries?: number;
};

export type CopyExtensionDirectoryFailureDetails = {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly subject?: string;
  readonly sourceExists?: boolean;
};

export const formatCopyExtensionDirectoryFailure = ({
  sourcePath,
  targetPath,
  subject = "extension files",
  sourceExists,
}: CopyExtensionDirectoryFailureDetails): string => {
  const missingSource = sourceExists === false ? "; source does not exist" : "";
  return `Failed to copy ${subject} from ${sourcePath} to ${targetPath}${missingSource}`;
};

/**
 * Recursively copies an extension directory from `src` to `dest`.
 *
 * By default this is a faithful copy of every entry except `.git`, used to
 * materialize the canonical extension store from a package archive or local
 * source. Pass `{ forAgentArtifact: true }` to also omit non-artifact entries
 * when fanning the canonical copy out to an agent directory (see
 * {@link CopyExtensionDirectoryOptions}).
 *
 * Symlinks are dereferenced (file content is copied, not the link).
 * Source content is scanned before any target write. Files are streamed one at
 * a time so a failed or cancelled copy leaves no queued filesystem work.
 */
export const copyExtensionDirectory = (
  src: string,
  dest: string,
  options?: CopyExtensionDirectoryOptions,
): Effect.Effect<
  void,
  PlatformError | DirectoryCopyLimitExceeded,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const maxBytes = Math.min(
      options?.maxBytes ?? MAX_COPIED_EXTENSION_BYTES,
      MAX_COPIED_EXTENSION_BYTES,
    );
    const maxEntries = Math.min(
      options?.maxEntries ?? MAX_COPIED_EXTENSION_ENTRIES,
      MAX_COPIED_EXTENSION_ENTRIES,
    );
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      return yield* new DirectoryCopyLimitExceeded({ resource: "bytes", limit: maxBytes });
    }
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      return yield* new DirectoryCopyLimitExceeded({ resource: "entries", limit: maxEntries });
    }
    const { directories, files } = yield* scanCopy(
      src,
      dest,
      fs,
      path,
      options?.forAgentArtifact ?? false,
      maxBytes,
      maxEntries,
    );
    yield* Effect.forEach(
      directories,
      (directory) => fs.makeDirectory(directory, { recursive: true }),
      {
        concurrency: 1,
        discard: true,
      },
    );
    const copiedBytes = yield* Ref.make(0);
    yield* Effect.forEach(
      files,
      ({ source, target }) =>
        fs.stream(source, { chunkSize: 64 * 1024 }).pipe(
          Stream.mapEffect((chunk) =>
            Effect.gen(function* () {
              const total = yield* Ref.updateAndGet(
                copiedBytes,
                (count) => count + chunk.byteLength,
              );
              if (total > maxBytes) {
                return yield* new DirectoryCopyLimitExceeded({
                  resource: "bytes",
                  limit: maxBytes,
                });
              }
              return chunk;
            }),
          ),
          Stream.run(fs.sink(target)),
        ),
      { concurrency: 1, discard: true },
    );
  });
