/**
 * Hook-backed implementation of the workspace-state
 * `ConfiguredAgentOutcomesProvider` port.
 *
 * The plan pipeline consumes the port; the hook manager owns the effective
 * per-agent outcome facts. Only the composition root sees both, so the
 * application wires this layer over the manager, supplying its own failure
 * serialization so plan resolutions embed byte-identical step failures on
 * either side of the seam.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  ConfiguredAgentOutcomesProvider,
  ConfiguredAgentOutcomesUnavailable,
} from "@agentxm/workspace-state";
import { LifecycleFailureAdapter } from "../failure-adapter.js";
import { HookManager } from "@agentxm/extension-workspace";

export const HookConfiguredAgentOutcomesProviderLive = Layer.effect(
  ConfiguredAgentOutcomesProvider,
  Effect.gen(function* () {
    const adapter = yield* LifecycleFailureAdapter;
    const hookManager = yield* HookManager;
    const configuredAgentOutcomes = hookManager.configuredAgentOutcomes;
    if (configuredAgentOutcomes === undefined) {
      return { byExtensionType: {} };
    }
    return {
      byExtensionType: {
        hook: (state: "projected" | "current") =>
          configuredAgentOutcomes(state).pipe(
            Effect.mapError((failure) => {
              const step = adapter.toStepFailure(failure);
              return new ConfiguredAgentOutcomesUnavailable({
                category: step.category,
                detail: step.detail,
                ...(step.suggestions === undefined ? {} : { suggestions: step.suggestions }),
                ...(step.cause === undefined ? {} : { cause: step.cause }),
              });
            }),
          ),
      },
    };
  }),
);
