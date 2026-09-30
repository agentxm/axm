import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import { nativeInode } from "./native-inode.js";

export class NativeLocationError extends Data.TaggedError("NativeLocationError")<{
  readonly target: string;
  readonly reason:
    | "unreadable"
    | "dangling-ancestor"
    | "escape"
    | "workspace-conflict"
    | "source-overlap"
    | "hardlink";
  readonly cause?: unknown;
}> {}

export interface NativeEntryAddress {
  readonly lexicalPath: string;
  /** Resolve the parent, preserving the leaf entry rather than following its link. */
  readonly entryPath: string;
  /** Undefined for a dangling leaf; missing ordinary leaves retain their future physical path. */
  readonly referentPath: string | undefined;
  readonly kind: "absent" | "symlink" | "file" | "directory" | "other";
  readonly linkTarget: string | undefined;
  readonly device: number | undefined;
  readonly inode: string | undefined;
  readonly links: number | undefined;
}

const notFound = (error: PlatformError.PlatformError): boolean => error.reason._tag === "NotFound";

/** A captured filesystem owns this spelling prefix; resolution must stay inside its read capability. */
export const NativeResolutionRoot = Context.Reference<string | undefined>(
  "@agentxm/workspace-kernel/locations/NativeResolutionRoot",
  { defaultValue: () => undefined },
);

/** realPath can retain caller spelling; actual directory entries establish volume identity. */
const existingNativeSpelling = (target: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = (yield* NativeResolutionRoot) ?? path.parse(target).root;
    let current = /^[a-z]:\\$/i.test(root) ? root.toUpperCase() : root;
    for (const name of path.relative(root, target).split(path.sep).filter(Boolean)) {
      const entries = yield* fs.readDirectory(current);
      if (entries.includes(name)) {
        current = path.join(current, name);
        continue;
      }
      const supplied = path.join(current, name);
      const info = yield* fs.stat(supplied);
      const inode = yield* nativeInode(supplied, info);
      if (Option.isNone(inode))
        return yield* new NativeLocationError({ target, reason: "unreadable" });
      const folded = entries.filter((entry) => entry.toLowerCase() === name.toLowerCase());
      // A short-name alias need not have a textual match. Compare real entries,
      // never lowercase a volume's paths or assume case-insensitive behavior.
      const candidates = folded.length === 1 ? folded : entries;
      const matches = yield* Effect.forEach(candidates, (entry) =>
        Effect.gen(function* () {
          const candidate = path.join(current, entry);
          const observed = yield* fs.stat(candidate);
          const observedInode = yield* nativeInode(candidate, observed);
          return Option.isSome(observedInode) &&
            observed.dev === info.dev &&
            observedInode.value === inode.value &&
            observed.mode === info.mode &&
            Option.getOrUndefined(observed.birthtime)?.getTime() ===
              Option.getOrUndefined(info.birthtime)?.getTime()
            ? Option.some(entry)
            : Option.none<string>();
        }),
      );
      const names = matches.flatMap((entry) => (Option.isSome(entry) ? [entry.value] : []));
      const actual = names[0];
      if (names.length !== 1 || actual === undefined)
        return yield* new NativeLocationError({ target, reason: "unreadable" });
      current = path.join(current, actual);
    }
    return current;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof NativeLocationError
        ? cause
        : new NativeLocationError({ target, reason: "unreadable", cause }),
    ),
  );

/** Resolve missing suffixes through the nearest existing physical ancestor. */
export const resolveNativeReferent = (
  target: string,
): Effect.Effect<string, NativeLocationError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let current = path.resolve(target);
    const suffix: Array<string> = [];
    while (true) {
      const resolved = yield* fs.realPath(current).pipe(Effect.result);
      if (resolved._tag === "Success")
        return path.join(yield* existingNativeSpelling(resolved.success), ...suffix.reverse());
      if (!notFound(resolved.failure)) {
        return yield* new NativeLocationError({
          target,
          reason: "unreadable",
          cause: resolved.failure,
        });
      }
      // exists() follows the leaf and mistakes a dangling link for absence.
      const link = yield* fs.readLink(current).pipe(Effect.option);
      if (Option.isSome(link)) {
        return yield* new NativeLocationError({ target, reason: "dangling-ancestor" });
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return yield* new NativeLocationError({
          target,
          reason: "unreadable",
          cause: resolved.failure,
        });
      }
      suffix.push(path.basename(current));
      current = parent;
    }
  });

export const resolveNativeEntry = (
  target: string,
): Effect.Effect<NativeEntryAddress, NativeLocationError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lexicalPath = path.resolve(target);
    const parent = yield* resolveNativeReferent(path.dirname(lexicalPath));
    const entryPath = path.join(parent, path.basename(lexicalPath));
    const link = yield* fs.readLink(entryPath).pipe(Effect.option);
    let canonicalEntry = entryPath;
    if (Option.isSome(link)) {
      const entries = yield* fs
        .readDirectory(parent)
        .pipe(
          Effect.mapError(
            (cause) => new NativeLocationError({ target, reason: "unreadable", cause }),
          ),
        );
      const basename = path.basename(lexicalPath);
      if (!entries.includes(basename)) {
        // readLink already proved the supplied spelling exists. Consult the
        // directory's actual names instead of assuming every volume folds case.
        const matches = entries.filter((name) => name.toLowerCase() === basename.toLowerCase());
        const actual = matches[0];
        if (matches.length !== 1 || actual === undefined)
          return yield* new NativeLocationError({ target, reason: "unreadable" });
        canonicalEntry = path.join(parent, actual);
      }
    }
    const info = yield* fs.stat(entryPath).pipe(
      Effect.map(Option.some),
      Effect.catch((cause) =>
        notFound(cause)
          ? Effect.succeedNone
          : Effect.fail(new NativeLocationError({ target, reason: "unreadable", cause })),
      ),
    );
    const referentPath = Option.isSome(info)
      ? yield* resolveNativeReferent(entryPath)
      : Option.isSome(link)
        ? undefined
        : entryPath;
    const inode = Option.isSome(info)
      ? yield* nativeInode(entryPath, info.value)
      : Option.none<string>();
    return {
      lexicalPath,
      // Referent resolution supplies observed spelling for existing non-links, including case aliases.
      entryPath: Option.isNone(link) && referentPath !== undefined ? referentPath : canonicalEntry,
      referentPath,
      kind: Option.isSome(link)
        ? "symlink"
        : Option.isNone(info)
          ? "absent"
          : info.value.type === "File"
            ? "file"
            : info.value.type === "Directory"
              ? "directory"
              : "other",
      linkTarget: Option.getOrUndefined(link),
      device: Option.isSome(info) ? info.value.dev : undefined,
      inode: Option.getOrUndefined(inode),
      links: Option.isSome(info) ? Option.getOrUndefined(info.value.nlink) : undefined,
    };
  });

const contains = (path: Path.Path, parent: string, child: string): boolean => {
  if (path.sep === "\\") {
    const root = path.resolve(parent);
    const target = path.resolve(child);
    return (
      target === root || target.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)
    );
  }
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
};

export const pathsOverlap = (path: Path.Path, left: string, right: string): boolean =>
  contains(path, left, right) || contains(path, right, left);

/** Source and output trees must not coincide, nest, or address the same hardlinked file. */
export const assertNoPhysicalOverlap = (
  source: string,
  target: string,
): Effect.Effect<void, NativeLocationError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const sourceAddress = yield* resolveNativeEntry(source);
    const targetAddress = yield* resolveNativeEntry(target);
    const sourcePath = sourceAddress.referentPath ?? sourceAddress.entryPath;
    const targetPath = targetAddress.referentPath ?? targetAddress.entryPath;
    const sameInode =
      sourceAddress.inode !== undefined &&
      sourceAddress.inode === targetAddress.inode &&
      sourceAddress.device === targetAddress.device;
    if (
      sourceAddress.kind === "file" &&
      targetAddress.kind === "file" &&
      (sourceAddress.inode === undefined || targetAddress.inode === undefined)
    )
      return yield* new NativeLocationError({
        target,
        reason: "unreadable",
        cause: "source-or-target-identity-unavailable",
      });
    if (
      sameInode ||
      pathsOverlap(path, sourcePath, targetPath) ||
      pathsOverlap(path, sourcePath, targetAddress.entryPath)
    ) {
      return yield* new NativeLocationError({ target, reason: "source-overlap" });
    }
  });

/**
 * Authorize the physical boundary beneath one workspace root. A nested workspace
 * is an independent writer; sharing its boundaries is refused. Content mutation
 * follows the leaf explicitly, while entry mutation preserves the leaf itself.
 */
export const assertNativeMutationWithin = (
  root: string,
  target: string,
  mutation: "entry" | "content" = "entry",
  ownerRoot: string = root,
): Effect.Effect<NativeEntryAddress, NativeLocationError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const physicalRoot = yield* resolveNativeReferent(root);
    const physicalOwnerRoot = yield* resolveNativeReferent(ownerRoot);
    const address = yield* resolveNativeEntry(target);
    const boundary = mutation === "content" ? address.referentPath : address.entryPath;
    if (boundary === undefined)
      return yield* new NativeLocationError({ target, reason: "dangling-ancestor" });
    if (!contains(path, physicalRoot, boundary))
      return yield* new NativeLocationError({ target, reason: "escape" });
    if (mutation === "content" && address.kind !== "directory" && (address.links ?? 1) > 1) {
      return yield* new NativeLocationError({ target, reason: "hardlink" });
    }
    let parent = path.dirname(boundary);
    while (parent !== physicalRoot && contains(path, physicalRoot, parent)) {
      if (parent === physicalOwnerRoot) {
        parent = path.dirname(parent);
        continue;
      }
      const conflict = yield* fs.exists(path.join(parent, "axm.json")).pipe(
        Effect.flatMap((settings) =>
          settings ? Effect.succeed(true) : fs.exists(path.join(parent, ".axm")),
        ),
        Effect.mapError(
          (cause) => new NativeLocationError({ target, reason: "unreadable", cause }),
        ),
      );
      if (conflict) return yield* new NativeLocationError({ target, reason: "workspace-conflict" });
      parent = path.dirname(parent);
    }
    return address;
  });
