/**
 * Local source parsers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import type { AppError } from "../../app-error/index.js";
import type { LocalSourceParams } from "../types.js";

/**
 * Parse a local filesystem path.
 */
export const parseLocalPath = (input: string): Effect.Effect<LocalSourceParams, AppError> => {
  return Effect.succeed({ type: "local" as const, path: input });
};
