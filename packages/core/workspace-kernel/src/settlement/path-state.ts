import { createHash } from "node:crypto";

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

/** Flat entry observations allow one writer's delta to update only its own subtree. */
export type PathState = ReadonlyMap<string, string>;

/** Existing directory routes only: later AXM-created ancestors are covered by their snapshots. */
export const observeAncestorRoute = (fs: FileSystem.FileSystem, path: Path.Path, target: string) =>
  Effect.gen(function* () {
    const route = new Map<string, string>();
    let parent = path.dirname(target);
    while (true) {
      const observed = yield* fs.stat(parent).pipe(Effect.result);
      if (observed._tag === "Failure") {
        if (observed.failure.reason._tag !== "NotFound") return yield* observed.failure;
      } else {
        const info = observed.success;
        const physical = yield* fs.realPath(parent);
        route.set(
          parent,
          info.type !== "Directory" || Option.isNone(info.ino) || Option.isNone(info.birthtime)
            ? "unreadable"
            : `${physical}:${info.dev}:${info.ino.value}:${info.birthtime.value.getTime()}:${info.mode}`,
        );
      }
      const next = path.dirname(parent);
      if (next === parent) return route;
      parent = next;
    }
  });

export const observePathState = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
): Effect.Effect<PathState> =>
  Effect.gen(function* () {
    const link = yield* fs.readLink(target).pipe(Effect.option);
    if (Option.isSome(link)) return new Map([["", `link:${link.value}`]]);
    const info = yield* fs.stat(target).pipe(Effect.result);
    if (info._tag === "Failure") {
      return new Map([["", info.failure.reason._tag === "NotFound" ? "absent" : "unreadable"]]);
    }
    const identity = `${info.success.dev}:${Option.getOrElse(info.success.ino, () => -1)}:${Option.match(info.success.birthtime, { onNone: () => -1, onSome: (value) => value.getTime() })}:${info.success.mode}`;
    if (info.success.type !== "Directory") {
      const bytes = yield* fs.readFile(target);
      return new Map([
        ["", `file:${identity}:${createHash("sha256").update(bytes).digest("hex")}`],
      ]);
    }
    const entries = yield* fs.readDirectory(target);
    const state = new Map([["", `directory:${identity}`]]);
    for (const entry of entries) {
      const child = yield* observePathState(fs, path, path.join(target, entry));
      for (const [name, value] of child) state.set(path.join(entry, name), value);
    }
    return state;
  }).pipe(Effect.catch(() => Effect.succeed(new Map([["", "unreadable"]]))));

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
