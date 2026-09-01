import * as Effect from "effect/Effect";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { WorkspaceMutationsService, WorkspaceStateReadFailure } from "./service-interface.js";

/**
 * Determine installation from the observable workspace inventory. Lock
 * presence is intentionally irrelevant.
 */
export const isObservedInstalled = (
  workspace: WorkspaceMutationsService,
  type: InstallableExtensionType,
  name: string,
): Effect.Effect<boolean, WorkspaceStateReadFailure> =>
  workspace.records
    .getExtensionInventory(type, {})
    .pipe(
      Effect.map((inventory) =>
        inventory.items.some((item) => item.name === name && item.installed),
      ),
    );
