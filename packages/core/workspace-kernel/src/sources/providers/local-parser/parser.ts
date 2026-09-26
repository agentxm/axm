/**
 * Local source parsers.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import type { LocalSourceParams } from "@agentxm/extension-model/unstable/sources/types";

/**
 * Parse a local filesystem path.
 */
export const parseLocalPath = (input: string): Effect.Effect<LocalSourceParams> => {
  return Effect.succeed({ type: "local" as const, path: input });
};
