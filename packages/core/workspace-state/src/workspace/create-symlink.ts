import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { SymlinkCreationError } from "./errors.js";
import { protectCreatedAncestors, protectWorkspacePath } from "./transaction.js";
import { recordFootprint } from "./footprint-recorder.js";
import { resolveParentSymlinks } from "../utils/resolve-parent-symlinks.js";

/**
 * Result of a createSymlink operation.
 *
 * - `"created"` — new symlink was created
 * - `"replaced"` — existing wrong symlink/directory was replaced
 * - `"no-op"` — existing symlink already points to the correct target
 * - `"skipped"` — self-reference detected (link and target resolve to same path)
 */
export type SymlinkResult = "created" | "replaced" | "no-op" | "skipped";

/**
 * Creates a relative symlink from `link` to `target`, handling the full
 * symlink lifecycle: self-reference detection, existing link inspection,
 * ELOOP recovery, directory replacement, and parent directory creation.
 *
 * Relative paths are computed using resolved parent directories to handle
 * cases where parent directories are themselves symlinks.
 */
export const createSymlink = (opts: { readonly target: string; readonly link: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;

    // Resolve both paths through parent symlinks for accurate comparison
    const resolvedTarget = yield* resolveParentSymlinks(opts.target).pipe(
      Effect.mapError(
        (cause) => new SymlinkCreationError({ path: opts.target, step: "resolve-target", cause }),
      ),
    );
    const resolvedLink = yield* resolveParentSymlinks(opts.link).pipe(
      // Link parent may not exist yet — fall back to the raw path
      Effect.catch(() => Effect.succeed(opts.link)),
    );

    // Self-reference detection: skip if both resolve to the same location
    if (resolvedTarget === resolvedLink) {
      return "skipped" as const;
    }

    // Compute relative path from resolved parent dirs
    const resolvedLinkParent = p.dirname(resolvedLink);
    const relTarget = p.relative(resolvedLinkParent, resolvedTarget);

    // Check what currently exists at the link path
    const existingResult = yield* inspectExisting(fs, p, opts.link, resolvedTarget);
    if (existingResult === "no-op") return "no-op" as const;
    yield* protectWorkspacePath(opts.link);

    // If something exists that needs replacing, remove it
    if (existingResult === "replace") {
      yield* fs
        .remove(opts.link, { recursive: true })
        .pipe(
          Effect.mapError(
            (cause) =>
              new SymlinkCreationError({ path: opts.link, step: "remove-existing", cause }),
          ),
        );
    }

    // Create parent directories
    const linkParent = p.dirname(opts.link);
    yield* protectCreatedAncestors(fs, p, linkParent);
    yield* fs
      .makeDirectory(linkParent, { recursive: true })
      .pipe(
        Effect.mapError(
          (cause) => new SymlinkCreationError({ path: linkParent, step: "mkdir-parent", cause }),
        ),
      );

    // Create the symlink
    yield* fs
      .symlink(relTarget, opts.link)
      .pipe(
        Effect.mapError(
          (cause) => new SymlinkCreationError({ path: opts.link, step: "symlink", cause }),
        ),
      );
    yield* recordFootprint({
      path: opts.link,
      change: existingResult === "replace" ? "modified" : "created",
    });

    return existingResult === "replace" ? ("replaced" as const) : ("created" as const);
  });

/**
 * Inspect what exists at the link path.
 *
 * Uses readLink to detect symlinks (since Effect's FileSystem.stat always
 * follows symlinks — there is no lstat equivalent). Falls back to stat
 * for non-symlink entries.
 */
const inspectExisting = (
  fs: FileSystem.FileSystem,
  p: Path.Path,
  linkPath: string,
  resolvedAbsTarget: string,
) =>
  Effect.gen(function* () {
    // Try readLink first — succeeds only if linkPath is a symlink
    const linkTarget = yield* fs.readLink(linkPath).pipe(Effect.option);

    if (Option.isSome(linkTarget)) {
      // It's a symlink — check if it points to the correct target
      const linkParent = p.dirname(linkPath);
      const currentAbsTarget = p.resolve(linkParent, linkTarget.value);

      // Resolve through realpath for cases where parent dirs are symlinks
      const resolvedCurrentTarget = yield* fs
        .realPath(currentAbsTarget)
        .pipe(Effect.catch(() => Effect.succeed(currentAbsTarget)));

      if (resolvedCurrentTarget === resolvedAbsTarget) return "no-op" as const;

      return "replace" as const;
    }

    // Not a symlink — check if anything else exists (directory, file)
    const stat = yield* fs.stat(linkPath).pipe(Effect.option);
    if (Option.isSome(stat)) return "replace" as const;

    return "create" as const;
  });
