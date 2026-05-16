import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAbsolutePath, type AbsolutePath } from "./path-types.js";

/**
 * Validates that a resolved target path stays within a base directory.
 * Uses path separator boundary check to prevent prefix false positives.
 */
export function isPathSafe(base: string, target: string): boolean {
  return Effect.runSync(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const resolvedBase = path.resolve(base);
      const resolvedTarget = path.resolve(target);
      return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
}

/**
 * Resolve `target` and return it only when it stays inside `base`.
 */
export const safeChildPath = (
  base: AbsolutePath,
  target: string,
): Effect.Effect<Option.Option<AbsolutePath>, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const resolvedBase = path.resolve(base);
    const resolvedTarget = path.isAbsolute(target)
      ? path.resolve(target)
      : path.resolve(resolvedBase, target);
    const safe =
      resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep);
    return safe ? Option.some(makeAbsolutePath(path, resolvedTarget)) : Option.none();
  });

/**
 * Synchronous variant for non-Effect call sites.
 */
export const safeChildPathSync = (
  base: AbsolutePath,
  target: string,
): Option.Option<AbsolutePath> =>
  Effect.runSync(safeChildPath(base, target).pipe(Effect.provide(NodeServices.layer)));
