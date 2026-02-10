/**
 * Local source parsers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import type { ParseError } from "../errors.js";
import type { LocalSourceInput } from "../types.js";

/**
 * Parse a local filesystem path.
 */
export const parseLocalPath = (input: string): Effect.Effect<LocalSourceInput, ParseError> => {
  return Effect.succeed({ source: "local" as const, path: input });
};
