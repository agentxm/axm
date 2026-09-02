/**
 * Renderer-backed Live for the extension-lifecycle feature's resolution
 * progress port. The feature marks where progress feedback belongs; this
 * boundary owns the spinner mechanism and wording.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { LifecycleResolutionProgress } from "@agentxm/extension-lifecycle";
import { Screen } from "./screen/index.js";

export const LifecycleResolutionProgressLive = Layer.effect(
  LifecycleResolutionProgress,
  Effect.gen(function* () {
    const screen = yield* Screen;
    return {
      withSourceResolution: (effect) =>
        screen.task("Resolving extension sources", () => effect, {
          successMessage: "Resolved extension sources",
        }),
    };
  }),
);
