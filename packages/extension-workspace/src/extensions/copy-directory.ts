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
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";

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

const isExcluded = (name: string, forAgentArtifact: boolean): boolean => {
  if (ALWAYS_EXCLUDED_NAMES.has(name)) return true;
  if (!forAgentArtifact) return false;
  return AGENT_ARTIFACT_EXCLUDED_NAMES.has(name) || name.startsWith("_");
};

const copyEntry = (
  src: string,
  dest: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  forAgentArtifact: boolean,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    // Read through symlinks (stat follows symlinks by default)
    const info = yield* fs.stat(src);

    if (info.type === "Directory") {
      yield* copyDir(src, dest, fs, path, forAgentArtifact);
    } else {
      // Copy file content — readFile follows symlinks, giving us dereferenced content
      const content = yield* fs.readFile(src);
      yield* fs.makeDirectory(path.dirname(dest), { recursive: true });
      yield* fs.writeFile(dest, content);
    }
  });

const copyDir = (
  src: string,
  dest: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  forAgentArtifact: boolean,
): Effect.Effect<void, PlatformError> =>
  Effect.gen(function* () {
    yield* fs.makeDirectory(dest, { recursive: true });
    const entries = yield* fs.readDirectory(src);

    yield* Effect.forEach(
      entries.filter((name) => !isExcluded(name, forAgentArtifact)),
      (name) => copyEntry(path.join(src, name), path.join(dest, name), fs, path, forAgentArtifact),
      { concurrency: "unbounded" },
    );
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
 * Directory entries are copied concurrently.
 */
export const copyExtensionDirectory = (
  src: string,
  dest: string,
  options?: CopyExtensionDirectoryOptions,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* copyDir(src, dest, fs, path, options?.forAgentArtifact ?? false);
  });
