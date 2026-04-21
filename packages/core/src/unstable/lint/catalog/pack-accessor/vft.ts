/**
 * VFT-backed `PackFileAccessor` for publish callers.
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
 * - Empty path resolves to the accessor root itself.
 * - Any path containing a `..` segment raises `FileAccessError {
 *   reason: "path-escape" }` from `readBytes` and resolves to `false` from
 *   `exists`.
 * - Absolute paths (starting with `/` or a Windows drive letter) are
 *   treated as escape attempts.
 *
 * Mirrors the skill VFT accessor (`../skill-accessor/vft.ts`). The VFTNode
 * interface is intentionally the same so a publish caller can extract a
 * single archive once and pass the same tree to either accessor factory.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type { FileAccessError, PackFileAccessor } from "../../context.js";

// -----------------------------------------------------------------------------
// VFTNode — minimal interface the accessor needs
// -----------------------------------------------------------------------------

/**
 * Minimal shape of a Virtual File Tree consumed by the accessor.
 *
 * Shape-compatible with `../skill-accessor/vft.ts#VFTNode`; kept as a local
 * declaration to avoid a cross-subfolder import and to document what this
 * accessor uses.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackVFTNode {
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
 * Build a VFT-backed `PackFileAccessor` rooted at the tree's root.
 *
 * Callers that root the pack at a sub-path of the archive should pre-strip
 * that sub-path before constructing the tree — the accessor enforces no
 * `..` escape above the root it was given.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeVftPackFileAccessor = (tree: PackVFTNode): PackFileAccessor => {
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

// -----------------------------------------------------------------------------
// Path normalization + bounds
// -----------------------------------------------------------------------------

type NormalizeResult = { readonly kind: "ok"; readonly path: string } | { readonly kind: "escape" };

const normalizeAndCheck = (path: string): NormalizeResult => {
  if (path === "" || path === "." || path === "./") {
    return { kind: "ok", path: "" };
  }
  // Windows drive letters (`C:/`) and absolute posix paths both count as
  // escape attempts at a pack-rooted accessor.
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
