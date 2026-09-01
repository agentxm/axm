import * as Effect from "effect/Effect";
import { ExtensionLifecycleFailed } from "./errors.js";

export const CONFIGURED_ENTRY_RESOLUTION_TIMEOUT = "2 seconds";

export const withConfiguredEntryResolutionTimeout =
  (_source: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.timeoutOrElse({
        duration: CONFIGURED_ENTRY_RESOLUTION_TIMEOUT,
        orElse: () =>
          Effect.fail(
            new ExtensionLifecycleFailed({
              category: "network",
              detail: "Timed out while resolving a configured extension source",
            }),
          ),
      }),
    );
