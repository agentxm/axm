import * as Effect from "effect/Effect";
import { makeAppError, type AppError } from "../../app-error/index.js";

export const CONFIGURED_ENTRY_RESOLUTION_TIMEOUT = "2 seconds";

export const withConfiguredEntryResolutionTimeout =
  (source: string) =>
  <A, R>(effect: Effect.Effect<A, AppError, R>) =>
    effect.pipe(
      Effect.timeoutOrElse({
        duration: CONFIGURED_ENTRY_RESOLUTION_TIMEOUT,
        orElse: () =>
          Effect.fail(
            makeAppError({
              code: "CONFIGURED_ENTRY_RESOLUTION_TIMEOUT",
              what: "Timed out while resolving a configured extension source",
              details: [`Source: ${source}`],
            }),
          ),
      }),
    );
