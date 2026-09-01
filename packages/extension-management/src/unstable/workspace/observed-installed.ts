import * as Effect from "effect/Effect";
import type { AppError } from "../app-error/index.js";
import type { InstallableExtensionType } from "./installable-types.js";
import type { WorkspaceMutationsService } from "./service-interface.js";

/**
 * Determine installation from the observable workspace inventory. Lock
 * presence is intentionally irrelevant.
 */
export const isObservedInstalled = (
  workspace: WorkspaceMutationsService,
  type: InstallableExtensionType,
  name: string,
): Effect.Effect<boolean, AppError> =>
  workspace.records
    .getExtensionInventory(type, {})
    .pipe(
      Effect.map((inventory) =>
        inventory.items.some((item) => item.name === name && item.installed),
      ),
    );
