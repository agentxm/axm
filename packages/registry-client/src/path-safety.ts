/**
 * Path containment helper for archive extraction.
 *
 * Deliberately duplicated from the workspace-state kernel: an integration
 * may not depend on a kernel, and this helper is within the sanctioned
 * duplication budget for small pure functions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAbsolutePath, type AbsolutePath } from "@agentxm/extension-model/unstable/path-types";

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
