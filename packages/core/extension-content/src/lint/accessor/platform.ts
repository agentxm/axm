/**
 * Platform-backed `ExtensionFileAccessor` for `axm lint` and the publish gate.
 *
 * Maps accessor-relative posix paths to on-disk absolute paths rooted at a
 * caller-supplied directory. The caller picks the root per extension type
 * and provenance; the accessor itself is type- and provenance-agnostic, so
 * rules see one uniform contract:
 *
 * - **Skill content (`files`):** the native package's `src/` directory, or
 *   the selected directory of a portable Agent Skill.
 * - **Skill package (`packageFiles`) and every other type:** the package
 *   directory holding the type's manifest (`skill.json`, `pack.json`,
 *   `hook.json`, ...). Packs and the other manifest-rooted types have no
 *   `src/` split at the accessor root.
 *
 * Bounds enforcement:
 *
 * - No `..` segments in accessor-relative paths.
 * - No absolute paths (posix or Windows drive letters).
 * - Resolved absolute paths are verified to stay under the accessor root.
 *
 * The accessor is built via a factory that captures pre-resolved
 * `FileSystem.FileSystem` + `Path.Path` services and an absolute root, so
 * `ExtensionFileAccessor` stays Layer-free at rule-evaluation time (per
 * `lint-engine` spec "Rule contexts expose narrow caller-bound accessors").
 * It mirrors the VFT-backed accessor in `./vft.ts`; the two are the only
 * `ExtensionFileAccessor` implementations, one for on-disk roots and one for
 * an extracted archive.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { ExtensionFileAccessor, FileAccessError } from "../context.js";

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Platform services needed by the platform-backed accessor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FileAccessorPlatform {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}

type ResolveResult =
  { readonly kind: "ok"; readonly absolute: string } | { readonly kind: "escape" };

/**
 * Build a platform-backed `ExtensionFileAccessor` rooted at `absoluteRoot`.
 *
 * `absoluteRoot` SHOULD be an absolute directory path; a relative one is
 * resolved against the process working directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makePlatformFileAccessor = (
  platform: FileAccessorPlatform,
  absoluteRoot: string,
): ExtensionFileAccessor => {
  const { fs, path } = platform;
  const normalizedRoot = path.resolve(absoluteRoot);

  const resolveWithinRoot = (input: string): ResolveResult => {
    if (input === "" || input === "." || input === "./") {
      return { kind: "ok", absolute: normalizedRoot };
    }
    if (/^[a-z]:[\\/]/i.test(input) || input.startsWith("/") || input.startsWith("\\")) {
      return { kind: "escape" };
    }
    const normalized = input.replace(/\\/g, "/").replace(/^\.\//, "");
    for (const segment of normalized.split("/")) {
      if (segment === "..") {
        return { kind: "escape" };
      }
    }
    const absolute = path.resolve(normalizedRoot, normalized);
    if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}${path.sep}`)) {
      return { kind: "escape" };
    }
    return { kind: "ok", absolute };
  };

  const makeAccessError = (
    p: string,
    reason: FileAccessError["reason"],
    message: string,
  ): FileAccessError => ({
    _tag: "FileAccessError" as const,
    path: p,
    reason,
    message,
  });

  return {
    exists: (p) => {
      const resolved = resolveWithinRoot(p);
      if (resolved.kind !== "ok") {
        return Effect.succeed(false);
      }
      return fs.exists(resolved.absolute).pipe(Effect.catch(() => Effect.succeed(false)));
    },
    readBytes: (p) => {
      const resolved = resolveWithinRoot(p);
      if (resolved.kind === "escape") {
        return Effect.fail(
          makeAccessError(p, "path-escape", `path escapes the accessor root: ${p}`),
        );
      }
      return fs
        .readFile(resolved.absolute)
        .pipe(
          Effect.mapError((cause) =>
            makeAccessError(p, "read-error", `read failed at ${p}: ${String(cause)}`),
          ),
        );
    },
  };
};
