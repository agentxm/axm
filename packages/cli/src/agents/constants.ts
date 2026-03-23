/**
 * Effectful path helpers for agent configuration directories.
 *
 * All path computation uses `@effect/platform` Path service. Consumers
 * must yield these in an Effect context.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:os homedir() has no @effect/platform equivalent.
// Wrapped in Effect.sync so execution is deferred — no eager module-level I/O.
import * as os from "node:os";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CliEnvConfig } from "../config/index.js";

/**
 * Resolve the user's home directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getHome = Effect.sync(() => os.homedir());

/**
 * Resolve the XDG config home directory.
 *
 * Uses `XDG_CONFIG_HOME` environment variable if set, otherwise defaults to `~/.config`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getConfigHome = Effect.gen(function* () {
  const p = yield* Path.Path;
  const envConfig = yield* CliEnvConfig;
  const env = Option.getOrUndefined(envConfig.xdgConfigHome);
  if (env) return env;
  const home = yield* getHome;
  return p.join(home, ".config");
});
