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
import { makeAppError } from "../app-error/index.js";
import { isPathSafe } from "../utils/index.js";
import { decodeExtensionNameSync, type ExtensionName } from "./common.js";

// -----------------------------------------------------------------------------
// Name Sanitization
// -----------------------------------------------------------------------------

/**
 * Sanitizes an extension name into a safe on-disk directory name.
 *
 * Transformation pipeline:
 * 1. Convert to lowercase
 * 2. Replace non-alphanumeric characters (except `.` and `_`) with hyphens
 * 3. Strip leading dots and hyphens
 * 4. Truncate to 255 characters, then strip trailing dots and hyphens
 * 5. Fall back to `"unnamed-skill"` if empty
 * 6. Preserve canonical names; otherwise append a deterministic discriminator
 */
export const sanitizeName = (name: string): string => {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 255)
    .replace(/[.-]+$/, "");

  const fallback = sanitized || "unnamed-skill";
  if (fallback === name) {
    return fallback;
  }

  // Extension names are normally canonical before reaching filesystem code.
  // Preserve those stable paths. For defensive non-canonical input,
  // append a deterministic discriminator so distinct display names that
  // normalize to the same slug cannot address each other's files.
  let high = 0x9e3779b9;
  let low = 0x811c9dc5;
  for (const codePoint of name) {
    const value = codePoint.codePointAt(0) ?? 0;
    low = Math.imul(low ^ value, 0x01000193);
    high = Math.imul(high ^ value, 0x85ebca6b);
  }
  const discriminator = `${(high >>> 0).toString(16).padStart(8, "0")}${(low >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
  const maxSlugLength = 255 - discriminator.length - 2;
  const slug = fallback.slice(0, maxSlugLength).replace(/[.-]+$/, "") || "unnamed-skill";
  return `${slug}__${discriminator}`;
};

/**
 * Converts a human-authored label into a valid AXM extension name.
 */
export const normalizeExtensionName = (name: string): ExtensionName => {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 64)
    .replace(/-+$/, "");

  return decodeExtensionNameSync(normalized || "unnamed-extension");
};

// -----------------------------------------------------------------------------
// Path Safety Validation
// -----------------------------------------------------------------------------

export const validatePathSafety = (path: Path.Path, baseDir: string, targetPath: string) =>
  isPathSafe(path, baseDir, targetPath)
    ? Effect.void
    : makeAppError({
        code: "internal",
        detail: `Path traversal detected: ${targetPath}`,
      });

// -----------------------------------------------------------------------------
// Extension Directory Copy
// -----------------------------------------------------------------------------

/**
 * VCS state is never copied into the managed store, in any copy mode. It is
 * never part of a published package (the extension directory has no `.git`),
 * and copying a `.git` directory from a git-hosted or local source would only
 * bloat the canonical copy.
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
