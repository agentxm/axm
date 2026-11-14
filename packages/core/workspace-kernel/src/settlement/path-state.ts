import { withWork } from "@agentxm/host-primitives/work-observation";
import { createHash } from "node:crypto";

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import { nativeInode } from "../locations/index.js";

/** Flat entry observations allow one writer's delta to update only its own subtree. */
export type PathState = ReadonlyMap<string, string>;

/**
 * Entry identity a publication carries from before its write became visible:
 * the identity a `file:` observation of the published entry must show. None
 * when the entry could never be observed as a file with that identity.
 */
export const publicationIdentity = (info: FileSystem.File.Info): Option.Option<string> => {
  const inode = nativeInode(info);
  if (info.type !== "File" || Option.isNone(inode) || Option.isNone(info.birthtime))
    return Option.none();
  return Option.some(`${info.dev}:${inode.value}:${info.birthtime.value.getTime()}:${info.mode}`);
};

/** Ancestors of `target`, nearest first, stopping after `through` when the walk meets it. */
const walkAncestors = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  through: string | undefined,
) {
  const route = new Map<string, string>();
  let parent = path.dirname(target);
  while (true) {
    const observed = yield* fs.stat(parent).pipe(Effect.result);
    if (observed._tag === "Failure") {
      if (observed.failure.reason._tag !== "NotFound") return yield* observed.failure;
    } else {
      const info = observed.success;
      const physical = yield* fs.realPath(parent);
      const inode = nativeInode(info);
      route.set(
        parent,
        info.type !== "Directory" || Option.isNone(inode) || Option.isNone(info.birthtime)
          ? "unreadable"
          : `${physical}:${info.dev}:${inode.value}:${info.birthtime.value.getTime()}:${info.mode}`,
      );
    }
    const next = path.dirname(parent);
    if (parent === through || next === parent) return route;
    parent = next;
  }
});

/** Existing directory routes only: later AXM-created ancestors are covered by their snapshots. */
export const observeAncestorRoute = (fs: FileSystem.FileSystem, path: Path.Path, target: string) =>
  walkAncestors(fs, path, target, undefined);

/**
 * The route baseline of `target` under `nativeRoot`: the target's ancestor
 * walk merged with the root's, the root walk's values winning for shared
 * ancestors. A target at or under the root walks only up to the root, so the
 * ancestors above it are walked once, by the later root walk.
 */
export const observeNativeRoute = Effect.fnUntraced(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  nativeRoot: string,
) {
  const underRoot = target === nativeRoot || target.startsWith(`${nativeRoot}${path.sep}`);
  const targetWalk =
    target === nativeRoot
      ? new Map<string, string>()
      : yield* walkAncestors(fs, path, target, underRoot ? nativeRoot : undefined);
  return new Map([...targetWalk, ...(yield* observeAncestorRoute(fs, path, nativeRoot))]);
});

/**
 * One observation. `root` is the state's `""` value; `bytes` holds the
 * content read for a non-directory root only.
 */
interface EntryObservation {
  readonly root: string;
  readonly state: PathState;
  readonly bytes: Option.Option<Uint8Array>;
}

/** Selects, from a directory's own root value, which of its children are observed. */
type Descent = (root: string) => (child: string) => boolean;

const everyChild: Descent = () => () => true;

const unobservable = (root: string): EntryObservation => ({
  root,
  state: new Map([["", root]]),
  bytes: Option.none(),
});

const observeEntry = Effect.fnUntraced(
  function* (
    fs: FileSystem.FileSystem,
    path: Path.Path,
    target: string,
    descent: Descent,
  ): Effect.fn.Return<EntryObservation, PlatformError> {
    const link = yield* fs.readLink(target).pipe(Effect.option);
    if (Option.isSome(link)) return unobservable(`link:${link.value}`);
    const info = yield* fs.stat(target).pipe(Effect.result);
    if (info._tag === "Failure") {
      return unobservable(info.failure.reason._tag === "NotFound" ? "absent" : "unreadable");
    }
    const inode = nativeInode(info.success);
    if (Option.isNone(inode) || Option.isNone(info.success.birthtime))
      return unobservable("unreadable");
    const identity = `${info.success.dev}:${inode.value}:${info.success.birthtime.value.getTime()}:${info.success.mode}`;
    if (info.success.type !== "Directory") {
      const bytes = yield* fs.readFile(target);
      const digest = yield* Effect.sync(() =>
        createHash("sha256").update(bytes).digest("hex"),
      ).pipe((effect) =>
        withWork("axm.hash.preimage", effect, {
          attributes: { "axm.work.count": 1, "axm.work.bytes": bytes.byteLength },
        }),
      );
      const root = `file:${identity}:${digest}`;
      return { root, state: new Map([["", root]]), bytes: Option.some(bytes) };
    }
    const entries = yield* fs.readDirectory(target);
    const root = `directory:${identity}`;
    const state = new Map([["", root]]);
    const observed = descent(root);
    for (const entry of entries) {
      if (!observed(entry)) continue;
      const child = yield* observePathState(fs, path, path.join(target, entry));
      for (const [name, value] of child) state.set(path.join(entry, name), value);
    }
    return { root, state, bytes: Option.none() };
  },
  Effect.catch(() => Effect.succeed(unobservable("unreadable"))),
);

export const observePathState = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
): Effect.Effect<PathState> =>
  observeEntry(fs, path, target, everyChild).pipe(Effect.map(({ state }) => state));

/**
 * Readback of a just-published file: the same observation as
 * `observePathState`, plus the bytes it read and digested, so verification
 * can compare them with the intended content without a second digest.
 */
export const observePublishedFile = (fs: FileSystem.FileSystem, path: Path.Path, target: string) =>
  observeEntry(fs, path, target, everyChild);

/**
 * The root value `observePathState` would report, observed the same way —
 * a directory is still listed — without visiting any child.
 */
export const observePathEntry = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
): Effect.Effect<string> =>
  observeEntry(fs, path, target, () => () => false).pipe(Effect.map(({ root }) => root));

/**
 * `observePathState`, except that a directory whose root value equals
 * `whenRoot` (or any directory when `whenRoot` is omitted) does not observe
 * its direct child `excludedChild`. For a caller that reads that subtree
 * itself within the same boundary; every other child is observed in full.
 */
export const observePathStateExcept = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  excludedChild: string,
  whenRoot?: string,
): Effect.Effect<PathState> =>
  observeEntry(fs, path, target, (root) =>
    whenRoot === undefined || root === whenRoot ? (child) => child !== excludedChild : () => true,
  ).pipe(Effect.map(({ state }) => state));

export const equalPathStates = (left: PathState, right: PathState): boolean =>
  left.size === right.size &&
  [...left].every(([key, value]) => value !== "unreadable" && right.get(key) === value);

/** File content may differ while its original directory entry remains intact. */
export const sameRootEntry = (left: PathState, right: PathState): boolean => {
  const before = left.get("");
  const after = right.get("");
  if (before === undefined || after === undefined) return false;
  if (before.startsWith("directory:")) return before === after;
  if (!before.startsWith("file:") || !after.startsWith("file:")) return false;
  return before.slice(0, before.lastIndexOf(":")) === after.slice(0, after.lastIndexOf(":"));
};

/** Update only the observed writer's subtree; unrelated foreign siblings stay detectable. */
export const replacePathState = (
  path: Path.Path,
  previous: PathState,
  relative: string,
  next: PathState,
): PathState => {
  if (relative === "") return next;
  const updated = new Map(
    [...previous].filter(
      ([name]) => name !== relative && !name.startsWith(`${relative}${path.sep}`),
    ),
  );
  if (next.get("") !== "absent") {
    for (const [name, value] of next) updated.set(path.join(relative, name), value);
  }
  return updated;
};
