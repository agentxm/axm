/** Read sharing for a single stable phase. Never retain this context across writes. */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { CanonicalNativePath } from "../../locations/index.js";

export const makeObservationReadView = (
  fs: FileSystem.FileSystem,
  canonical: Context.Service.Shape<typeof CanonicalNativePath>,
) => {
  const share = <A, E>(read: (target: string) => Effect.Effect<A, E>) => {
    const cells = new Map<string, Effect.Effect<A, E>>();
    return (target: string) =>
      Effect.gen(function* () {
        // Preserve spelling: resolving .. can change traversal through a symlink.
        const key = target;
        const previous = cells.get(key);
        if (previous !== undefined) return yield* previous;
        const created = yield* Effect.cached(read(key));
        const selected = cells.get(key) ?? created;
        cells.set(key, selected);
        return yield* selected;
      });
  };
  const readDirectory = share((target) => fs.readDirectory(target));
  const readFileString = share((target) => fs.readFileString(target));
  const captured: FileSystem.FileSystem = {
    ...fs,
    exists: share((target) => fs.exists(target)),
    stat: share((target) => fs.stat(target)),
    realPath: share((target) => fs.realPath(target)),
    readLink: share((target) => fs.readLink(target)),
    readFile: share((target) => fs.readFile(target)),
    readFileString: (target, encoding) =>
      encoding === undefined || encoding === "utf8"
        ? readFileString(target)
        : fs.readFileString(target, encoding),
    readDirectory: (target, options) =>
      options === undefined ? readDirectory(target) : fs.readDirectory(target, options),
  };
  return Context.make(FileSystem.FileSystem, captured).pipe(
    Context.add(CanonicalNativePath, canonical === undefined ? undefined : share(canonical)),
  );
};
