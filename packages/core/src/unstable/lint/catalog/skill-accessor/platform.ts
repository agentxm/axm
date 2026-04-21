/**
 * Platform-backed `SkillFileAccessor` for `axm lint`.
 *
 * Maps accessor-relative posix paths to on-disk absolute paths rooted at
 * the caller-supplied skill-root directory. Layout conventions per
 * `docs/design/lint-engine.md §3` "Skill accessor root":
 *
 * - **Native (registry-installed):**
 *   `<workspaceRoot>/.axm/extensions/<@owner>/skills/<sanitized-name>/src/`
 * - **Non-native (managed external):**
 *   `<workspaceRoot>/.axm/extensions/external/skills/<sanitized-name>/`
 *
 * The accessor is provenance-agnostic — rules see one uniform contract and
 * never branch on native-vs-non-native. The caller (`buildSkillRuleContexts`
 * or the CLI entry point) picks the root.
 *
 * Bounds enforcement:
 *
 * - No `..` segments in accessor-relative paths.
 * - No absolute paths (posix or Windows drive letters).
 * - Resolved absolute paths are verified to stay under the accessor root.
 *
 * The accessor is built via a factory that captures a pre-resolved
 * `FileSystem.FileSystem` + `Path.Path` services and an absolute root, so
 * `SkillFileAccessor` stays Layer-free at rule-evaluation time (per
 * `lint-engine` spec "Rule contexts expose narrow caller-bound accessors").
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { FileAccessError, SkillFileAccessor } from "../../context.js";

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Platform services needed by the platform-backed skill accessor.
 */
export interface SkillAccessorPlatform {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}

type ResolveResult =
  | { readonly kind: "ok"; readonly absolute: string }
  | { readonly kind: "escape" };

/**
 * Build a platform-backed `SkillFileAccessor` rooted at `absoluteRoot`.
 *
 * `absoluteRoot` SHOULD be the absolute path to the skill root directory
 * (either `.../src/` for native, or `.../external/skills/<name>/` for
 * non-native). The caller typically sources it from `computeSkillPaths` in
 * `../../../skills/paths.ts`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makePlatformSkillFileAccessor = (
  platform: SkillAccessorPlatform,
  absoluteRoot: string,
): SkillFileAccessor => {
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
