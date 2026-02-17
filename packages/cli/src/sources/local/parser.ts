/**
 * Local source parsers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import type { CliError } from "../../cli-error/index.js";
import type { LocalSourceInputLegacy } from "../types.js";

/**
 * Parse a local filesystem path.
 */
export const parseLocalPath = (input: string): Effect.Effect<LocalSourceInputLegacy, CliError> => {
  return Effect.succeed({ type: "local" as const, path: input });
};
