/**
 * Private environment helpers for agent-integration.
 *
 * Deliberately duplicated from the CLI-destined environment module: the
 * integration may not depend on application utilities, and these helpers are
 * within the sanctioned duplication budget for small pure functions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// eslint-disable-next-line no-restricted-properties -- Centralized env var access point; all callers use these helpers
const readEnv = (name: string): string | undefined => process.env[name];

/** Read an optional env var. Centralized access point for process.env. */
export const envOption = (name: string): Effect.Effect<Option.Option<string>> =>
  Effect.sync(() => Option.fromUndefinedOr(readEnv(name)));
