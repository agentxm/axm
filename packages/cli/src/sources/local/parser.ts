/**
 * Local source parsers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import type { CliError } from "../../cli-error/index.js";
import type { LocalSourceInput } from "../types.js";

/**
 * Parse a local filesystem path.
 */
export const parseLocalPath = (input: string): Effect.Effect<LocalSourceInput, CliError> => {
  return Effect.succeed({ type: "local" as const, path: input });
};
