/**
 * The bound on how long resolving one configured entry's source may take
 * before the operation reports a network failure instead of waiting.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { ExtensionResolutionFailed } from "./errors.js";

export const CONFIGURED_ENTRY_RESOLUTION_TIMEOUT = "2 seconds";

export const withConfiguredEntryResolutionTimeout =
  (_source: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.timeoutOrElse({
        duration: CONFIGURED_ENTRY_RESOLUTION_TIMEOUT,
        orElse: () =>
          Effect.fail(
            new ExtensionResolutionFailed({
              category: "network",
              detail: "Timed out while resolving a configured extension source",
            }),
          ),
      }),
    );
