/**
 * Private environment and home-directory helpers for extension-workspace.
 *
 * Deliberately duplicated from the CLI-destined environment module: the
 * kernel may not depend on application utilities, and these helpers are
 * within the sanctioned duplication budget for small pure functions.
 *
 * @experimental This API is unstable and may change without notice.
 */

// Intentional escape hatch: node:os homedir() has no @effect/platform equivalent.
// Wrapped in Effect.sync so execution is deferred — no eager module-level I/O.
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

// eslint-disable-next-line no-restricted-properties -- Centralized env var access point; all callers use these helpers
const readEnv = (name: string): string | undefined => process.env[name];

/** Read an optional env var. Centralized access point for process.env. */
export const envOption = (name: string): Effect.Effect<Option.Option<string>> =>
  Effect.sync(() => Option.fromUndefinedOr(readEnv(name)));

/** Resolve the user's home directory. */
export const getHome = Effect.sync(() => os.homedir());

/**
 * Resolve the XDG config home directory.
 *
 * Uses `XDG_CONFIG_HOME` if set, otherwise defaults to `~/.config`.
 */
export const getConfigHome = Effect.gen(function* () {
  const p = yield* Path.Path;
  const envOpt = yield* envOption("XDG_CONFIG_HOME");
  if (Option.isSome(envOpt)) return envOpt.value;
  const home = yield* getHome;
  return p.join(home, ".config");
});
