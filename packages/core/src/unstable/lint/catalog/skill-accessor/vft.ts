/**
 * VFT-backed `SkillFileAccessor` for publish callers.
 *
 * A Virtual File Tree (VFT) is an in-memory representation of an extracted
 * archive — the registry publish pipeline extracts an upload into a VFT, then
 * passes that tree into Phase 4 decode/lint. The VFT's schema and bounds
 * (max size, file count, path depth) are owned by the registry extract phase
 * (Phase 4 concern); this accessor treats the tree as a read-only
 * `path -> Uint8Array` map and enforces its own rooted-read + no-`..`-escape
 * invariants at the rule boundary.
 *
 * Bounds enforcement here:
 *
 * - Paths are normalized to posix, `./` prefixes are stripped.
 * - Empty path resolves to the accessor root itself (useful for
 *   `location.file = ""` findings but not currently exercised by the v1
 *   catalog).
 * - Any path containing a `..` segment raises `FileAccessError {
 *   reason: "path-escape" }` from `readBytes` and resolves to `false` from
 *   `exists`.
 * - Absolute paths (starting with `/` or a Windows drive letter) are
 *   treated as escape attempts.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { FileAccessError, SkillFileAccessor } from "../../context.js";

// -----------------------------------------------------------------------------
// VFTNode — minimal interface the accessor needs
// -----------------------------------------------------------------------------

/**
 * Minimal shape of a Virtual File Tree consumed by the accessor.
 *
 * The registry VFT (Phase 4, this-repo) MUST satisfy this interface. The
 * registry may (and will) expose additional methods — file count, archive
 * bounds, iteration — but those are the extract phase's concern.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface VFTNode {
  /**
   * Whether the given posix path points to a file within the tree.
   */
  readonly hasFile: (posixPath: string) => boolean;
  /**
   * Return the bytes for the given posix path, or `undefined` when the path
   * does not resolve to a file (missing, directory, or outside the tree).
   */
  readonly getFile: (posixPath: string) => Uint8Array | undefined;
}

/**
 * Build a VFT-backed `SkillFileAccessor` rooted at the tree's root.
 *
 * Callers that root the skill at a sub-path of the archive should pre-strip
 * that sub-path before constructing the tree — the accessor enforces no
 * `..` escape above the root it was given.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeVftSkillFileAccessor = (tree: VFTNode): SkillFileAccessor => {
  return {
    exists: (path) => {
      const normalized = normalizeAndCheck(path);
      if (normalized.kind !== "ok") {
        return Effect.succeed(false);
      }
      return Effect.succeed(tree.hasFile(normalized.path));
    },
    readBytes: (path) => {
      const normalized = normalizeAndCheck(path);
      if (normalized.kind === "escape") {
        return failFileAccess(path, "path-escape", `path escapes the accessor root: ${path}`);
      }
      const bytes = tree.getFile(normalized.path);
      if (bytes === undefined) {
        return failFileAccess(path, "read-error", `file not found at ${path}`);
      }
      return Effect.succeed(bytes);
    },
  };
};

/**
 * Build a VFT-backed `SkillFileAccessor` rooted at a sub-path of the tree.
 *
 * Publish callers use this when the archive layout nests the skill content
 * under a directory (for native managed skills: `src/` holds the content
 * accessor root while the archive root holds the package). The
 * `prefix` is a posix path relative to the tree root; every rule-supplied
 * path is resolved as `<prefix>/<path>` before dispatching to the tree.
 *
 * Bounds enforcement matches {@link makeVftSkillFileAccessor} — path traversal
 * checks run on the caller-supplied path before the prefix is applied, so
 * rules still cannot escape above the scoped root.
 *
 * The prefix itself is normalized posix (leading `./` and trailing `/` stripped);
 * an empty or `.` prefix is equivalent to {@link makeVftSkillFileAccessor}.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeVftSkillFileAccessorScoped = (
  tree: VFTNode,
  prefix: string,
): SkillFileAccessor => {
  const normalizedPrefix = normalizePrefix(prefix);
  if (normalizedPrefix === "") {
    return makeVftSkillFileAccessor(tree);
  }
  const join = (path: string): string =>
    path === "" ? normalizedPrefix : `${normalizedPrefix}/${path}`;
  return {
    exists: (path) => {
      const normalized = normalizeAndCheck(path);
      if (normalized.kind !== "ok") {
        return Effect.succeed(false);
      }
      return Effect.succeed(tree.hasFile(join(normalized.path)));
    },
    readBytes: (path) => {
      const normalized = normalizeAndCheck(path);
      if (normalized.kind === "escape") {
        return failFileAccess(path, "path-escape", `path escapes the accessor root: ${path}`);
      }
      const bytes = tree.getFile(join(normalized.path));
      if (bytes === undefined) {
        return failFileAccess(path, "read-error", `file not found at ${path}`);
      }
      return Effect.succeed(bytes);
    },
  };
};

const normalizePrefix = (prefix: string): string => {
  const stripped = prefix.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (stripped === "" || stripped === ".") {
    return "";
  }
  return stripped;
};

// -----------------------------------------------------------------------------
// Path normalization + bounds
// -----------------------------------------------------------------------------

type NormalizeResult = { readonly kind: "ok"; readonly path: string } | { readonly kind: "escape" };

const normalizeAndCheck = (path: string): NormalizeResult => {
  if (path === "" || path === "." || path === "./") {
    return { kind: "ok", path: "" };
  }
  // Windows drive letters (`C:/`) and absolute posix paths both count as
  // escape attempts at a skill-rooted accessor.
  if (/^[a-z]:[\\/]/i.test(path) || path.startsWith("/") || path.startsWith("\\")) {
    return { kind: "escape" };
  }
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  for (const segment of segments) {
    if (segment === "..") {
      return { kind: "escape" };
    }
  }
  return { kind: "ok", path: normalized };
};

const failFileAccess = (
  path: string,
  reason: FileAccessError["reason"],
  message: string,
): Effect.Effect<Uint8Array, FileAccessError> =>
  Effect.fail({
    _tag: "FileAccessError" as const,
    path,
    reason,
    message,
  });
