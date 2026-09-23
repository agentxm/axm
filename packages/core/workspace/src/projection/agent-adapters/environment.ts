/**
 * Private environment helpers for workspace agent adapters.
 *
 * Deliberately duplicated from the CLI-destined environment module: the
 * integration may not depend on application utilities, and these helpers are
 * within the sanctioned duplication budget for small pure functions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Config from "effect/Config";

/** Values and absence follow the active provider; source failures remain typed. */
export const envOption = (name: string) => Config.option(Config.String(name));
