import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { SymlinkCreationError } from "./errors.js";
import {
  protectCreatedAncestors,
  protectWorkspacePath,
  recordFootprint,
} from "../../settlement/index.js";
import {
  resolveNativeEntry,
  resolveNativeReferent,
  type NativeEntryAddress,
} from "../../locations/index.js";

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
    const resolvedTarget = yield* resolveNativeReferent(opts.target).pipe(
      Effect.mapError(
        (cause) => new SymlinkCreationError({ path: opts.target, step: "resolve-target", cause }),
      ),
    );
    const linkAddress = yield* resolveNativeEntry(opts.link).pipe(
      Effect.mapError(
        (cause) => new SymlinkCreationError({ path: opts.link, step: "resolve-target", cause }),
      ),
    );
    const resolvedLink = linkAddress.entryPath;

    // Self-reference detection: skip if both resolve to the same location
    if (resolvedTarget === resolvedLink) {
      return "skipped" as const;
    }

    // Compute relative path from resolved parent dirs
    const resolvedLinkParent = p.dirname(resolvedLink);
    const relTarget = p.relative(resolvedLinkParent, resolvedTarget);

    // Check what currently exists at the link path. Resolution just observed
    // that entry; when it is the exact absolute spelling of the link, decide
    // from that observation instead of inspecting the same entry again.
    const existingResult =
      p.resolve(opts.link) === opts.link && opts.link === linkAddress.entryPath
        ? yield* decideFromAddress(p, opts.link, linkAddress, resolvedTarget)
        : yield* inspectExisting(fs, p, opts.link, resolvedTarget);
    if (existingResult === "no-op") return "no-op" as const;
    yield* protectWorkspacePath(opts.link);
    const linkParent = p.dirname(opts.link);
    yield* protectCreatedAncestors(fs, p, linkParent);

    // Native mutations can finish after interruption. Record their postimage
    // before allowing interruption to start rollback.
    yield* Effect.uninterruptible(
      Effect.gen(function* () {
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

        yield* fs
          .makeDirectory(linkParent, { recursive: true })
          .pipe(
            Effect.mapError(
              (cause) =>
                new SymlinkCreationError({ path: linkParent, step: "mkdir-parent", cause }),
            ),
          );
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
      }),
    );

    return existingResult === "replace" ? ("replaced" as const) : ("created" as const);
  });

/** Decide whether an existing symlink at `linkPath` with `linkTarget` text is already correct. */
const compareExistingLink = (
  p: Path.Path,
  linkPath: string,
  linkTarget: string,
  resolvedAbsTarget: string,
) =>
  Effect.gen(function* () {
    // Link text is relative to the link's lexical parent.
    const linkParent = p.dirname(linkPath);
    const currentAbsTarget = p.resolve(linkParent, linkTarget);

    // Resolve through realpath for cases where parent dirs are symlinks
    const resolvedCurrentTarget = yield* resolveNativeEntry(currentAbsTarget).pipe(
      Effect.map((entry) => entry.entryPath),
      Effect.mapError(
        (cause) =>
          new SymlinkCreationError({ path: currentAbsTarget, step: "resolve-target", cause }),
      ),
    );

    if (resolvedCurrentTarget === resolvedAbsTarget) return "no-op" as const;

    return "replace" as const;
  });

/**
 * Decide from the entry resolution observed at the exact link path: its link
 * text for a symlink, otherwise whether any entry exists there.
 */
const decideFromAddress = (
  p: Path.Path,
  linkPath: string,
  address: NativeEntryAddress,
  resolvedAbsTarget: string,
) =>
  address.linkTarget !== undefined
    ? compareExistingLink(p, linkPath, address.linkTarget, resolvedAbsTarget)
    : Effect.succeed(address.kind === "absent" ? ("create" as const) : ("replace" as const));

/**
 * Inspect what exists at the link path.
 *
 * Uses readLink to retain the target text of symlinks. Falls back to stat
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
      return yield* compareExistingLink(p, linkPath, linkTarget.value, resolvedAbsTarget);
    }

    // Not a symlink — check if anything else exists (directory, file)
    const stat = yield* fs.stat(linkPath).pipe(Effect.option);
    if (Option.isSome(stat)) return "replace" as const;

    return "create" as const;
  });
