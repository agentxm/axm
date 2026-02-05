/**
 * Local source parsers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import type { ParseError } from "../errors.js";
import { type ParsedSource, ParsedSource as PS } from "../types.js";

/**
 * Parse a local filesystem path.
 */
export const parseLocalPath = (input: string): Effect.Effect<ParsedSource, ParseError> => {
  return Effect.succeed(PS.Local({ original: input, path: input }));
};
