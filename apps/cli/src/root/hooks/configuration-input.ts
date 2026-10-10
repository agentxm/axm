import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HookConfigurationValuesSchema } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { makeAppError } from "../../app-error/index.js";

/** JSON literals retain their types; secrets are supplied as symbolic {env: NAME} references. */
export const parseHookConfiguration = (input: string) =>
  Effect.try({
    try: () => JSON.parse(input),
    catch: () => makeAppError({ code: "usage", detail: "--configuration must be a JSON object" }),
  }).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(HookConfigurationValuesSchema)(value, {
        onExcessProperty: "error",
      }),
    ),
    Effect.mapError(() =>
      makeAppError({
        code: "usage",
        detail:
          "Hook extension configuration accepts a JSON object of strings, numbers, booleans, or symbolic {env: NAME} references",
      }),
    ),
  );
