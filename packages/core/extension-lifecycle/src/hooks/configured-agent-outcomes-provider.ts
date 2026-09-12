/**
 * Extension-manager-backed implementation of the workspace-state
 * `ConfiguredAgentOutcomesProvider` port.
 *
 * The plan pipeline consumes the port; extension managers own the effective
 * per-agent outcome facts. Only the composition root sees both, so the
 * application wires this layer over the manager, supplying its own failure
 * serialization so plan resolutions embed byte-identical step failures on
 * either side of the seam.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { NativeWriteAuthority } from "@agentxm/agent-integration";
import {
  ConfiguredAgentOutcomesProvider,
  ConfiguredAgentOutcomesUnavailable,
} from "@agentxm/workspace-state";
import { StepFailureConversion } from "../step-failure-conversion.js";
import { HookManager, McpServerManager } from "@agentxm/extension-materialization";
export const ConfiguredAgentOutcomesProviderLive = Layer.effect(
  ConfiguredAgentOutcomesProvider,
  Effect.gen(function* () {
    const adapter = yield* StepFailureConversion;
    const hookManager = yield* HookManager;
    const mcpServerManager = yield* McpServerManager;
    // The provider's members answer with no requirements of their own, so this
    // layer is the boundary that composes what the manager needs.
    const managerLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, yield* FileSystem.FileSystem),
      Layer.succeed(Path.Path, yield* Path.Path),
      Layer.succeed(HttpClient.HttpClient, yield* HttpClient.HttpClient),
      Layer.succeed(NativeWriteAuthority, yield* NativeWriteAuthority),
    );
    const mapFailure = (failure: Parameters<typeof adapter.toStepFailure>[0]) => {
      const step = adapter.toStepFailure(failure);
      return new ConfiguredAgentOutcomesUnavailable({
        category: step.category,
        detail: step.detail,
        ...(step.suggestions === undefined ? {} : { suggestions: step.suggestions }),
        ...(step.cause === undefined ? {} : { cause: step.cause }),
      });
    };
    const configuredHookOutcomes = hookManager.configuredAgentOutcomes;
    return {
      byExtensionType: {
        ...(configuredHookOutcomes === undefined
          ? {}
          : {
              hook: (state: "projected" | "current") =>
                configuredHookOutcomes(state).pipe(
                  Effect.provide(managerLayer),
                  Effect.mapError(mapFailure),
                ),
            }),
        "mcp-server": (state: "projected" | "current") =>
          mcpServerManager
            .configuredAgentOutcomes(state)
            .pipe(Effect.provide(managerLayer), Effect.mapError(mapFailure)),
      },
    };
  }),
);
