import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

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
