/** Optional native enrichment for the inventory selected by a query. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  ConfiguredAgentOutcomesProvider,
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  inspectExtensionInventory,
  type ExtensionInventory,
  type ConfiguredAgentOutcomesProviderService,
} from "@agentxm/workspace-kernel/workspace-state";

export const inspectInventory = Effect.fn("Inspection.inspectInventory")(function* (
  inventory: ExtensionInventory,
) {
  const location = yield* WorkspaceLocation;
  const readers = {
    desired: yield* DesiredStateReader,
    settings: yield* SettingsReader,
    locks: yield* LockfileReader,
  };
  const agentIds = yield* readers.settings.configuredAgents;
  const provider: ConfiguredAgentOutcomesProviderService = Option.getOrElse(
    yield* Effect.serviceOption(ConfiguredAgentOutcomesProvider),
    () => ({ byExtensionType: {} }),
  );
  return yield* inspectExtensionInventory(inventory, provider, {
    readers,
    scope: location.scope,
    agentIds,
  });
});
