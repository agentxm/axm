/**
 * Effectful path helpers for agent configuration directories.
 *
 * All path computation uses `@effect/platform` Path service. Consumers
 * must yield these in an Effect context.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { envOption, osHomeDirectory } from "@agentxm/host-primitives";

/**
 * Resolve the XDG config home directory.
 *
 * Uses `XDG_CONFIG_HOME` environment variable if set, otherwise defaults to `~/.config`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getConfigHome = Effect.gen(function* () {
  const p = yield* Path.Path;
  const envOpt = yield* envOption("XDG_CONFIG_HOME");
  if (Option.isSome(envOpt)) return envOpt.value;
  const home = yield* osHomeDirectory;
  return p.join(home, ".config");
});
