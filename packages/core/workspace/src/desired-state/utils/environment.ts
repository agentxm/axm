/**
 * Private environment and home-directory helpers for workspace-state.
 *
 * Deliberately duplicated from the CLI-destined environment module: the
 * kernel may not depend on application utilities, and these helpers are
 * within the sanctioned duplication budget for small pure functions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

/** Values and absence follow the active provider; source failures remain typed. */
export const envOption = (name: string) => Config.option(Config.String(name));

/** Resolve the user's home directory. */
export const getHome = Effect.sync(() => os.homedir());
